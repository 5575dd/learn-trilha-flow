import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useReducer, useRef } from "react";
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
import { InMemoryAttemptRepository } from "@/data/repositories/AttemptRepository";

export const Route = createFileRoute("/aulas/$id/estudar")({
  ssr: false,
  component: StudyRoute,
});

const repo = new InMemoryAttemptRepository();

function StudyRoute() {
  const { id } = Route.useParams();
  return (
    <RequireAuth>
      <AppShell>
        <StudyView aulaId={Number(id)} />
      </AppShell>
    </RequireAuth>
  );
}

function StudyView({ aulaId }: { aulaId: number }) {
  const navigate = useNavigate();
  const questoes = useQuery({
    queryKey: ["questoes", aulaId],
    queryFn: () => listQuestoesByAula(aulaId),
  });
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const initedRef = useRef(false);
  const submittingRef = useRef(false);

  const valids: ValidQuestion[] = useMemo(() => {
    const entries = validateAndRepair(questoes.data ?? []);
    return entries
      .filter((e) => e.status === "valid" || e.status === "repairable")
      .map((e) => (e as { question: ValidQuestion }).question);
  }, [questoes.data]);

  useEffect(() => {
    if (!questoes.data || initedRef.current) return;
    initedRef.current = true;
    const sessionId = `aula-${aulaId}-${Date.now()}`;
    dispatch({ type: "INIT", sessionId, questions: valids });
  }, [questoes.data, valids, aulaId]);

  useEffect(() => {
    if (state.phase === "completed") {
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

  function handleSubmit(input: { text?: string; selectedBlockIds?: string[] }) {
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
      // Release on next tick to swallow accidental double-clicks in the same task
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

      <Activity question={current} disabled={showingFeedback} onSubmit={handleSubmit} />

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
