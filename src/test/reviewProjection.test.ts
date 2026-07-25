import { describe, expect, it } from "vitest";
import { dueReviews, projectLocalReviews } from "@/domain/review/reviewProjection";
import type { EvaluationStatus } from "@/domain/answers/evaluationTypes";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

const hour = 60 * 60 * 1000;
const day = 24 * hour;
const base = Date.parse("2026-07-25T12:00:00.000Z");

function attempt(
  attemptId: string,
  status: EvaluationStatus,
  clientCreatedAt: number,
  questionId = 1,
): AttemptRecord {
  return {
    attemptId,
    questionId,
    clientCreatedAt,
    timeMs: 100,
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
  };
}

describe("local review projection", () => {
  it("projects counters and dates from chronological attempts", () => {
    const [review] = projectLocalReviews([
      attempt("second", "correct", base + hour),
      attempt("first", "incorrect", base),
    ]);
    expect(review).toMatchObject({
      consecutiveCorrect: 1,
      totalAttempts: 2,
      totalCorrect: 1,
      lastAnsweredAt: base + hour,
      nextReviewAt: base + hour + day,
    });
  });

  it("schedules an incorrect answer in four hours", () => {
    expect(projectLocalReviews([attempt("a", "incorrect", base)])[0]?.nextReviewAt).toBe(
      base + 4 * hour,
    );
  });

  it("uses 1, 3, 7, 14 and 30 days for a correct sequence", () => {
    const attempts = [0, 1, 2, 3, 4].map((index) => attempt(`a-${index}`, "correct", base + index));
    const [review] = projectLocalReviews(attempts);
    expect(review.consecutiveCorrect).toBe(5);
    expect(review.nextReviewAt).toBe(base + 4 + 30 * day);
  });

  it.each(["neutral", "skipped", "invalid"] as const)(
    "does not change review state for %s",
    (status) => {
      expect(projectLocalReviews([attempt("a", status, base)])).toEqual([]);
    },
  );

  it("lists a due review", () => {
    const reviews = projectLocalReviews([attempt("a", "incorrect", base)]);
    expect(dueReviews(reviews, base + 4 * hour)).toHaveLength(1);
  });

  it("does not list a future review", () => {
    const reviews = projectLocalReviews([attempt("a", "correct", base)]);
    expect(dueReviews(reviews, base + hour)).toEqual([]);
  });

  it("deduplicates attemptId and questionId state", () => {
    const duplicated = attempt("same", "correct", base);
    const reviews = projectLocalReviews([duplicated, { ...duplicated }]);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.totalAttempts).toBe(1);
  });
});
