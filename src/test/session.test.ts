import { describe, it, expect } from "vitest";
import {
  initialSession,
  sessionReducer,
  computeStats,
  questionElapsedMs,
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
  it("restores an answered current question in feedback with its prior attempt", () => {
    const state = sessionReducer(initialSession, {
      type: "INIT",
      sessionId: "s1",
      questions: [q],
      resumeIndex: 0,
      resumeAttempts: [attempt],
    });
    expect(state.phase).toBe("feedback");
    expect(state.attempts.find((item) => item.questionId === q.id)).toEqual(attempt);
  });
  it("Continue advances exactly once and does not create another attempt", () => {
    const q2 = { ...q, id: 11 };
    let state = sessionReducer(initialSession, {
      type: "INIT",
      sessionId: "s1",
      questions: [q, q2],
      resumeIndex: 0,
      resumeAttempts: [attempt],
    });
    state = sessionReducer(state, { type: "NEXT" });
    state = sessionReducer(state, { type: "NEXT" });
    expect(state.index).toBe(1);
    expect(state.phase).toBe("ready");
    expect(state.attempts).toEqual([attempt]);
  });
  it.each(["MC", "TF"] as const)(
    "%s remains answerable after continuing a resumed session",
    (kind) => {
      const nextQuestion = {
        ...q,
        id: 11,
        kind,
        ...(kind === "TF"
          ? { canonicalBoolean: true, canonicalAnswerText: "True" }
          : { options: ["a", "b"], canonicalAnswerText: "a" }),
      } as ValidQuestion;
      let state = sessionReducer(initialSession, {
        type: "INIT",
        sessionId: "s1",
        questions: [q, nextQuestion],
        resumeAttempts: [attempt],
      });
      state = sessionReducer(state, { type: "NEXT" });
      state = sessionReducer(state, { type: "START_ANSWER" });
      expect(state.phase).toBe("answering");
      expect(state.questions[state.index].kind).toBe(kind);
    },
  );
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
  it("measures each question from the time it was presented", () => {
    expect(questionElapsedMs(5_000, 6_250)).toBe(1_250);
    expect(questionElapsedMs(8_000, 7_000)).toBe(0);
  });
});
