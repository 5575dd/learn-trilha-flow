import { describe, it, expect } from "vitest";
import { InMemoryAttemptRepository } from "@/data/repositories/AttemptRepository";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

const a: AttemptRecord = {
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

describe("InMemoryAttemptRepository", () => {
  it("dedupes attemptId", async () => {
    const repo = new InMemoryAttemptRepository();
    await repo.save("s1", a);
    await repo.save("s1", a);
    const list = await repo.load("s1");
    expect(list).toHaveLength(1);
  });
  it("clears cleanly", async () => {
    const repo = new InMemoryAttemptRepository();
    await repo.save("s2", a);
    await repo.clear("s2");
    expect(await repo.load("s2")).toEqual([]);
  });
});
