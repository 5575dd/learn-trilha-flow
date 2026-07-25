import { describe, expect, it } from "vitest";
import type { AttemptEntry } from "@/data/repositories/AttemptRepository";
import { consolidateAttempts } from "@/domain/attempts/consolidateAttempts";

function entry(
  source: "local" | "remote",
  overrides: Partial<AttemptEntry["attempt"]> = {},
): AttemptEntry {
  return {
    userId: "user-a",
    sessionId: "session-1",
    attempt: {
      attemptId: "attempt-1",
      questionId: 1,
      clientCreatedAt: source === "local" ? 2 : 1,
      timeMs: 100,
      result: {
        status: "correct",
        studentAnswerDisplay: "",
        correctAnswerDisplay: "",
        normalizedStudentAnswer: "",
        normalizedCorrectAnswer: "",
        explanation: "",
        diagnosticCode: "",
        metadata: {},
      },
      ...overrides,
    },
  };
}

describe("attempt consolidation", () => {
  it("combines local and remote attempts chronologically", () => {
    const result = consolidateAttempts({
      expectedUserId: "user-a",
      local: [entry("local", { attemptId: "local" })],
      remote: [entry("remote", { attemptId: "remote" })],
    });
    expect(result.entries.map((item) => item.attempt.attemptId)).toEqual(["remote", "local"]);
  });

  it("does not duplicate statistics for the same attemptId", () => {
    const shared = entry("local", { clientCreatedAt: 1 });
    const result = consolidateAttempts({
      expectedUserId: "user-a",
      local: [shared],
      remote: [{ ...shared, attempt: { ...shared.attempt } }],
    });
    expect(result.entries).toHaveLength(1);
    expect(result.conflicts).toEqual([]);
  });

  it("keeps local data and reports a safe payload conflict", () => {
    const local = entry("local", { timeMs: 200 });
    const result = consolidateAttempts({
      expectedUserId: "user-a",
      local: [local],
      remote: [entry("remote", { clientCreatedAt: 2, timeMs: 100 })],
    });
    expect(result.entries[0]?.attempt.timeMs).toBe(200);
    expect(result.conflicts).toEqual([{ attemptId: "attempt-1", code: "payload_conflict" }]);
  });

  it("rejects entries outside the requested user or session scope", () => {
    const wrong = { ...entry("local"), userId: "user-b" };
    const result = consolidateAttempts({
      expectedUserId: "user-a",
      expectedSessionId: "session-1",
      local: [wrong],
      remote: [],
    });
    expect(result.entries).toEqual([]);
    expect(result.conflicts[0]?.code).toBe("scope_conflict");
  });

  it("orders legacy attempts before timestamped attempts while preserving legacy order", () => {
    const result = consolidateAttempts({
      expectedUserId: "user-a",
      local: [
        entry("local", { attemptId: "legacy-first", clientCreatedAt: undefined }),
        entry("local", { attemptId: "legacy-second", clientCreatedAt: undefined }),
        entry("local", { attemptId: "recent", clientCreatedAt: 10 }),
      ],
      remote: [],
    });
    expect(result.entries.map(({ attempt }) => attempt.attemptId)).toEqual([
      "legacy-first",
      "legacy-second",
      "recent",
    ]);
  });
});
