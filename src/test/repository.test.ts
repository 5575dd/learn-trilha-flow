import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryAttemptRepository,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  clearSessionSnapshot,
  loadSessionSnapshot,
  saveSessionSnapshot,
  type SessionSnapshot,
} from "@/data/repositories/AttemptRepository";
import { clearTransientUserStorage, storageKeys } from "@/data/localStorage";
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
  beforeEach(() => localStorage.clear());

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

  it("logout cleanup removes only the current user's transient data", () => {
    localStorage.setItem(storageKeys.snapshot("user-a", 7), "{}");
    localStorage.setItem(storageKeys.attempts("user-a", "s"), "[]");
    localStorage.setItem(storageKeys.snapshot("user-b", 7), "{}");
    clearTransientUserStorage("user-a");
    expect(localStorage.getItem(storageKeys.snapshot("user-a", 7))).toBeNull();
    expect(localStorage.getItem(storageKeys.attempts("user-a", "s"))).toBeNull();
    expect(localStorage.getItem(storageKeys.snapshot("user-b", 7))).not.toBeNull();
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
