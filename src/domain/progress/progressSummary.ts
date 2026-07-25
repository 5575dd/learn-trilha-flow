import type { AttemptEntry } from "@/data/repositories/AttemptRepository";
import type { ValidQuestion } from "@/domain/questions/questionTypes";
import type {
  SessionManifest,
  SessionSource,
  SessionStatus,
} from "@/domain/session/sessionManifest";

export interface ProgressMetrics {
  totalAttempts: number;
  correct: number;
  incorrect: number;
  accuracyRate: number | null;
  uniqueQuestions: number;
  totalStudyTimeMs: number;
  completedSessions: number;
  dueReviewsToday: number;
}

export interface ProgressHistoryItem {
  manifestId: string;
  source: SessionSource;
  status: SessionStatus;
  date: number;
  questionCount: number;
  currentIndex: number;
  recoverable: boolean;
  resultAvailable: boolean;
}

export interface QuestionTypePerformance {
  kind: ValidQuestion["kind"];
  correct: number;
  incorrect: number;
  accuracyRate: number | null;
}

export interface ProgressSummary {
  metrics: ProgressMetrics;
  history: ProgressHistoryItem[];
  performance: QuestionTypePerformance[];
}

export function sessionSourceLabel(source: SessionSource): string {
  switch (source.kind) {
    case "aula":
      return `Aula ${source.aulaId}`;
    case "quick":
      return "Sessão rápida";
    case "errors":
      return "Revisão de erros";
    case "dueReview":
      return "Revisão do dia";
    case "questionType":
      return `Tipo ${source.questionType}`;
  }
}

export function buildProgressSummary({
  entries,
  manifests,
  questions,
  dueReviewsToday,
}: {
  entries: readonly AttemptEntry[];
  manifests: readonly SessionManifest[];
  questions: readonly ValidQuestion[];
  dueReviewsToday: number;
}): ProgressSummary {
  const correct = entries.filter((entry) => entry.attempt.result.status === "correct").length;
  const incorrect = entries.filter((entry) => entry.attempt.result.status === "incorrect").length;
  const answered = correct + incorrect;
  const attemptsBySession = new Map<string, number>();
  entries.forEach((entry) => {
    attemptsBySession.set(entry.sessionId, (attemptsBySession.get(entry.sessionId) ?? 0) + 1);
  });

  const kindByQuestion = new Map(questions.map((question) => [question.id, question.kind]));
  const performance = new Map<ValidQuestion["kind"], { correct: number; incorrect: number }>();
  entries.forEach((entry) => {
    const kind = kindByQuestion.get(entry.attempt.questionId);
    const status = entry.attempt.result.status;
    if (!kind || (status !== "correct" && status !== "incorrect")) return;
    const current = performance.get(kind) ?? { correct: 0, incorrect: 0 };
    current[status] += 1;
    performance.set(kind, current);
  });

  return {
    metrics: {
      totalAttempts: entries.length,
      correct,
      incorrect,
      accuracyRate: answered > 0 ? correct / answered : null,
      uniqueQuestions: new Set(entries.map((entry) => entry.attempt.questionId)).size,
      totalStudyTimeMs: entries.reduce(
        (total, entry) => total + Math.max(0, entry.attempt.timeMs),
        0,
      ),
      completedSessions: manifests.filter((manifest) => manifest.status === "completed").length,
      dueReviewsToday: Math.max(0, dueReviewsToday),
    },
    history: [...manifests]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 10)
      .map((manifest) => ({
        manifestId: manifest.id,
        source: manifest.source,
        status: manifest.status,
        date: manifest.updatedAt,
        questionCount: manifest.questionIds.length,
        currentIndex: manifest.currentIndex,
        recoverable:
          (manifest.status === "created" || manifest.status === "active") &&
          manifest.questionIds.length > 0,
        resultAvailable:
          manifest.status === "completed" && (attemptsBySession.get(manifest.id) ?? 0) > 0,
      })),
    performance: [...performance.entries()]
      .map(([kind, values]) => {
        const denominator = values.correct + values.incorrect;
        return {
          kind,
          ...values,
          accuracyRate: denominator > 0 ? values.correct / denominator : null,
        };
      })
      .sort((left, right) => left.kind.localeCompare(right.kind)),
  };
}
