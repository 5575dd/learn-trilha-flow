import type { ValidQuestion } from "../questions/questionTypes";
import type { EvaluationResult } from "../answers/evaluationTypes";

export type SessionPhase =
  | "loading"
  | "ready"
  | "answering"
  | "evaluating"
  | "feedback"
  | "paused"
  | "completed"
  | "error";

export interface AttemptRecord {
  attemptId: string;
  questionId: number;
  result: EvaluationResult;
  timeMs: number;
}

export interface SessionState {
  phase: SessionPhase;
  sessionId: string;
  questions: ValidQuestion[];
  index: number;
  attempts: AttemptRecord[];
  startedAt: number;
  questionPresentedAt: number;
  errorMessage?: string;
}

export type SessionAction =
  | {
      type: "INIT";
      sessionId: string;
      questions: ValidQuestion[];
      resumeIndex?: number;
      resumeAttempts?: AttemptRecord[];
    }
  | { type: "START_ANSWER" }
  | { type: "SUBMIT"; attempt: AttemptRecord }
  | { type: "NEXT" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "ERROR"; message: string };

export const initialSession: SessionState = {
  phase: "loading",
  sessionId: "",
  questions: [],
  index: 0,
  attempts: [],
  startedAt: 0,
  questionPresentedAt: 0,
};

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "INIT": {
      if (action.questions.length === 0) {
        return {
          ...initialSession,
          phase: "error",
          sessionId: action.sessionId,
          errorMessage: "Nenhuma questão válida",
        };
      }
      const resumeAttempts = action.resumeAttempts ?? [];
      const resumeIndex = Math.min(Math.max(0, action.resumeIndex ?? 0), action.questions.length);
      const completed = resumeIndex >= action.questions.length;
      const currentQuestion = action.questions[resumeIndex];
      const currentAttempt = currentQuestion
        ? resumeAttempts.find((attempt) => attempt.questionId === currentQuestion.id)
        : undefined;
      const now = Date.now();
      return {
        phase: completed ? "completed" : currentAttempt ? "feedback" : "ready",
        sessionId: action.sessionId,
        questions: action.questions,
        index: completed ? action.questions.length : resumeIndex,
        attempts: resumeAttempts,
        startedAt: now,
        questionPresentedAt: now,
      };
    }
    case "START_ANSWER":
      if (state.phase !== "ready" && state.phase !== "feedback") return state;
      return { ...state, phase: "answering" };
    case "SUBMIT": {
      // Idempotency: reject submissions when not answering, or duplicate for same question.
      if (state.phase !== "answering" && state.phase !== "ready") return state;
      if (state.attempts.some((a) => a.attemptId === action.attempt.attemptId)) return state;
      // Prevent double submission for the same question index.
      const current = state.questions[state.index];
      if (!current || current.id !== action.attempt.questionId) return state;
      if (state.attempts.some((a) => a.questionId === current.id)) return state;
      return {
        ...state,
        phase: "feedback",
        attempts: [...state.attempts, action.attempt],
      };
    }
    case "NEXT": {
      if (state.phase !== "feedback") return state;
      const nextIndex = state.index + 1;
      if (nextIndex >= state.questions.length) {
        return { ...state, phase: "completed", index: state.questions.length };
      }
      return {
        ...state,
        phase: "ready",
        index: nextIndex,
        questionPresentedAt: Date.now(),
      };
    }
    case "PAUSE":
      return { ...state, phase: "paused" };
    case "RESUME":
      return {
        ...state,
        phase: state.attempts.some(
          (attempt) => attempt.questionId === state.questions[state.index]?.id,
        )
          ? "feedback"
          : "ready",
        questionPresentedAt: Date.now(),
      };
    case "ERROR":
      return { ...state, phase: "error", errorMessage: action.message };
    default:
      return state;
  }
}

export function computeStats(state: SessionState) {
  let correct = 0;
  let incorrect = 0;
  let neutral = 0;
  let invalid = 0;
  for (const a of state.attempts) {
    switch (a.result.status) {
      case "correct":
        correct++;
        break;
      case "incorrect":
        incorrect++;
        break;
      case "neutral":
        neutral++;
        break;
      case "invalid":
        invalid++;
        break;
    }
  }
  const denom = correct + incorrect;
  const rate = denom === 0 ? 0 : correct / denom;
  return { correct, incorrect, neutral, invalid, rate };
}

export function questionElapsedMs(questionPresentedAt: number, now = Date.now()): number {
  return Math.max(0, now - questionPresentedAt);
}
