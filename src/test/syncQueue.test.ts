import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SYNC_MAX_RETRY_MS,
  PersistentSyncQueue,
  computeRetryDelay,
  type AttemptSyncPayload,
} from "@/data/sync/syncQueue";
import { storageKeys } from "@/data/localStorage";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

const attempt: AttemptRecord = {
  attemptId: "attempt-1",
  questionId: 7,
  timeMs: 500,
  clientCreatedAt: 10,
  sessionMode: "quick",
  result: {
    status: "correct",
    studentAnswerDisplay: "A",
    correctAnswerDisplay: "A",
    normalizedStudentAnswer: "a",
    normalizedCorrectAnswer: "a",
    explanation: "ok",
    diagnosticCode: "match",
    metadata: {},
  },
};

function payload(userId = "user-a", attemptValue = attempt): AttemptSyncPayload {
  return { userId, sessionId: "session-1", attempt: attemptValue };
}

describe("persistent attempt sync queue", () => {
  beforeEach(() => localStorage.clear());

  it("deduplicates by attemptId", () => {
    const queue = new PersistentSyncQueue();
    queue.enqueue(payload());
    queue.enqueue(payload());
    expect(queue.list("user-a")).toHaveLength(1);
  });

  it("persists and survives a new queue instance", () => {
    new PersistentSyncQueue().enqueue(payload());
    expect(new PersistentSyncQueue().list("user-a")[0]?.attemptId).toBe("attempt-1");
  });

  it("persists, reloads, and synchronizes a skipped attempt without discarding it", async () => {
    const skippedAttempt: AttemptRecord = {
      ...attempt,
      attemptId: "attempt-skipped",
      result: { ...attempt.result, status: "skipped" },
    };
    new PersistentSyncQueue().enqueue(payload("user-a", skippedAttempt));

    expect(localStorage.getItem(storageKeys.syncQueue("user-a"))).toContain('"skipped"');
    const reloaded = new PersistentSyncQueue();
    expect(reloaded.list("user-a")[0]?.payload.attempt.result.status).toBe("skipped");

    const remote = vi.fn(async () => undefined);
    await reloaded.flush("user-a", remote);
    expect(remote).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: expect.objectContaining({
          attemptId: "attempt-skipped",
          result: expect.objectContaining({ status: "skipped" }),
        }),
      }),
    );
    expect(reloaded.list("user-a")).toEqual([]);
  });

  it("isolates queues by user", () => {
    const queue = new PersistentSyncQueue();
    queue.enqueue(payload("user-a"));
    queue.enqueue(payload("user-b", { ...attempt, attemptId: "attempt-b", questionId: 8 }));
    expect(queue.list("user-a").map((item) => item.attemptId)).toEqual(["attempt-1"]);
    expect(queue.list("user-b").map((item) => item.attemptId)).toEqual(["attempt-b"]);
  });

  it("discards invalid JSON safely", () => {
    localStorage.setItem(storageKeys.syncQueue("user-a"), "{bad");
    expect(new PersistentSyncQueue().list("user-a")).toEqual([]);
    expect(localStorage.getItem(storageKeys.syncQueue("user-a"))).toBeNull();
  });

  it("reports quota failures", () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new DOMException("full", "QuotaExceededError");
      }),
      removeItem: vi.fn(),
    };
    const queue = new PersistentSyncQueue({ storage });
    expect(() => queue.enqueue(payload())).toThrow(/salvar os dados locais/);
  });

  it("does not remove an item before remote confirmation", async () => {
    const queue = new PersistentSyncQueue({ now: () => 100 });
    queue.enqueue(payload());
    let release!: () => void;
    const remote = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const flushing = queue.flush("user-a", remote);
    await Promise.resolve();
    expect(queue.list("user-a")[0]?.status).toBe("syncing");
    release();
    await flushing;
    expect(queue.list("user-a")).toEqual([]);
  });

  it("increments retryCount after a failure", async () => {
    const queue = new PersistentSyncQueue({ now: () => 100 });
    queue.enqueue(payload());
    await queue.flush("user-a", async () => {
      throw { retryable: true };
    });
    expect(queue.list("user-a")[0]).toMatchObject({
      status: "failed",
      retryCount: 1,
      nextRetryAt: 1_100,
    });
  });

  it("caps exponential backoff", () => {
    expect(computeRetryDelay(100)).toBe(DEFAULT_SYNC_MAX_RETRY_MS);
  });

  it("keeps permanent failures for manual inspection without an automatic loop", async () => {
    const queue = new PersistentSyncQueue({ now: () => 100 });
    queue.enqueue(payload());
    await queue.flush("user-a", async () => {
      throw { retryable: false };
    });
    expect(queue.list("user-a")[0]?.nextRetryAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("an online event triggers a forced flush", async () => {
    const queue = new PersistentSyncQueue({ onlineTarget: window });
    queue.enqueue(payload());
    const remote = vi.fn(async () => undefined);
    const unregister = queue.registerOnlineFlush("user-a", remote);
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(remote).toHaveBeenCalledTimes(1));
    unregister();
    expect(queue.list("user-a")).toEqual([]);
  });

  it("coalesces two concurrent flushes for the same user", async () => {
    const queue = new PersistentSyncQueue();
    queue.enqueue(payload());
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
    expect(remote).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
  });

  it("does not retry before nextRetryAt unless flush is forced", async () => {
    let now = 100;
    const queue = new PersistentSyncQueue({ now: () => now });
    queue.enqueue(payload());
    const remote = vi.fn(async () => {
      throw { retryable: true };
    });
    await queue.flush("user-a", remote);
    now = 500;
    await queue.flush("user-a", remote);
    expect(remote).toHaveBeenCalledTimes(1);
    await queue.flush("user-a", remote, true);
    expect(remote).toHaveBeenCalledTimes(2);
  });
});
