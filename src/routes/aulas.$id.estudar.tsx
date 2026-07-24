import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { z } from "zod";
import { RequireAuth } from "@/auth/RequireAuth";
import { useAuth } from "@/auth/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { listQuestoesByAula } from "@/data/queries";
import { validateAndRepair } from "@/domain/questions/questionValidator";
import type { ValidQuestion } from "@/domain/questions/questionTypes";
import {
  initialSession,
  sessionReducer,
  questionElapsedMs,
  type AttemptRecord,
} from "@/domain/session/sessionReducer";
import { evaluateAnswer } from "@/domain/answers/answerEvaluator";
import { Activity } from "@/components/activities/Activity";
import { FeedbackPanel } from "@/components/feedback/FeedbackPanel";
import {
  InMemoryAttemptRepository,
  loadSessionSnapshot,
  saveSessionSnapshot,
  clearSessionSnapshot,
} from "@/data/repositories/AttemptRepository";

const search = z.object({ resume: z.string().optional(), restart: z.string().optional() });

export const Route = createFileRoute("/aulas/$id/estudar")({
  ssr: false,
  validateSearch: (raw) => search.parse(raw),
  component: StudyRoute,
});

const repo = new InMemoryAttemptRepository();

function StudyRoute() {
  const { id } = Route.useParams();
  const { resume, restart } = Route.useSearch();
  const aulaId = Number(id);
  if (!Number.isSafeInteger(aulaId) || aulaId <= 0) {
    return (
      <RequireAuth>
        <AppShell>
          <p className="text-sm text-rose-600">ID de aula invÃ¡lido.</p>
        </AppShell>
      </RequireAuth>
    );
  }
  return (
    <RequireAuth>
      <AppShell>
        <StudyView aulaId={aulaId} wantResume={resume === "1"} wantRestart={restart === "1"} />
      </AppShell>
    </RequireAuth>
  );
}

function StudyView({
  aulaId,
  wantResume,
  wantRestart,
}: {
  aulaId: number;
  wantResume: boolean;
  wantRestart: boolean;
}) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const questoes = useQuery({
    queryKey: ["questoes", aulaId],
    queryFn: () => listQuestoesByAula(aulaId),
  });
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const initedRef = useRef(false);
  const submittingRef = useRef(false);
  const [reviewOnly] = useState(false);
  const [recoverableSession, setRecoverableSession] = useState(false);

  const valids: ValidQuestion[] = useMemo(() => {
    const entries = validateAndRepair(questoes.data ?? []);
    return entries
      .filter((e) => e.status === "valid" || e.status === "repairable")
      .map((e) => (e as { question: ValidQuestion }).question);
  }, [questoes.data]);

  useEffect(() => {
    if (!questoes.data || !userId || initedRef.current) return;
    initedRef.current = true;
    const questionIds = valids.map((question) => question.id);
    void (async () => {
      try {
        const snap = loadSessionSnapshot({ userId, aulaId, questionIds });
        if (snap && !wantResume && !wantRestart) {
          setRecoverableSession(true);
          return;
        }
        if (wantRestart && snap) {
          await repo.clear(userId, snap.sessionId);
          clearSessionSnapshot(userId, aulaId);
        }
        const sessionId = snap && wantResume ? snap.sessionId : `aula-${aulaId}-${Date.now()}`;
        const resumeAttempts = snap && wantResume ? await repo.load(userId, sessionId) : [];
        dispatch({
          type: "INIT",
          sessionId,
          questions: valids,
          resumeIndex: snap && wantResume ? snap.currentIndex : 0,
          resumeAttempts,
        });
      } catch {
        dispatch({
          type: "ERROR",
          message: "NÃ£o foi possÃ­vel recuperar os dados locais desta sessÃ£o.",
        });
      }
    })();
  }, [questoes.data, valids, aulaId, userId, wantResume, wantRestart]);

  // Persist snapshot on every meaningful state change.
  useEffect(() => {
    if (state.phase === "loading" || state.phase === "error") return;
    if (!state.sessionId) return;
    try {
      saveSessionSnapshot({
        schemaVersion: 1,
        userId,
        aulaId,
        sessionId: state.sessionId,
        questionIds: state.questions.map((question) => question.id),
        currentQuestionId: state.questions[state.index]?.id ?? null,
        currentIndex: state.index,
        updatedAt: Date.now(),
      });
    } catch {
      dispatch({ type: "ERROR", message: "A sessÃ£o nÃ£o pÃ´de ser salva neste dispositivo." });
    }
  }, [state.phase, state.index, state.sessionId, state.questions, aulaId, userId]);

  useEffect(() => {
    if (state.phase === "completed") {
      try {
        clearSessionSnapshot(userId, aulaId);
      } catch {
        dispatch({ type: "ERROR", message: "NÃ£o foi possÃ­vel finalizar a sessÃ£o local." });
        return;
      }
      void navigate({
        to: "/aulas/$id/resultado",
        params: { id: String(aulaId) },
        search: { s: state.sessionId },
      });
    }
  }, [state.phase, state.sessionId, aulaId, userId, navigate]);

  if (recoverableSession) {
    return (
      <div className="space-y-3 rounded-2xl bg-amber-50 p-4 text-amber-900">
        <p className="text-sm font-medium">Existe uma sessÃ£o anterior que pode ser retomada.</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="min-h-11 rounded-xl bg-purple-600 px-3 text-sm font-semibold text-white"
            onClick={() =>
              void navigate({
                to: "/aulas/$id/estudar",
                params: { id: String(aulaId) },
                search: { resume: "1" },
              })
            }
          >
            Retomar
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm"
            onClick={() =>
              void navigate({
                to: "/aulas/$id/estudar",
                params: { id: String(aulaId) },
                search: { restart: "1" },
              })
            }
          >
            Reiniciar
          </button>
        </div>
      </div>
    );
  }

  if (questoes.isLoading || state.phase === "loading") {
    return <p className="text-sm text-slate-500">Preparando sua trilhaâ€¦</p>;
  }
  if (questoes.error) return <p className="text-sm text-rose-600">Erro ao carregar questÃµes.</p>;
  if (state.phase === "error") {
    return <p className="text-sm text-rose-600">{state.errorMessage ?? "Sem questÃµes vÃ¡lidas."}</p>;
  }

  const current = state.questions[state.index];
  if (!current) return null;
  const lastAttempt = state.attempts.find((attempt) => attempt.questionId === current.id);
  const showingFeedback = state.phase === "feedback" && lastAttempt?.questionId === current.id;

  async function handleSubmit(input: {
    text?: string;
    selectedBlockIds?: string[];
    selfEval?: "know" | "unknown" | "skip";
  }) {
    if (submittingRef.current) return;
    if (state.phase !== "ready" && state.phase !== "answering") return;
    if (state.attempts.some((a) => a.questionId === current.id)) return;
    submittingRef.current = true;
    try {
      const result = evaluateAnswer(current, input);
      const attempt: AttemptRecord = {
        attemptId: `${state.sessionId}-${current.id}`,
        questionId: current.id,
        result,
        timeMs: questionElapsedMs(state.questionPresentedAt),
      };
      await repo.save(userId, state.sessionId, attempt);
      dispatch({ type: "SUBMIT", attempt });
    } catch {
      dispatch({
        type: "ERROR",
        message: "Sua resposta nÃ£o foi salva. Libere espaÃ§o ou permita o armazenamento local.",
      });
    } finally {
      setTimeout(() => {
        submittingRef.current = false;
      }, 0);
    }
  }

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
        disabled={showingFeedback || reviewOnly}
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
