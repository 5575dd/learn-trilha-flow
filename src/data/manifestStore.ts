import { readLocal, removeLocal, storageKeys, writeLocal } from "@/data/localStorage";
import {
  SESSION_MANIFEST_SCHEMA_VERSION,
  isSessionManifest,
  type CreateSessionManifestInput,
  type SessionManifest,
} from "@/domain/session/sessionManifest";

export interface ManifestStore {
  create(input: CreateSessionManifestInput): SessionManifest;
  get(userId: string, manifestId: string): SessionManifest | null;
  update(
    userId: string,
    manifestId: string,
    changes: { currentIndex?: number },
  ): SessionManifest | null;
  listByUser(userId: string): SessionManifest[];
  markActive(userId: string, manifestId: string): SessionManifest | null;
  markCompleted(userId: string, manifestId: string): SessionManifest | null;
  abandon(userId: string, manifestId: string): SessionManifest | null;
  remove(userId: string, manifestId: string): void;
  findRecoverable(userId: string): SessionManifest | null;
  subscribe(userId: string, listener: () => void): () => void;
}

export interface LocalManifestStoreOptions {
  now?: () => number;
  createId?: () => string;
}

function defaultId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `manifest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class LocalManifestStore implements ManifestStore {
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(options: LocalManifestStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? defaultId;
  }

  create(input: CreateSessionManifestInput): SessionManifest {
    const questionIds = Object.freeze(uniqueValidIds(input.questionIds));
    const now = this.now();
    const manifest: SessionManifest = {
      schemaVersion: SESSION_MANIFEST_SCHEMA_VERSION,
      id: this.createId(),
      userId: input.userId,
      source: input.source,
      criteria: input.criteria ?? {},
      questionIds,
      status: "created",
      currentIndex: 0,
      createdAt: now,
      updatedAt: now,
    };
    const manifests = this.listByUser(input.userId);
    const existing = manifests.find((item) => item.id === manifest.id);
    if (existing) return existing;
    this.persist(input.userId, [...manifests, manifest]);
    return manifest;
  }

  get(userId: string, manifestId: string): SessionManifest | null {
    return this.listByUser(userId).find((manifest) => manifest.id === manifestId) ?? null;
  }

  update(
    userId: string,
    manifestId: string,
    changes: { currentIndex?: number },
  ): SessionManifest | null {
    return this.change(userId, manifestId, (manifest) => {
      const currentIndex =
        changes.currentIndex === undefined
          ? manifest.currentIndex
          : Math.min(Math.max(0, changes.currentIndex), manifest.questionIds.length);
      if (currentIndex === manifest.currentIndex) return manifest;
      return { ...manifest, currentIndex, updatedAt: this.now() };
    });
  }

  listByUser(userId: string): SessionManifest[] {
    const key = storageKeys.manifests(userId);
    const raw = readLocal(key);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        removeLocal(key);
        return [];
      }
      const valid = parsed.filter(
        (manifest): manifest is SessionManifest =>
          isSessionManifest(manifest) && manifest.userId === userId,
      );
      if (valid.length !== parsed.length) this.persist(userId, valid);
      return valid.map((manifest) => ({
        ...manifest,
        questionIds: Object.freeze([...manifest.questionIds]),
      }));
    } catch (error) {
      console.error("[manifest] corrupt store discarded", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      removeLocal(key);
      return [];
    }
  }

  markActive(userId: string, manifestId: string): SessionManifest | null {
    return this.change(userId, manifestId, (manifest) => {
      if (manifest.status !== "created") return manifest;
      return { ...manifest, status: "active", updatedAt: this.now() };
    });
  }

  markCompleted(userId: string, manifestId: string): SessionManifest | null {
    return this.change(userId, manifestId, (manifest) => {
      if (manifest.status === "completed") return manifest;
      const now = this.now();
      return {
        ...manifest,
        status: "completed",
        currentIndex: manifest.questionIds.length,
        updatedAt: now,
        completedAt: now,
      };
    });
  }

  abandon(userId: string, manifestId: string): SessionManifest | null {
    return this.change(userId, manifestId, (manifest) => {
      if (manifest.status === "completed" || manifest.status === "abandoned") return manifest;
      return { ...manifest, status: "abandoned", updatedAt: this.now() };
    });
  }

  remove(userId: string, manifestId: string): void {
    const manifests = this.listByUser(userId);
    const next = manifests.filter((manifest) => manifest.id !== manifestId);
    if (next.length !== manifests.length) this.persist(userId, next);
  }

  findRecoverable(userId: string): SessionManifest | null {
    return (
      this.listByUser(userId)
        .filter(
          (manifest) =>
            (manifest.status === "created" || manifest.status === "active") &&
            manifest.questionIds.length > 0,
        )
        .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
    );
  }

  subscribe(userId: string, listener: () => void): () => void {
    if (typeof window === "undefined") return () => undefined;
    const key = storageKeys.manifests(userId);
    const handler = (event: StorageEvent) => {
      if (event.key === key) listener();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }

  private change(
    userId: string,
    manifestId: string,
    updater: (manifest: SessionManifest) => SessionManifest,
  ): SessionManifest | null {
    const manifests = this.listByUser(userId);
    const index = manifests.findIndex((manifest) => manifest.id === manifestId);
    if (index < 0) return null;
    const current = manifests[index];
    const nextManifest = updater(current);
    if (nextManifest === current) return current;
    const next = [...manifests];
    next[index] = nextManifest;
    this.persist(userId, next);
    return nextManifest;
  }

  private persist(userId: string, manifests: SessionManifest[]): void {
    writeLocal(storageKeys.manifests(userId), JSON.stringify(manifests));
  }
}

function uniqueValidIds(ids: readonly number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
}

export const manifestStore = new LocalManifestStore();
