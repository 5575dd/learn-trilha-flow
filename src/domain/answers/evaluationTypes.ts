export const EVALUATION_STATUSES = [
  "correct",
  "incorrect",
  "neutral",
  "skipped",
  "invalid",
] as const;

export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export function isEvaluationStatus(value: unknown): value is EvaluationStatus {
  return typeof value === "string" && (EVALUATION_STATUSES as readonly string[]).includes(value);
}

export interface EvaluationResult {
  status: EvaluationStatus;
  studentAnswerDisplay: string;
  correctAnswerDisplay: string;
  normalizedStudentAnswer: string;
  normalizedCorrectAnswer: string;
  explanation: string;
  diagnosticCode: string;
  metadata: Record<string, unknown>;
}
