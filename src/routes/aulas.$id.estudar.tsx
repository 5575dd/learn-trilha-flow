import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { z } from "zod";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { listQuestoesByAula } from "@/data/queries";
import { validateAndRepair } from "@/domain/questions/questionValidator";
import type { ValidQuestion } from "@/domain/questions/questionTypes";
import {
  initialSession,
  sessionReducer,
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
  return (
    <RequireAuth>
      <AppShell>
        <StudyView aulaId={Number(id)} wantResume={resume === "1"} wantRestart={restart === "1"} />
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
  const questoes = useQuery({
    queryKey: ["questoes", aulaId],
    queryFn: () => listQuestoesByAula(aulaId),
  });
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const initedRef = useRef(false);
  const submittingRef = useRef(false);
  const [reviewOnly] = useState(false);

  const valids: ValidQuestion[] = useMemo(() => {
    const entries = validateAndRepair(questoes.data ?? []);
    return entries
      .filter((e) => e.status === "valid" || e.status === "repairable")
      .map((e) => (e as { question: ValidQuestion }).question);
  }, [questoes.data]);

  useEffect(() => {
    if (!questoes.data || initedRef.current) return;
    initedRef.current = true;
    const snap = wantRestart ? null : loadSessionSnapshot(aulaId);
    let sessionId = `aula-${aulaId}-${Date.now()}`;
    let resumeIndex = 0;
    let resumeAttempts: AttemptRecord[] = [];
    if (snap && wantResume && snap.total === valids.length) {
      sessionId = snap.sessionId;
      resumeIndex = snap.index;
      void repo.load(sessionId).then((atts) => {
        // Attempts already loaded synchronously below; this is a no-op fetch cache.
        void atts;
      });
      // Sync path: read localStorage directly to avoid race with dispatch.
      // We rely on InMemoryAttemptRepository hydrate via load; do it inline:
    }
    // Load attempts synchronously (hydrates from localStorage on first call).
    void repo.load(sessionId).then((atts) => {
      resumeAttempts = wantResume ? atts : [];
      if (wantRestart) {
        void repo.clear(sessionId);
        clearSessionSnapshot(aulaId);
      }
      dispatch({
        type: "INIT",
        sessionId,
        questions: valids,
        resumeIndex,
        resumeAttempts,
      });
    });
  }, [questoes.data, valids, aulaId, wantResume, wantRestart]);

  // Persist snapshot on every meaningful state change.
  useEffect(() => {
    if (state.phase === "loading" || state.phase === "error") return;
    if (!state.sessionId) return;
    saveSessionSnapshot({
      aulaId,
      sessionId: state.sessionId,
      index: state.index,
      total: state.questions.length,
      updatedAt: Date.now(),
    });
  }, [state.phase, state.index, state.sessionId, state.questions.length, aulaId]);

  useEffect(() => {
    if (state.phase === "completed") {
      clearSessionSnapshot(aulaId);
      void navigate({
        to: "/aulas/$id/resultado",
        params: { id: String(aulaId) },
        search: { s: state.sessionId },
      });
    }
  }, [state.phase, state.sessionId, aulaId, navigate]);

  if (questoes.isLoading || state.phase === "loading") {
    return <p className="text-sm text-slate-500">Preparando sua trilha…</p>;
  }
  if (questoes.error) return <p className="text-sm text-rose-600">Erro ao carregar questões.</p>;
  if (state.phase === "error") {
    return <p className="text-sm text-rose-600">{state.errorMessage ?? "Sem questões válidas."}</p>;
  }

  const current = state.questions[state.index];
  if (!current) return null;
  const lastAttempt = state.attempts[state.attempts.length - 1];
  const showingFeedback = state.phase === "feedback" && lastAttempt?.questionId === current.id;

  function handleSubmit(input: {
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
        timeMs: Date.now() - state.startedAt,
      };
      void repo.save(state.sessionId, attempt);
      dispatch({ type: "SUBMIT", attempt });
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

      <Activity question={current} disabled={showingFeedback || reviewOnly} onSubmit={handleSubmit} />

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
