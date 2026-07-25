import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryAttemptRepository,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  clearSessionSnapshot,
  loadSessionSnapshot,
  saveSessionSnapshot,
  type SessionSnapshot,
} from "@/data/repositories/AttemptRepository";
import { clearTransientInterfaceStorage, storageKeys } from "@/data/localStorage";
import { LocalManifestStore } from "@/data/manifestStore";
import { PersistentSyncQueue } from "@/data/sync/syncQueue";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

const attempt: AttemptRecord = {
  attemptId: "a1",
  questionId: 1,
  timeMs: 10,
  result: {
    status: "correct",
    studentAnswerDisplay: "x",
    correctAnswerDisplay: "x",
    normalizedStudentAnswer: "x",
    normalizedCorrectAnswer: "x",
    explanation: "",
    diagnosticCode: "match",
    metadata: {},
  },
};

const snapshot: SessionSnapshot = {
  schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
  userId: "user-a",
  aulaId: 7,
  sessionId: "session-1",
  questionIds: [1, 2],
  currentQuestionId: 1,
  currentIndex: 0,
  updatedAt: 10,
};

describe("local attempt persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("dedupes an attempt ID", async () => {
    const repo = new InMemoryAttemptRepository();
    await repo.save("user-a", "s1", attempt);
    await repo.save("user-a", "s1", attempt);
    expect(await repo.load("user-a", "s1")).toHaveLength(1);
  });

  it("isolates attempts by user", async () => {
    const repo = new InMemoryAttemptRepository();
    await repo.save("user-a", "s1", attempt);
    expect(await repo.load("user-b", "s1")).toEqual([]);
  });

  it("lists all local attempts for one user without mixing users", async () => {
    const repo = new InMemoryAttemptRepository();
    await repo.save("user-a", "s1", attempt);
    await repo.save("user-a", "s2", { ...attempt, attemptId: "a2", questionId: 2 });
    await repo.save("user-b", "s1", { ...attempt, attemptId: "other" });
    expect((await repo.listByUser("user-a")).map((item) => item.attemptId).sort()).toEqual([
      "a1",
      "a2",
    ]);
  });

  it("restart can clear the old session without clearing the new one", async () => {
    const repo = new InMemoryAttemptRepository();
    await repo.save("user-a", "old", attempt);
    await repo.save("user-a", "new", { ...attempt, attemptId: "new" });
    await repo.clear("user-a", "old");
    expect(await repo.load("user-a", "old")).toEqual([]);
    expect(await repo.load("user-a", "new")).toHaveLength(1);
  });

  it("rejects divergent question IDs", () => {
    saveSessionSnapshot(snapshot);
    expect(loadSessionSnapshot({ userId: "user-a", aulaId: 7, questionIds: [1, 3] })).toBeNull();
  });

  it("does not expose a snapshot to another user", () => {
    saveSessionSnapshot(snapshot);
    expect(loadSessionSnapshot({ userId: "user-b", aulaId: 7, questionIds: [1, 2] })).toBeNull();
    expect(localStorage.getItem(storageKeys.snapshot("user-a", 7))).not.toBeNull();
  });

  it("discards invalid JSON without crashing", () => {
    localStorage.setItem(storageKeys.snapshot("user-a", 7), "{bad");
    expect(() =>
      loadSessionSnapshot({ userId: "user-a", aulaId: 7, questionIds: [1, 2] }),
    ).not.toThrow();
    expect(loadSessionSnapshot({ userId: "user-a", aulaId: 7, questionIds: [1, 2] })).toBeNull();
  });

  it("logout preserves durable user data and clears only transient interface state", async () => {
    const attemptRepository = new InMemoryAttemptRepository();
    await attemptRepository.save("user-a", "s", attempt);
    saveSessionSnapshot(snapshot);
    localStorage.setItem(storageKeys.progress("user-a", "course"), '{"completed":1}');

    const queue = new PersistentSyncQueue();
    queue.enqueue({ userId: "user-a", sessionId: "s", attempt });

    const manifests = new LocalManifestStore({
      createId: () => "manifest-a",
      now: () => 10,
    });
    manifests.create({
      userId: "user-a",
      source: { kind: "quick" },
      questionIds: [1, 2],
    });

    sessionStorage.setItem("trilha.ui.study-panel", "open");
    sessionStorage.setItem("other.application", "preserve");

    clearTransientInterfaceStorage();

    const reloadedAttempts = new InMemoryAttemptRepository();
    const reloadedQueue = new PersistentSyncQueue();
    const reloadedManifests = new LocalManifestStore();
    expect(await reloadedAttempts.load("user-a", "s")).toEqual([attempt]);
    expect(reloadedQueue.list("user-a")).toMatchObject([{ attemptId: "a1", status: "pending" }]);
    expect(reloadedManifests.findRecoverable("user-a")?.id).toBe("manifest-a");
    expect(loadSessionSnapshot({ userId: "user-a", aulaId: 7, questionIds: [1, 2] })).toEqual(
      snapshot,
    );
    expect(localStorage.getItem(storageKeys.progress("user-a", "course"))).not.toBeNull();

    expect(await reloadedAttempts.load("user-b", "s")).toEqual([]);
    expect(reloadedQueue.list("user-b")).toEqual([]);
    expect(reloadedManifests.listByUser("user-b")).toEqual([]);

    expect(sessionStorage.getItem("trilha.ui.study-panel")).toBeNull();
    expect(sessionStorage.getItem("other.application")).toBe("preserve");
  });

  it("propagates localStorage write failures", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => saveSessionSnapshot(snapshot)).toThrow(/salvar os dados locais/);
    spy.mockRestore();
  });

  it("clears snapshots explicitly", () => {
    saveSessionSnapshot(snapshot);
    clearSessionSnapshot("user-a", 7);
    expect(localStorage.getItem(storageKeys.snapshot("user-a", 7))).toBeNull();
  });
});
