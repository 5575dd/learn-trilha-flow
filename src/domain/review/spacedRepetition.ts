import type { EvaluationStatus } from "@/domain/answers/evaluationTypes";

export type ReviewResultStatus = EvaluationStatus;

export interface SpacedRepetitionResult {
  consecutiveCorrect: number;
  intervalMs: number | null;
  nextReviewAt: Date | null;
  incrementTotalCorrect: boolean;
  incrementTotalAttempts: boolean;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function correctIntervalMs(consecutiveCorrect: number): number {
  if (consecutiveCorrect <= 1) return DAY_MS;
  if (consecutiveCorrect === 2) return 3 * DAY_MS;
  if (consecutiveCorrect === 3) return 7 * DAY_MS;
  if (consecutiveCorrect === 4) return 14 * DAY_MS;
  return 30 * DAY_MS;
}

export function calculateSpacedRepetition(
  status: ReviewResultStatus,
  previousConsecutiveCorrect: number,
  baseTime: Date = new Date(),
): SpacedRepetitionResult {
  if (!Number.isSafeInteger(previousConsecutiveCorrect) || previousConsecutiveCorrect < 0) {
    throw new RangeError("A sequência anterior de acertos deve ser um inteiro não negativo.");
  }
  if (Number.isNaN(baseTime.getTime())) {
    throw new RangeError("O horário base da revisão é inválido.");
  }

  if (status === "neutral" || status === "skipped" || status === "invalid") {
    return {
      consecutiveCorrect: previousConsecutiveCorrect,
      intervalMs: null,
      nextReviewAt: null,
      incrementTotalCorrect: false,
      incrementTotalAttempts: false,
    };
  }

  const consecutiveCorrect = status === "correct" ? previousConsecutiveCorrect + 1 : 0;
  const intervalMs = status === "correct" ? correctIntervalMs(consecutiveCorrect) : 4 * HOUR_MS;

  return {
    consecutiveCorrect,
    intervalMs,
    nextReviewAt: new Date(baseTime.getTime() + intervalMs),
    incrementTotalCorrect: status === "correct",
    incrementTotalAttempts: true,
  };
}
