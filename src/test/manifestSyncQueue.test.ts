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
      revision: 1,
      status: "pending",
      snapshot: { questionIds: [1, 2] },
    });
  });

  it("deduplicates by manifestId and increments only for an incorporated snapshot", () => {
    const queue = new PersistentManifestSyncQueue();
    expect(queue.enqueue("user-a", manifest()).revision).toBe(1);
    expect(queue.enqueue("user-a", manifest()).revision).toBe(1);
    queue.enqueue("user-a", manifest({ currentIndex: 1, updatedAt: 101 }));
    expect(queue.list("user-a")).toHaveLength(1);
    expect(queue.list("user-a")[0]?.revision).toBe(2);
  });

  it("keeps the latest manifest version", () => {
    const queue = new PersistentManifestSyncQueue();
    queue.enqueue("user-a", manifest({ currentIndex: 1, updatedAt: 200 }));
    queue.enqueue("user-a", manifest({ currentIndex: 0, updatedAt: 100 }));
    expect(queue.list("user-a")[0]?.snapshot.currentIndex).toBe(1);
  });

  it("never replaces a queued completed snapshot with a newer active snapshot", () => {
    const queue = new PersistentManifestSyncQueue();
    queue.enqueue(
      "user-a",
      manifest({
        status: "completed",
        currentIndex: 2,
        completedAt: 150,
        updatedAt: 150,
      }),
    );
    queue.enqueue("user-a", manifest({ status: "active", currentIndex: 1, updatedAt: 200 }));
    expect(queue.list("user-a")[0]?.snapshot).toMatchObject({
      status: "completed",
      currentIndex: 2,
    });
  });

  it("survives a reload", () => {
    const queue = new PersistentManifestSyncQueue();
    queue.enqueue("user-a", manifest());
    queue.enqueue("user-a", manifest({ currentIndex: 1, updatedAt: 101 }));
    expect(new PersistentManifestSyncQueue().list("user-a")[0]?.revision).toBe(2);
  });

  it("migrates a legacy queue item without revision to a validated initial revision", () => {
    const queue = new PersistentManifestSyncQueue();
    queue.enqueue("user-a", manifest());
    const key = storageKeys.manifestSyncQueue("user-a");
    const legacy = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<Record<string, unknown>>;
    delete legacy[0]?.revision;
    localStorage.setItem(key, JSON.stringify(legacy));

    expect(new PersistentManifestSyncQueue().list("user-a")[0]?.revision).toBe(1);
    expect(JSON.parse(localStorage.getItem(key) ?? "[]")[0]?.revision).toBe(1);
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
      revision: 1,
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

  it("does not mark snapshot B failed when snapshot A fails in flight in the same millisecond", async () => {
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
    queue.enqueue("user-a", manifest({ currentIndex: 1, updatedAt: 100 }));
    reject({ retryable: true });
    await flushing;
    expect(queue.list("user-a")[0]).toMatchObject({
      revision: 2,
      status: "pending",
      snapshot: { currentIndex: 1, updatedAt: 100 },
    });
  });

  it("keeps snapshot B pending after snapshot A succeeds and syncs B on the next flush", async () => {
    const queue = new PersistentManifestSyncQueue();
    queue.enqueue("user-a", manifest());
    let releaseFirst!: () => void;
    let callCount = 0;
    const remote = vi.fn((snapshot: SessionManifest) => {
      callCount++;
      if (callCount === 1) {
        return new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return Promise.resolve();
    });

    const firstFlush = queue.flush("user-a", remote);
    await vi.waitFor(() => expect(remote).toHaveBeenCalledOnce());
    queue.enqueue("user-a", manifest({ currentIndex: 1, updatedAt: 100 }));
    expect(queue.list("user-a")[0]).toMatchObject({
      revision: 2,
      status: "pending",
      snapshot: { currentIndex: 1, updatedAt: 100 },
    });

    releaseFirst();
    await firstFlush;
    expect(queue.list("user-a")[0]).toMatchObject({
      revision: 2,
      status: "pending",
      snapshot: { currentIndex: 1, updatedAt: 100 },
    });

    await queue.flush("user-a", remote);
    expect(remote).toHaveBeenCalledTimes(2);
    expect(remote.mock.calls[0]?.[0]).toMatchObject({ currentIndex: 0, updatedAt: 100 });
    expect(remote.mock.calls[1]?.[0]).toMatchObject({ currentIndex: 1, updatedAt: 100 });
    expect(queue.list("user-a")).toEqual([]);
  });
});
