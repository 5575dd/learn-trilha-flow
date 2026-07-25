import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearTransientInterfaceStorage, storageKeys } from "@/data/localStorage";
import { PersistentManifestSyncQueue } from "@/data/sync/manifestSyncQueue";
import type { SessionManifest } from "@/domain/session/sessionManifest";

function manifest(overrides: Partial<SessionManifest> = {}): SessionManifest {
  return {
    schemaVersion: 1,
    id: "manifest-1",
    userId: "user-a",
    source: { kind: "quick" },
    criteria: {},
    questionIds: Object.freeze([1, 2]),
    status: "created",
    currentIndex: 0,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

describe("persistent manifest sync queue", () => {
  beforeEach(() => localStorage.clear());

  it("persists a complete manifest snapshot", () => {
    const queue = new PersistentManifestSyncQueue();
    queue.enqueue("user-a", manifest());
    expect(queue.list("user-a")[0]).toMatchObject({
      manifestId: "manifest-1",
      operation: "upsert",
      status: "pending",
      snapshot: { questionIds: [1, 2] },
    });
  });

  it("deduplicates by manifestId", () => {
    const queue = new PersistentManifestSyncQueue();
    queue.enqueue("user-a", manifest());
    queue.enqueue("user-a", manifest({ currentIndex: 1, updatedAt: 101 }));
    expect(queue.list("user-a")).toHaveLength(1);
  });

  it("keeps the latest manifest version", () => {
    const queue = new PersistentManifestSyncQueue();
    queue.enqueue("user-a", manifest({ currentIndex: 1, updatedAt: 200 }));
    queue.enqueue("user-a", manifest({ currentIndex: 0, updatedAt: 100 }));
    expect(queue.list("user-a")[0]?.snapshot.currentIndex).toBe(1);
  });

  it("survives a reload", () => {
    new PersistentManifestSyncQueue().enqueue("user-a", manifest());
    expect(new PersistentManifestSyncQueue().list("user-a")).toHaveLength(1);
  });

  it("discards invalid JSON safely", () => {
    localStorage.setItem(storageKeys.manifestSyncQueue("user-a"), "{bad");
    expect(new PersistentManifestSyncQueue().list("user-a")).toEqual([]);
    expect(localStorage.getItem(storageKeys.manifestSyncQueue("user-a"))).toBeNull();
  });

  it("reports quota failures", () => {
    const queue = new PersistentManifestSyncQueue({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("full", "QuotaExceededError");
        },
        removeItem: vi.fn(),
      },
    });
    expect(() => queue.enqueue("user-a", manifest())).toThrow(/salvar os dados locais/);
  });

  it("uses bounded backoff after a retryable failure", async () => {
    const queue = new PersistentManifestSyncQueue({ now: () => 100 });
    queue.enqueue("user-a", manifest());
    await queue.flush("user-a", async () => {
      throw { retryable: true };
    });
    expect(queue.list("user-a")[0]).toMatchObject({
      status: "failed",
      retryCount: 1,
      nextRetryAt: 1_100,
    });
  });

  it("flushes on the online event", async () => {
    const queue = new PersistentManifestSyncQueue({ onlineTarget: window });
    queue.enqueue("user-a", manifest());
    const remote = vi.fn(async () => undefined);
    const unregister = queue.registerOnlineFlush("user-a", remote);
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(remote).toHaveBeenCalledOnce());
    expect(queue.list("user-a")).toEqual([]);
    unregister();
  });

  it("coalesces concurrent flushes per user", async () => {
    const queue = new PersistentManifestSyncQueue();
    queue.enqueue("user-a", manifest());
    let release!: () => void;
    const remote = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const first = queue.flush("user-a", remote);
    const second = queue.flush("user-a", remote);
    expect(second).toBe(first);
    await Promise.resolve();
    expect(remote).toHaveBeenCalledOnce();
    release();
    await Promise.all([first, second]);
  });

  it("does not remove a manifest before remote confirmation", async () => {
    const queue = new PersistentManifestSyncQueue();
    queue.enqueue("user-a", manifest());
    let release!: () => void;
    const flushing = queue.flush(
      "user-a",
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await Promise.resolve();
    expect(queue.list("user-a")[0]?.status).toBe("syncing");
    release();
    await flushing;
    expect(queue.list("user-a")).toEqual([]);
  });

  it("preserves the queue when transient logout storage is cleared", () => {
    const queue = new PersistentManifestSyncQueue();
    queue.enqueue("user-a", manifest());
    sessionStorage.setItem("trilha.temporary", "value");
    clearTransientInterfaceStorage();
    expect(queue.list("user-a")).toHaveLength(1);
  });

  it("rejects attempts to change frozen questionIds", () => {
    const queue = new PersistentManifestSyncQueue();
    queue.enqueue("user-a", manifest());
    expect(() =>
      queue.enqueue("user-a", manifest({ questionIds: Object.freeze([2, 1]), updatedAt: 200 })),
    ).toThrow(/IDs congelados/);
  });

  it("preserves a newer version queued while an older version is syncing", async () => {
    const queue = new PersistentManifestSyncQueue();
    queue.enqueue("user-a", manifest());
    let reject!: (reason: unknown) => void;
    const flushing = queue.flush(
      "user-a",
      () =>
        new Promise<void>((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    await Promise.resolve();
    queue.enqueue("user-a", manifest({ currentIndex: 1, updatedAt: 200 }));
    reject({ retryable: true });
    await flushing;
    expect(queue.list("user-a")[0]).toMatchObject({
      status: "pending",
      snapshot: { currentIndex: 1, updatedAt: 200 },
    });
  });
});
