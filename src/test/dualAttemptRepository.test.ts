import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryAttemptRepository } from "@/data/repositories/AttemptRepository";
import { DualAttemptRepository } from "@/data/repositories/DualAttemptRepository";
import type { SupabaseAttemptRepository } from "@/data/repositories/SupabaseAttemptRepository";
import { PersistentSyncQueue } from "@/data/sync/syncQueue";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

const attempt: AttemptRecord = {
  attemptId: "attempt-1",
  questionId: 3,
  timeMs: 250,
  result: {
    status: "incorrect",
    studentAnswerDisplay: "B",
    correctAnswerDisplay: "A",
    normalizedStudentAnswer: "b",
    normalizedCorrectAnswer: "a",
    explanation: "Tente novamente.",
    diagnosticCode: "mismatch",
    metadata: {},
  },
};

function remote(saveRemote: ReturnType<typeof vi.fn>) {
  return { saveRemote } as unknown as SupabaseAttemptRepository;
}

describe("DualAttemptRepository", () => {
  beforeEach(() => localStorage.clear());

  it("uses local storage only when writes are disabled", async () => {
    const local = new InMemoryAttemptRepository();
    const saveRemote = vi.fn();
    const queue = new PersistentSyncQueue();
    const repository = new DualAttemptRepository(local, remote(saveRemote), queue, {
      writesEnabled: false,
    });

    await repository.save("user-a", "session-1", attempt);

    expect(await local.load("user-a", "session-1")).toEqual([attempt]);
    expect(queue.list("user-a")).toEqual([]);
    expect(saveRemote).not.toHaveBeenCalled();
  });

  it("saves locally first and synchronizes when writes are enabled", async () => {
    const local = new InMemoryAttemptRepository();
    const saveRemote = vi.fn(async () => ({
      inserted: true,
      alreadyExisted: false,
      nextReviewAt: null,
    }));
    const queue = new PersistentSyncQueue();
    const repository = new DualAttemptRepository(local, remote(saveRemote), queue);

    await repository.save("user-a", "session-1", attempt);
    expect(await local.load("user-a", "session-1")).toEqual([attempt]);
    await repository.flush("user-a", true);

    expect(saveRemote).toHaveBeenCalledWith("user-a", "session-1", attempt);
    expect(queue.list("user-a")).toEqual([]);
  });

  it("does not lose the local attempt when the remote is offline", async () => {
    const local = new InMemoryAttemptRepository();
    const saveRemote = vi.fn(async () => {
      throw { retryable: true };
    });
    const queue = new PersistentSyncQueue({ now: () => 100 });
    const repository = new DualAttemptRepository(local, remote(saveRemote), queue);

    await repository.save("user-a", "session-1", attempt);
    await repository.flush("user-a", true);

    expect(await local.load("user-a", "session-1")).toEqual([attempt]);
    expect(queue.list("user-a")[0]).toMatchObject({ status: "failed", retryCount: 1 });
  });

  it("treats an idempotent remote duplicate as success", async () => {
    const local = new InMemoryAttemptRepository();
    const saveRemote = vi.fn(async () => ({
      inserted: false,
      alreadyExisted: true,
      nextReviewAt: null,
    }));
    const queue = new PersistentSyncQueue();
    const repository = new DualAttemptRepository(local, remote(saveRemote), queue);

    await repository.save("user-a", "session-1", attempt);
    await repository.flush("user-a", true);

    expect(queue.list("user-a")).toEqual([]);
    expect(await local.load("user-a", "session-1")).toHaveLength(1);
  });

  it("keeps the local response when queue persistence is unavailable", async () => {
    const local = new InMemoryAttemptRepository();
    const saveRemote = vi.fn();
    const queue = new PersistentSyncQueue({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("full", "QuotaExceededError");
        },
        removeItem: () => undefined,
      },
    });
    const repository = new DualAttemptRepository(local, remote(saveRemote), queue);

    await expect(repository.save("user-a", "session-1", attempt)).resolves.toBeUndefined();
    expect(await local.load("user-a", "session-1")).toEqual([attempt]);
    expect(queue.hasPersistenceFailure("user-a")).toBe(true);
    expect(saveRemote).not.toHaveBeenCalled();
  });
});
