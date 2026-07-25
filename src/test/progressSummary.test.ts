import { describe, expect, it } from "vitest";
import type { AttemptEntry } from "@/data/repositories/AttemptRepository";
import { buildProgressSummary } from "@/domain/progress/progressSummary";
import type { ValidQuestion } from "@/domain/questions/questionTypes";
import type { SessionManifest } from "@/domain/session/sessionManifest";

function attempt(
  attemptId: string,
  status: "correct" | "incorrect",
  options: { sessionId?: string; questionId?: number; timeMs?: number } = {},
): AttemptEntry {
  return {
    userId: "user-a",
    sessionId: options.sessionId ?? "session-1",
    attempt: {
      attemptId,
      questionId: options.questionId ?? 1,
      timeMs: options.timeMs ?? 1_000,
      result: {
        status,
        studentAnswerDisplay: "",
        correctAnswerDisplay: "",
        normalizedStudentAnswer: "",
        normalizedCorrectAnswer: "",
        explanation: "",
        diagnosticCode: "",
        metadata: {},
      },
    },
  };
}

const question: ValidQuestion = {
  id: 1,
  aulaId: 1,
  kind: "TF",
  enunciado: "",
  explicacao: "",
  traducao: "",
  sessao: 1,
  ordem: 1,
  canonicalAnswerText: "True",
};

function manifest(overrides: Partial<SessionManifest> = {}): SessionManifest {
  return {
    schemaVersion: 1,
    id: "session-1",
    userId: "user-a",
    source: { kind: "quick" },
    criteria: {},
    questionIds: Object.freeze([1, 2]),
    status: "active",
    currentIndex: 1,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe("progress summary", () => {
  it("returns a real empty state without a false percentage", () => {
    const summary = buildProgressSummary({
      entries: [],
      manifests: [],
      questions: [],
      dueReviewsToday: 0,
    });
    expect(summary.metrics.totalAttempts).toBe(0);
    expect(summary.metrics.accuracyRate).toBeNull();
  });

  it("protects accuracy from division by zero", () => {
    const summary = buildProgressSummary({
      entries: [],
      manifests: [manifest()],
      questions: [],
      dueReviewsToday: 0,
    });
    expect(summary.metrics.accuracyRate).toBeNull();
  });

  it("summarizes local or remote consolidated attempts", () => {
    const summary = buildProgressSummary({
      entries: [attempt("a", "correct"), attempt("b", "incorrect")],
      manifests: [],
      questions: [question],
      dueReviewsToday: 1,
    });
    expect(summary.metrics).toMatchObject({
      totalAttempts: 2,
      correct: 1,
      incorrect: 1,
      accuracyRate: 0.5,
      uniqueQuestions: 1,
      dueReviewsToday: 1,
    });
  });

  it("does not double-count consolidated entries", () => {
    const entry = attempt("a", "correct");
    const summary = buildProgressSummary({
      entries: [entry],
      manifests: [],
      questions: [question],
      dueReviewsToday: 0,
    });
    expect(summary.metrics.totalAttempts).toBe(1);
  });

  it("sums total study time", () => {
    const summary = buildProgressSummary({
      entries: [
        attempt("a", "correct", { timeMs: 1_500 }),
        attempt("b", "incorrect", { timeMs: 2_500 }),
      ],
      manifests: [],
      questions: [],
      dueReviewsToday: 0,
    });
    expect(summary.metrics.totalStudyTimeMs).toBe(4_000);
  });

  it("builds recent session history and recoverable actions", () => {
    const summary = buildProgressSummary({
      entries: [],
      manifests: [manifest()],
      questions: [],
      dueReviewsToday: 0,
    });
    expect(summary.history[0]).toMatchObject({
      manifestId: "session-1",
      recoverable: true,
      currentIndex: 1,
      questionCount: 2,
    });
  });

  it("marks a completed result available only when attempts exist", () => {
    const summary = buildProgressSummary({
      entries: [attempt("a", "correct")],
      manifests: [manifest({ status: "completed", currentIndex: 2 })],
      questions: [question],
      dueReviewsToday: 0,
    });
    expect(summary.history[0]?.resultAvailable).toBe(true);
    expect(summary.metrics.completedSessions).toBe(1);
  });

  it("does not invent question types when metadata is unavailable", () => {
    const summary = buildProgressSummary({
      entries: [attempt("a", "correct", { questionId: 99 })],
      manifests: [],
      questions: [question],
      dueReviewsToday: 0,
    });
    expect(summary.performance).toEqual([]);
  });
});
