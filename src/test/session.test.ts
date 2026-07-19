import { describe, it, expect } from "vitest";
import {
  initialSession,
  sessionReducer,
  computeStats,
  type AttemptRecord,
} from "@/domain/session/sessionReducer";
import type { ValidQuestion } from "@/domain/questions/questionTypes";

const q: ValidQuestion = {
  id: 10,
  aulaId: 1,
  enunciado: "",
  explicacao: "",
  traducao: "",
  sessao: 1,
  ordem: 0,
  kind: "MC",
  options: ["a", "b"],
  canonicalAnswerText: "a",
};

const attempt: AttemptRecord = {
  attemptId: "att-1",
  questionId: 10,
  timeMs: 100,
  result: {
    status: "correct",
    studentAnswerDisplay: "a",
    correctAnswerDisplay: "a",
    normalizedStudentAnswer: "a",
    normalizedCorrectAnswer: "a",
    explanation: "",
    diagnosticCode: "match",
    metadata: {},
  },
};

describe("sessionReducer", () => {
  it("empty question set moves to error", () => {
    const s = sessionReducer(initialSession, { type: "INIT", sessionId: "s1", questions: [] });
    expect(s.phase).toBe("error");
  });
  it("double SUBMIT for same question records only one attempt", () => {
    let s = sessionReducer(initialSession, { type: "INIT", sessionId: "s1", questions: [q] });
    s = sessionReducer(s, { type: "START_ANSWER" });
    s = sessionReducer(s, { type: "SUBMIT", attempt });
    s = sessionReducer(s, { type: "SUBMIT", attempt });
    expect(s.attempts).toHaveLength(1);
    expect(s.phase).toBe("feedback");
  });
  it("NEXT completes when at the last question", () => {
    let s = sessionReducer(initialSession, { type: "INIT", sessionId: "s1", questions: [q] });
    s = sessionReducer(s, { type: "START_ANSWER" });
    s = sessionReducer(s, { type: "SUBMIT", attempt });
    s = sessionReducer(s, { type: "NEXT" });
    expect(s.phase).toBe("completed");
  });
  it("computeStats ignores neutral/invalid/unsupported", () => {
    const stats = computeStats({
      ...initialSession,
      attempts: [
        attempt,
        { ...attempt, attemptId: "2", result: { ...attempt.result, status: "incorrect" } },
        { ...attempt, attemptId: "3", result: { ...attempt.result, status: "invalid" } },
        { ...attempt, attemptId: "4", result: { ...attempt.result, status: "neutral" } },
      ],
    });
    expect(stats.correct).toBe(1);
    expect(stats.incorrect).toBe(1);
    expect(stats.rate).toBeCloseTo(0.5);
  });
});
