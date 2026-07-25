import { LocalPersistenceError, storageKeys } from "@/data/localStorage";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

export type SyncQueueStatus = "pending" | "syncing" | "synced" | "failed";

export interface AttemptSyncPayload {
  userId: string;
  sessionId: string;
  attempt: AttemptRecord;
}

export interface SyncQueueItem {
  attemptId: string;
  sessionId: string;
  questionId: number;
  payload: AttemptSyncPayload;
  status: SyncQueueStatus;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  nextRetryAt: number;
  error?: string;
}

export interface SyncQueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SyncFailure {
  retryable?: boolean;
  message?: string;
}

export interface SyncQueueOptions {
  storage?: SyncQueueStorage | null;
  now?: () => number;
  baseRetryMs?: number;
  maxRetryMs?: number;
  onlineTarget?: Pick<Window, "addEventListener" | "removeEventListener"> | null;
}

export const DEFAULT_SYNC_BASE_RETRY_MS = 1_000;
export const DEFAULT_SYNC_MAX_RETRY_MS = 5 * 60 * 1000;
const STALE_SYNC_LOCK_MS = 30_000;

export function computeRetryDelay(
  retryCount: number,
  baseRetryMs = DEFAULT_SYNC_BASE_RETRY_MS,
  maxRetryMs = DEFAULT_SYNC_MAX_RETRY_MS,
): number {
  const exponent = Math.max(0, Math.min(30, retryCount - 1));
  return Math.min(maxRetryMs, baseRetryMs * 2 ** exponent);
}

function defaultStorage(): SyncQueueStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function defaultOnlineTarget(): Pick<Window, "addEventListener" | "removeEventListener"> | null {
  return typeof window === "undefined" ? null : window;
}

function isAttempt(value: unknown): value is AttemptRecord {
  if (!value || typeof value !== "object") return false;
  const attempt = value as Partial<AttemptRecord>;
  const result = attempt.result as Record<string, unknown> | undefined;
  return (
    typeof attempt.attemptId === "string" &&
    attempt.attemptId.length > 0 &&
    Number.isSafeInteger(attempt.questionId) &&
    (attempt.questionId ?? 0) > 0 &&
    typeof attempt.timeMs === "number" &&
    Number.isFinite(attempt.timeMs) &&
    attempt.timeMs >= 0 &&
    !!result &&
    ["correct", "incorrect", "neutral", "invalid"].includes(String(result.status))
  );
}

function isQueueItem(value: unknown, userId: string): value is SyncQueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SyncQueueItem>;
  return (
    typeof item.attemptId === "string" &&
    item.attemptId.length > 0 &&
    typeof item.sessionId === "string" &&
    item.sessionId.length > 0 &&
    Number.isSafeInteger(item.questionId) &&
    !!item.payload &&
    item.payload.userId === userId &&
    item.payload.sessionId === item.sessionId &&
    isAttempt(item.payload.attempt) &&
    item.payload.attempt.attemptId === item.attemptId &&
    item.payload.attempt.questionId === item.questionId &&
    ["pending", "syncing", "synced", "failed"].includes(item.status ?? "") &&
    Number.isSafeInteger(item.retryCount) &&
    (item.retryCount ?? -1) >= 0 &&
    typeof item.createdAt === "number" &&
    typeof item.updatedAt === "number" &&
    typeof item.nextRetryAt === "number" &&
    (item.error === undefined || typeof item.error === "string")
  );
}

function sanitizedError(error: unknown): string {
  if (error && typeof error === "object" && "retryable" in error) {
    return (error as SyncFailure).retryable === false
      ? "A sincronização foi rejeitada."
      : "A sincronização será tentada novamente.";
  }
  return "A sincronização será tentada novamente.";
}

function isRetryable(error: unknown): boolean {
  return !(
    error &&
    typeof error === "object" &&
    "retryable" in error &&
    (error as SyncFailure).retryable === false
  );
}

export class PersistentSyncQueue {
  private readonly storage: SyncQueueStorage | null;
  private readonly now: () => number;
  private readonly baseRetryMs: number;
  private readonly maxRetryMs: number;
  private readonly onlineTarget: Pick<Window, "addEventListener" | "removeEventListener"> | null;
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly persistenceFailures = new Set<string>();

  constructor(options: SyncQueueOptions = {}) {
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.now = options.now ?? Date.now;
    this.baseRetryMs = options.baseRetryMs ?? DEFAULT_SYNC_BASE_RETRY_MS;
    this.maxRetryMs = options.maxRetryMs ?? DEFAULT_SYNC_MAX_RETRY_MS;
    this.onlineTarget =
      options.onlineTarget === undefined ? defaultOnlineTarget() : options.onlineTarget;
  }

  enqueue(payload: AttemptSyncPayload): SyncQueueItem {
    const items = this.read(payload.userId);
    const existing = items.find((item) => item.attemptId === payload.attempt.attemptId);
    if (existing) return existing;
    const now = this.now();
    const item: SyncQueueItem = {
      attemptId: payload.attempt.attemptId,
      sessionId: payload.sessionId,
      questionId: payload.attempt.questionId,
      payload,
      status: "pending",
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      nextRetryAt: now,
    };
    this.persist(payload.userId, [...items, item]);
    this.persistenceFailures.delete(payload.userId);
    return item;
  }

  list(userId: string): SyncQueueItem[] {
    return this.read(userId).map((item) => ({
      ...item,
      payload: {
        ...item.payload,
        attempt: {
          ...item.payload.attempt,
          result: {
            ...item.payload.attempt.result,
            metadata: { ...item.payload.attempt.result.metadata },
          },
        },
      },
    }));
  }

  subscribe(userId: string, listener: () => void): () => void {
    const listeners = this.listeners.get(userId) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(userId, listeners);

    const storageHandler = (event: Event) => {
      if (!("key" in event) || (event as StorageEvent).key === storageKeys.syncQueue(userId)) {
        listener();
      }
    };
    this.onlineTarget?.addEventListener("storage", storageHandler);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(userId);
      this.onlineTarget?.removeEventListener("storage", storageHandler);
    };
  }

  reportPersistenceFailure(userId: string): void {
    this.persistenceFailures.add(userId);
    this.emit(userId);
  }

  hasPersistenceFailure(userId: string): boolean {
    return this.persistenceFailures.has(userId);
  }

  clearPersistenceFailure(userId: string): void {
    if (this.persistenceFailures.delete(userId)) this.emit(userId);
  }

  registerOnlineFlush(
    userId: string,
    synchronize: (payload: AttemptSyncPayload) => Promise<void>,
  ): () => void {
    if (!this.onlineTarget) return () => undefined;
    const handler = () => {
      void this.flush(userId, synchronize, true);
    };
    this.onlineTarget.addEventListener("online", handler);
    return () => this.onlineTarget?.removeEventListener("online", handler);
  }

  flush(
    userId: string,
    synchronize: (payload: AttemptSyncPayload) => Promise<void>,
    force = false,
  ): Promise<void> {
    const running = this.inFlight.get(userId);
    if (running) return running;
    const promise = this.runFlush(userId, synchronize, force).finally(() => {
      this.inFlight.delete(userId);
    });
    this.inFlight.set(userId, promise);
    return promise;
  }

  private async runFlush(
    userId: string,
    synchronize: (payload: AttemptSyncPayload) => Promise<void>,
    force: boolean,
  ): Promise<void> {
    const candidates = this.read(userId).filter(
      (item) =>
        item.status !== "synced" &&
        item.status !== "syncing" &&
        (force || item.nextRetryAt <= this.now()),
    );

    for (const candidate of candidates) {
      const current = this.read(userId).find((item) => item.attemptId === candidate.attemptId);
      if (!current || current.status === "synced" || current.status === "syncing") continue;

      this.replace(userId, current.attemptId, {
        ...current,
        status: "syncing",
        updatedAt: this.now(),
        error: undefined,
      });

      try {
        await synchronize(current.payload);
        this.replace(userId, current.attemptId, {
          ...current,
          status: "synced",
          updatedAt: this.now(),
          error: undefined,
        });
        this.removeConfirmed(userId, current.attemptId);
      } catch (error) {
        const retryCount = current.retryCount + 1;
        const retryable = isRetryable(error);
        this.replace(userId, current.attemptId, {
          ...current,
          status: "failed",
          retryCount,
          updatedAt: this.now(),
          nextRetryAt: retryable
            ? this.now() + computeRetryDelay(retryCount, this.baseRetryMs, this.maxRetryMs)
            : Number.MAX_SAFE_INTEGER,
          error: sanitizedError(error),
        });
      }
    }
  }

  private read(userId: string): SyncQueueItem[] {
    if (!this.storage) return [];
    const key = storageKeys.syncQueue(userId);
    let raw: string | null;
    try {
      raw = this.storage.getItem(key);
    } catch (error) {
      throw new LocalPersistenceError("read", error);
    }
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        this.removeCorrupt(key);
        return [];
      }
      const valid = parsed
        .filter((item): item is SyncQueueItem => isQueueItem(item, userId))
        .map((item) =>
          item.status === "syncing" && item.updatedAt + STALE_SYNC_LOCK_MS <= this.now()
            ? { ...item, status: "pending" as const, updatedAt: this.now() }
            : item,
        );
      if (
        valid.length !== parsed.length ||
        valid.some((item, index) => item.status !== parsed[index]?.status)
      ) {
        this.persist(userId, valid);
      }
      return valid;
    } catch (error) {
      console.error("[sync] corrupt queue discarded", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      this.removeCorrupt(key);
      return [];
    }
  }

  private persist(userId: string, items: SyncQueueItem[]): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(storageKeys.syncQueue(userId), JSON.stringify(items));
    } catch (error) {
      throw new LocalPersistenceError("write", error);
    }
    this.emit(userId);
  }

  private replace(userId: string, attemptId: string, replacement: SyncQueueItem): void {
    const items = this.read(userId);
    const index = items.findIndex((item) => item.attemptId === attemptId);
    if (index < 0) return;
    const next = [...items];
    next[index] = replacement;
    this.persist(userId, next);
  }

  private removeConfirmed(userId: string, attemptId: string): void {
    const items = this.read(userId);
    const item = items.find((candidate) => candidate.attemptId === attemptId);
    if (!item || item.status !== "synced") return;
    this.persist(
      userId,
      items.filter((candidate) => candidate.attemptId !== attemptId),
    );
  }

  private removeCorrupt(key: string): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(key);
    } catch (error) {
      throw new LocalPersistenceError("remove", error);
    }
  }

  private emit(userId: string): void {
    this.listeners.get(userId)?.forEach((listener) => listener());
  }
}

export const attemptSyncQueue = new PersistentSyncQueue();
