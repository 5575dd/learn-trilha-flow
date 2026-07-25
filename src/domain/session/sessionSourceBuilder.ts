import type { AttemptRecord } from "@/domain/session/sessionReducer";
import type { SupportedKind, ValidQuestion } from "@/domain/questions/questionTypes";

function unique(ids: readonly number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
}

function deterministic(questions: readonly ValidQuestion[]): ValidQuestion[] {
  return [...questions].sort(
    (left, right) =>
      (left.aulaId ?? 0) - (right.aulaId ?? 0) ||
      left.sessao - right.sessao ||
      left.ordem - right.ordem ||
      left.id - right.id,
  );
}

export function buildAulaQuestionIds(
  questions: readonly ValidQuestion[],
  aulaId: number,
): number[] {
  return unique(
    deterministic(questions)
      .filter((question) => question.aulaId === aulaId)
      .map((question) => question.id),
  );
}

export function buildQuickQuestionIds(
  questions: readonly ValidQuestion[],
  options: { limit?: number; random?: () => number } = {},
): number[] {
  const limit = Math.max(0, Math.floor(options.limit ?? 10));
  const random = options.random ?? Math.random;
  const ids = unique(deterministic(questions).map((question) => question.id));
  for (let index = ids.length - 1; index > 0; index--) {
    const target = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
    [ids[index], ids[target]] = [ids[target], ids[index]];
  }
  return ids.slice(0, limit);
}

export function buildErrorQuestionIds(
  attempts: readonly AttemptRecord[],
  questions: readonly ValidQuestion[],
): number[] {
  return buildErrorQuestionIdsFromIds(
    attempts,
    questions.map((question) => question.id),
  );
}

export function buildErrorQuestionIdsFromIds(
  attempts: readonly AttemptRecord[],
  questionIds: readonly number[],
): number[] {
  const available = new Set(questionIds);
  return unique(
    attempts
      .filter(
        (attempt) => attempt.result.status === "incorrect" && available.has(attempt.questionId),
      )
      .map((attempt) => attempt.questionId),
  );
}

export function buildQuestionTypeIds(
  questions: readonly ValidQuestion[],
  questionType: SupportedKind,
): number[] {
  return unique(
    deterministic(questions)
      .filter((question) => question.kind === questionType)
      .map((question) => question.id),
  );
}
