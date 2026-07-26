import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Activity, type ActivityProps } from "@/components/activities/Activity";
import { FeedbackPanel } from "@/components/feedback/FeedbackPanel";
import {
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  clearSessionSnapshot,
  loadSessionSnapshot,
  saveSessionSnapshot,
  type AttemptRepository,
} from "@/data/repositories/AttemptRepository";
import { attemptRepository } from "@/data/repositories/DualAttemptRepository";
import { manifestStore, type ManifestStore } from "@/data/manifestStore";
import { evaluateAnswer } from "@/domain/answers/answerEvaluator";
import { questionKindLabelPtBr } from "@/domain/questions/questionLabels";
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
  sessionScope?: string;
  repository?: AttemptRepository;
  store?: ManifestStore;
  createSessionId?: () => string;
  onModeSelected?: (mode: Exclude<StudyMode, "normal">) => void;
  onComplete?: (sessionId: string) => void;
  managedSession?: {
    id: string;
    currentIndex: number;
    onCurrentIndexChange: (index: number) => void;
    onComplete: () => void;
    mode?: string;
  };
}

const defaultRepository = attemptRepository;

function fallbackSessionId(aulaId: number): string {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `aula-${aulaId}-${randomPart}`;
}

export function StudySession({
  aulaId,
  userId,
  questions,
  mode,
  sessionScope,
  repository = defaultRepository,
  store = manifestStore,
  createSessionId,
  onModeSelected,
  onComplete,
  managedSession,
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
      const requestKey = managedSession
        ? `${userId}:${managedSession.id}:${questionSignature}:managed`
        : `${userId}:${aulaId}:${sessionScope ?? "default"}:${questionSignature}:${requestedMode}`;
      if (lastRequestRef.current === requestKey) return;
      lastRequestRef.current = requestKey;
      const initialization = ++initializationRef.current;
      setRecoverableSession(false);

      try {
        if (managedSession) {
          const attempts = await repository.load(userId, managedSession.id);
          if (initialization !== initializationRef.current) return;
          dispatch({
            type: "INIT",
            sessionId: managedSession.id,
            questions,
            resumeIndex: managedSession.currentIndex,
            resumeAttempts: attempts,
          });
          return;
        }
        const snapshot = loadSessionSnapshot({ userId, aulaId, questionIds, scope: sessionScope });
        const ensureManifest = (sessionId: string, currentIndex = 0) => {
          const existing = store.get(userId, sessionId);
          const manifest =
            existing ??
            store.create({
              id: sessionId,
              userId,
              source: { kind: "aula", aulaId },
              criteria: { aulaId },
              questionIds,
            });
          if (manifest.status === "completed" || manifest.status === "abandoned") {
            return manifest;
          }
          store.markActive(userId, sessionId);
          const nextIndex = Math.max(manifest.currentIndex, currentIndex);
          return store.update(userId, sessionId, { currentIndex: nextIndex }) ?? manifest;
        };
        const allocateSessionId = (excludedId?: string) => {
          const requestedId = createSessionId?.();
          if (
            requestedId &&
            requestedId !== excludedId &&
            store.get(userId, requestedId) === null
          ) {
            return requestedId;
          }
          for (let attempt = 0; attempt < 10; attempt++) {
            const candidate = fallbackSessionId(aulaId);
            if (candidate !== excludedId && store.get(userId, candidate) === null) {
              return candidate;
            }
          }
          throw new Error("Não foi possível criar um ID exclusivo para a nova sessão.");
        };

        if (snapshot && requestedMode === "normal") {
          const manifest = ensureManifest(snapshot.sessionId, snapshot.currentIndex);
          if (manifest.status === "completed") {
            clearSessionSnapshot(userId, aulaId, sessionScope);
          } else {
            if (initialization === initializationRef.current) setRecoverableSession(true);
            return;
          }
        }

        const restartedSessionId =
          snapshot && requestedMode === "restart" ? snapshot.sessionId : undefined;
        if (snapshot && requestedMode === "restart") {
          ensureManifest(snapshot.sessionId, snapshot.currentIndex);
          store.abandon(userId, snapshot.sessionId);
          clearSessionSnapshot(userId, aulaId, sessionScope);
        }

        const shouldResume = !!snapshot && requestedMode === "resume";
        const manifest = shouldResume
          ? ensureManifest(snapshot.sessionId, snapshot.currentIndex)
          : (() => {
              const sessionId = allocateSessionId(restartedSessionId);
              return ensureManifest(sessionId);
            })();
        if (manifest.status === "abandoned") {
          throw new Error("A sessão não pode ser retomada porque foi abandonada.");
        }
        const sessionId = manifest.id;
        const attempts = shouldResume ? await repository.load(userId, sessionId) : [];
        if (initialization !== initializationRef.current) return;

        dispatch({
          type: "INIT",
          sessionId,
          questions,
          resumeIndex: shouldResume ? manifest.currentIndex : 0,
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
    [
      aulaId,
      createSessionId,
      managedSession,
      questionIds,
      questionSignature,
      questions,
      repository,
      sessionScope,
      store,
      userId,
    ],
  );

  useEffect(() => {
    void initialize(mode);
  }, [initialize, mode]);

  useEffect(() => {
    if (
      managedSession ||
      state.phase === "loading" ||
      state.phase === "error" ||
      state.phase === "completed"
    ) {
      return;
    }
    if (!state.sessionId) return;
    try {
      saveSessionSnapshot(
        {
          schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
          userId,
          aulaId,
          sessionId: state.sessionId,
          questionIds: state.questions.map((question) => question.id),
          currentQuestionId: state.questions[state.index]?.id ?? null,
          currentIndex: state.index,
          updatedAt: Date.now(),
        },
        sessionScope,
      );
      store.markActive(userId, state.sessionId);
      store.update(userId, state.sessionId, { currentIndex: state.index });
    } catch {
      dispatch({ type: "ERROR", message: "A sessão não pôde ser salva neste dispositivo." });
    }
  }, [
    state.phase,
    state.index,
    state.sessionId,
    state.questions,
    aulaId,
    userId,
    managedSession,
    sessionScope,
    store,
  ]);

  useEffect(() => {
    if (
      !managedSession ||
      state.phase === "loading" ||
      state.phase === "error" ||
      state.phase === "completed"
    ) {
      return;
    }
    managedSession.onCurrentIndexChange(state.index);
  }, [managedSession, state.index, state.phase]);

  useEffect(() => {
    if (
      state.phase !== "completed" ||
      !state.sessionId ||
      completedSessionRef.current === state.sessionId
    ) {
      return;
    }
    try {
      if (managedSession) {
        completedSessionRef.current = state.sessionId;
        managedSession.onComplete();
        return;
      }
      store.markCompleted(userId, state.sessionId);
      clearSessionSnapshot(userId, aulaId, sessionScope);
      completedSessionRef.current = state.sessionId;
      onComplete?.(state.sessionId);
    } catch {
      dispatch({ type: "ERROR", message: "Não foi possível finalizar a sessão local." });
    }
  }, [
    state.phase,
    state.sessionId,
    aulaId,
    userId,
    onComplete,
    managedSession,
    sessionScope,
    store,
  ]);

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
        clientCreatedAt: Date.now(),
        sessionMode: managedSession?.mode ?? "aula",
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
  const block =
    state.questions.length >= 30
      ? Math.min(3, Math.floor(state.index / Math.ceil(state.questions.length / 3)) + 1)
      : null;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {state.index + 1} / {state.questions.length}
          </span>
          <span>
            {block ? `Bloco ${block} de 3 • ` : ""}
            {questionKindLabelPtBr(current.kind)}
          </span>
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
        key={current.id}
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
