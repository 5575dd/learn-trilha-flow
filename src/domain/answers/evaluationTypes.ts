export type EvaluationStatus = "correct" | "incorrect" | "neutral" | "skipped" | "invalid";

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
