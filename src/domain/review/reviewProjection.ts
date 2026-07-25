import type { AttemptRecord } from "@/domain/session/sessionReducer";
import { calculateSpacedRepetition } from "@/domain/review/spacedRepetition";

export interface ReviewState {
  questionId: number;
  consecutiveCorrect: number;
  totalAttempts: number;
  totalCorrect: number;
  lastAnsweredAt: number | null;
  nextReviewAt: number | null;
  lastAttemptId?: string;
}

function copyReview(review: ReviewState): ReviewState {
  return { ...review };
}

function chronologicalAttempts(attempts: readonly AttemptRecord[]): AttemptRecord[] {
  const byId = new Map<string, AttemptRecord>();
  attempts.forEach((attempt) => {
    if (!byId.has(attempt.attemptId)) byId.set(attempt.attemptId, attempt);
  });
  return [...byId.values()]
    .map((attempt, originalIndex) => ({ attempt, originalIndex }))
    .sort((left, right) => {
      const leftTime = left.attempt.clientCreatedAt;
      const rightTime = right.attempt.clientCreatedAt;
      // Legacy attempts predate timestamped attempts. Their original order is the
      // only conservative chronology available, so it must remain stable.
      if (leftTime === undefined && rightTime !== undefined) return -1;
      if (leftTime !== undefined && rightTime === undefined) return 1;
      if (leftTime !== undefined && rightTime !== undefined && leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.originalIndex - right.originalIndex;
    })
    .map(({ attempt }) => attempt);
}

export function applyAttemptsToReviewStates(
  initial: readonly ReviewState[],
  attempts: readonly AttemptRecord[],
): ReviewState[] {
  const reviews = new Map(initial.map((review) => [review.questionId, copyReview(review)]));
  const knownAttemptIds = new Set(
    initial.flatMap((review) => (review.lastAttemptId ? [review.lastAttemptId] : [])),
  );

  for (const attempt of chronologicalAttempts(attempts)) {
    if (knownAttemptIds.has(attempt.attemptId)) continue;
    const previous = reviews.get(attempt.questionId) ?? {
      questionId: attempt.questionId,
      consecutiveCorrect: 0,
      totalAttempts: 0,
      totalCorrect: 0,
      lastAnsweredAt: null,
      nextReviewAt: null,
    };
    // Epoch is only a deterministic scheduling fallback for legacy attempts; it
    // cannot make them newer than an attempt that supplied a real timestamp.
    const baseTime = new Date(attempt.clientCreatedAt ?? 0);
    if (previous.lastAnsweredAt !== null && baseTime.getTime() < previous.lastAnsweredAt) {
      knownAttemptIds.add(attempt.attemptId);
      continue;
    }
    const calculation = calculateSpacedRepetition(
      attempt.result.status,
      previous.consecutiveCorrect,
      baseTime,
    );
    if (!calculation.incrementTotalAttempts || !calculation.nextReviewAt) continue;
    reviews.set(attempt.questionId, {
      questionId: attempt.questionId,
      consecutiveCorrect: calculation.consecutiveCorrect,
      totalAttempts: previous.totalAttempts + 1,
      totalCorrect: previous.totalCorrect + (calculation.incrementTotalCorrect ? 1 : 0),
      lastAnsweredAt: baseTime.getTime(),
      nextReviewAt: calculation.nextReviewAt.getTime(),
      lastAttemptId: attempt.attemptId,
    });
    knownAttemptIds.add(attempt.attemptId);
  }
  return [...reviews.values()];
}

export function projectLocalReviews(attempts: readonly AttemptRecord[]): ReviewState[] {
  return applyAttemptsToReviewStates([], attempts);
}

export function dueReviews(
  reviews: readonly ReviewState[],
  now: number = Date.now(),
): ReviewState[] {
  return reviews
    .filter((review) => review.nextReviewAt !== null && review.nextReviewAt <= now)
    .map(copyReview)
    .sort(
      (left, right) =>
        (left.nextReviewAt ?? Number.MAX_SAFE_INTEGER) -
        (right.nextReviewAt ?? Number.MAX_SAFE_INTEGER),
    );
}
