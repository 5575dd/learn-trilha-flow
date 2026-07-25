import { LocalPersistenceError, storageKeys } from "@/data/localStorage";
import { isSessionManifest, type SessionManifest } from "@/domain/session/sessionManifest";
import { computeRetryDelay, type SyncFailure } from "@/data/sync/syncQueue";

export type ManifestSyncStatus = "pending" | "syncing" | "failed";

export interface ManifestSyncItem {
  userId: string;
  manifestId: string;
  snapshot: SessionManifest;
  operation: "upsert";
  status: ManifestSyncStatus;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  nextRetryAt: number;
  error?: string;
}

export interface ManifestQueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ManifestSyncQueueOptions {
  storage?: ManifestQueueStorage | null;
  now?: () => number;
  baseRetryMs?: number;
  maxRetryMs?: number;
  onlineTarget?: Pick<Window, "addEventListener" | "removeEventListener"> | null;
}

const STALE_SYNC_LOCK_MS = 30_000;

function defaultStorage(): ManifestQueueStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function defaultOnlineTarget(): Pick<Window, "addEventListener" | "removeEventListener"> | null {
  return typeof window === "undefined" ? null : window;
}

function sameQuestionIds(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function cloneSnapshot(snapshot: SessionManifest): SessionManifest {
  return {
    ...snapshot,
    source: { ...snapshot.source },
    criteria: { ...snapshot.criteria },
    questionIds: Object.freeze([...snapshot.questionIds]),
  };
}

function isManifestQueueItem(value: unknown, userId: string): value is ManifestSyncItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ManifestSyncItem>;
  return (
    item.userId === userId &&
    typeof item.manifestId === "string" &&
    item.manifestId.length > 0 &&
    isSessionManifest(item.snapshot) &&
    item.snapshot.userId === userId &&
    item.snapshot.id === item.manifestId &&
    item.operation === "upsert" &&
    ["pending", "syncing", "failed"].includes(item.status ?? "") &&
    Number.isSafeInteger(item.retryCount) &&
    (item.retryCount ?? -1) >= 0 &&
    typeof item.createdAt === "number" &&
    typeof item.updatedAt === "number" &&
    typeof item.nextRetryAt === "number" &&
    (item.error === undefined || typeof item.error === "string")
  );
}

function isRetryable(error: unknown): boolean {
  return !(
    error &&
    typeof error === "object" &&
    "retryable" in error &&
    (error as SyncFailure).retryable === false
  );
}

function sanitizedError(error: unknown): string {
  return isRetryable(error)
    ? "A sessão será sincronizada novamente."
    : "A sincronização da sessão foi rejeitada.";
}

export class PersistentManifestSyncQueue {
  private readonly storage: ManifestQueueStorage | null;
  private readonly now: () => number;
  private readonly baseRetryMs: number;
  private readonly maxRetryMs: number;
  private readonly onlineTarget: Pick<Window, "addEventListener" | "removeEventListener"> | null;
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly persistenceFailures = new Set<string>();

  constructor(options: ManifestSyncQueueOptions = {}) {
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.now = options.now ?? Date.now;
    this.baseRetryMs = options.baseRetryMs ?? 1_000;
    this.maxRetryMs = options.maxRetryMs ?? 5 * 60 * 1000;
    this.onlineTarget =
      options.onlineTarget === undefined ? defaultOnlineTarget() : options.onlineTarget;
  }

  enqueue(userId: string, snapshot: SessionManifest): ManifestSyncItem {
    if (!isSessionManifest(snapshot) || snapshot.userId !== userId) {
      throw new Error("Manifest inválido para sincronização.");
    }
    const items = this.read(userId);
    const existing = items.find((item) => item.manifestId === snapshot.id);
    if (existing && !sameQuestionIds(existing.snapshot.questionIds, snapshot.questionIds)) {
      throw new Error("Os IDs congelados da sessão não podem ser alterados.");
    }
    if (existing && snapshot.updatedAt < existing.snapshot.updatedAt) return this.clone(existing);

    const now = this.now();
    const item: ManifestSyncItem = existing
      ? {
          ...existing,
          snapshot: cloneSnapshot(snapshot),
          status: "pending",
          updatedAt: now,
          nextRetryAt: now,
          error: undefined,
        }
      : {
          userId,
          manifestId: snapshot.id,
          snapshot: cloneSnapshot(snapshot),
          operation: "upsert",
          status: "pending",
          retryCount: 0,
          createdAt: now,
          updatedAt: now,
          nextRetryAt: now,
        };
    this.persist(
      userId,
      existing
        ? items.map((candidate) => (candidate.manifestId === item.manifestId ? item : candidate))
        : [...items, item],
    );
    this.persistenceFailures.delete(userId);
    return this.clone(item);
  }

  list(userId: string): ManifestSyncItem[] {
    return this.read(userId).map((item) => this.clone(item));
  }

  hasPending(userId: string, manifestId: string): boolean {
    return this.read(userId).some((item) => item.manifestId === manifestId);
  }

  reportPersistenceFailure(userId: string): void {
    this.persistenceFailures.add(userId);
    this.emit(userId);
  }

  clearPersistenceFailure(userId: string): void {
    if (this.persistenceFailures.delete(userId)) this.emit(userId);
  }

  hasPersistenceFailure(userId: string): boolean {
    return this.persistenceFailures.has(userId);
  }

  subscribe(userId: string, listener: () => void): () => void {
    const listeners = this.listeners.get(userId) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(userId, listeners);
    const storageHandler = (event: Event) => {
      if (
        !("key" in event) ||
        (event as StorageEvent).key === storageKeys.manifestSyncQueue(userId)
      ) {
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

  registerOnlineFlush(
    userId: string,
    synchronize: (snapshot: SessionManifest) => Promise<void>,
  ): () => void {
    if (!this.onlineTarget) return () => undefined;
    const handler = () => void this.flush(userId, synchronize, true);
    this.onlineTarget.addEventListener("online", handler);
    return () => this.onlineTarget?.removeEventListener("online", handler);
  }

  flush(
    userId: string,
    synchronize: (snapshot: SessionManifest) => Promise<void>,
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
    synchronize: (snapshot: SessionManifest) => Promise<void>,
    force: boolean,
  ): Promise<void> {
    const candidates = this.read(userId).filter(
      (item) => item.status !== "syncing" && (force || item.nextRetryAt <= this.now()),
    );
    for (const candidate of candidates) {
      const current = this.read(userId).find((item) => item.manifestId === candidate.manifestId);
      if (!current || current.status === "syncing") continue;
      this.replace(userId, current.manifestId, {
        ...current,
        status: "syncing",
        updatedAt: this.now(),
        error: undefined,
      });
      try {
        await synchronize(cloneSnapshot(current.snapshot));
        this.removeConfirmed(userId, current.manifestId, current.snapshot.updatedAt);
      } catch (error) {
        const latest = this.read(userId).find((item) => item.manifestId === current.manifestId);
        if (!latest || latest.snapshot.updatedAt !== current.snapshot.updatedAt) {
          continue;
        }
        const retryCount = current.retryCount + 1;
        const retryable = isRetryable(error);
        this.replace(userId, current.manifestId, {
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

  private read(userId: string): ManifestSyncItem[] {
    if (!this.storage) return [];
    const key = storageKeys.manifestSyncQueue(userId);
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
        .filter((item): item is ManifestSyncItem => isManifestQueueItem(item, userId))
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
      console.error("[manifest-sync] corrupt queue discarded", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      this.removeCorrupt(key);
      return [];
    }
  }

  private persist(userId: string, items: ManifestSyncItem[]): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(storageKeys.manifestSyncQueue(userId), JSON.stringify(items));
    } catch (error) {
      throw new LocalPersistenceError("write", error);
    }
    this.emit(userId);
  }

  private replace(userId: string, manifestId: string, replacement: ManifestSyncItem): void {
    const items = this.read(userId);
    const index = items.findIndex((item) => item.manifestId === manifestId);
    if (index < 0) return;
    const next = [...items];
    next[index] = replacement;
    this.persist(userId, next);
  }

  private removeConfirmed(userId: string, manifestId: string, syncedVersion: number): void {
    const items = this.read(userId);
    const current = items.find((item) => item.manifestId === manifestId);
    if (!current || current.snapshot.updatedAt !== syncedVersion) return;
    this.persist(
      userId,
      items.filter((item) => item.manifestId !== manifestId),
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

  private clone(item: ManifestSyncItem): ManifestSyncItem {
    return { ...item, snapshot: cloneSnapshot(item.snapshot) };
  }

  private emit(userId: string): void {
    this.listeners.get(userId)?.forEach((listener) => listener());
  }
}

export const manifestSyncQueue = new PersistentManifestSyncQueue();
