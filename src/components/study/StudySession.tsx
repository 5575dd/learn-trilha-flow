import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Activity, type ActivityProps } from "@/components/activities/Activity";
import { FeedbackPanel } from "@/components/feedback/FeedbackPanel";
import {
  InMemoryAttemptRepository,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  clearSessionSnapshot,
  loadSessionSnapshot,
  saveSessionSnapshot,
  type AttemptRepository,
} from "@/data/repositories/AttemptRepository";
import { evaluateAnswer } from "@/domain/answers/answerEvaluator";
import type { ValidQuestion } from "@/domain/questions/questionTypes";
import {
  initialSession,
  questionElapsedMs,
  sessionReducer,
  type AttemptRecord,
} from "@/domain/session/sessionReducer";

export type StudyMode = "normal" | "resume" | "restart";

export interface StudySessionProps {
  aulaId: number;
  userId: string;
  questions: ValidQuestion[];
  mode: StudyMode;
  repository?: AttemptRepository;
  createSessionId?: () => string;
  onModeSelected?: (mode: Exclude<StudyMode, "normal">) => void;
  onComplete?: (sessionId: string) => void;
}

const defaultRepository = new InMemoryAttemptRepository();

export function StudySession({
  aulaId,
  userId,
  questions,
  mode,
  repository = defaultRepository,
  createSessionId,
  onModeSelected,
  onComplete,
}: StudySessionProps) {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const [recoverableSession, setRecoverableSession] = useState(false);
  const submittingRef = useRef(false);
  const initializationRef = useRef(0);
  const lastRequestRef = useRef("");
  const completedSessionRef = useRef("");
  const questionIds = useMemo(() => questions.map((question) => question.id), [questions]);
  const questionSignature = questionIds.join(",");

  const initialize = useCallback(
    async (requestedMode: StudyMode) => {
      const requestKey = `${userId}:${aulaId}:${questionSignature}:${requestedMode}`;
      if (lastRequestRef.current === requestKey) return;
      lastRequestRef.current = requestKey;
      const initialization = ++initializationRef.current;
      setRecoverableSession(false);

      try {
        const snapshot = loadSessionSnapshot({ userId, aulaId, questionIds });
        if (snapshot && requestedMode === "normal") {
          if (initialization === initializationRef.current) setRecoverableSession(true);
          return;
        }

        if (snapshot && requestedMode === "restart") {
          await repository.clear(userId, snapshot.sessionId);
          clearSessionSnapshot(userId, aulaId);
        }

        const shouldResume = !!snapshot && requestedMode === "resume";
        const sessionId = shouldResume
          ? snapshot.sessionId
          : (createSessionId?.() ?? `aula-${aulaId}-${Date.now()}`);
        const attempts = shouldResume ? await repository.load(userId, sessionId) : [];
        if (initialization !== initializationRef.current) return;

        dispatch({
          type: "INIT",
          sessionId,
          questions,
          resumeIndex: shouldResume ? snapshot.currentIndex : 0,
          resumeAttempts: attempts,
        });
      } catch {
        if (initialization !== initializationRef.current) return;
        dispatch({
          type: "ERROR",
          message: "Não foi possível recuperar os dados locais desta sessão.",
        });
      }
    },
    [aulaId, createSessionId, questionIds, questionSignature, questions, repository, userId],
  );

  useEffect(() => {
    void initialize(mode);
  }, [initialize, mode]);

  useEffect(() => {
    if (state.phase === "loading" || state.phase === "error" || state.phase === "completed") {
      return;
    }
    if (!state.sessionId) return;
    try {
      saveSessionSnapshot({
        schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
        userId,
        aulaId,
        sessionId: state.sessionId,
        questionIds: state.questions.map((question) => question.id),
        currentQuestionId: state.questions[state.index]?.id ?? null,
        currentIndex: state.index,
        updatedAt: Date.now(),
      });
    } catch {
      dispatch({ type: "ERROR", message: "A sessão não pôde ser salva neste dispositivo." });
    }
  }, [state.phase, state.index, state.sessionId, state.questions, aulaId, userId]);

  useEffect(() => {
    if (
      state.phase !== "completed" ||
      !state.sessionId ||
      completedSessionRef.current === state.sessionId
    ) {
      return;
    }
    try {
      clearSessionSnapshot(userId, aulaId);
      completedSessionRef.current = state.sessionId;
      onComplete?.(state.sessionId);
    } catch {
      dispatch({ type: "ERROR", message: "Não foi possível finalizar a sessão local." });
    }
  }, [state.phase, state.sessionId, aulaId, userId, onComplete]);

  const selectMode = useCallback(
    (selectedMode: Exclude<StudyMode, "normal">) => {
      void initialize(selectedMode);
      onModeSelected?.(selectedMode);
    },
    [initialize, onModeSelected],
  );

  if (recoverableSession) {
    return (
      <div className="space-y-3 rounded-2xl bg-amber-50 p-4 text-amber-900">
        <p className="text-sm font-medium">Existe uma sessão anterior que pode ser retomada.</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="min-h-11 rounded-xl bg-purple-600 px-3 text-sm font-semibold text-white"
            onClick={() => selectMode("resume")}
          >
            Retomar
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm"
            onClick={() => selectMode("restart")}
          >
            Reiniciar
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "loading") {
    return <p className="text-sm text-slate-500">Preparando sua trilha…</p>;
  }
  if (state.phase === "error") {
    return <p className="text-sm text-rose-600">{state.errorMessage ?? "Sem questões válidas."}</p>;
  }

  const current = state.questions[state.index];
  if (!current) return null;
  const lastAttempt = state.attempts.find((attempt) => attempt.questionId === current.id);
  const showingFeedback = state.phase === "feedback" && lastAttempt?.questionId === current.id;

  const handleSubmit: ActivityProps["onSubmit"] = async (input) => {
    if (submittingRef.current) return;
    if (state.phase !== "ready" && state.phase !== "answering") return;
    if (state.attempts.some((attempt) => attempt.questionId === current.id)) return;
    submittingRef.current = true;
    try {
      const result = evaluateAnswer(current, input);
      const attempt: AttemptRecord = {
        attemptId: `${state.sessionId}-${current.id}`,
        questionId: current.id,
        result,
        timeMs: questionElapsedMs(state.questionPresentedAt),
      };
      await repository.save(userId, state.sessionId, attempt);
      dispatch({ type: "SUBMIT", attempt });
    } catch {
      dispatch({
        type: "ERROR",
        message: "Sua resposta não foi salva. Libere espaço ou permita o armazenamento local.",
      });
    } finally {
      setTimeout(() => {
        submittingRef.current = false;
      }, 0);
    }
  };

  const progress = ((state.index + (showingFeedback ? 1 : 0)) / state.questions.length) * 100;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {state.index + 1} / {state.questions.length}
          </span>
          <span>{current.kind}</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full bg-purple-600 transition-all"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      <Activity
        question={current}
        disabled={showingFeedback}
        onSubmit={(input) => void handleSubmit(input)}
      />

      {showingFeedback && lastAttempt && (
        <FeedbackPanel
          result={lastAttempt.result}
          translation={current.traducao || undefined}
          onContinue={() => dispatch({ type: "NEXT" })}
        />
      )}
    </div>
  );
}
