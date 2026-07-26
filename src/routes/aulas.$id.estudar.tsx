import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { z } from "zod";
import { RequireAuth } from "@/auth/RequireAuth";
import { useAuth } from "@/auth/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { StudySession, type StudyMode } from "@/components/study/StudySession";
import { listQuestoesByAula } from "@/data/queries";
import { validateAndRepair } from "@/domain/questions/questionValidator";
import type { ValidQuestion } from "@/domain/questions/questionTypes";
import {
  formatReleaseDate,
  groupLessonSessions,
  isLessonSessionNumber,
} from "@/domain/session/lessonSessions";

const search = z.object({
  sessao: z.string().optional(),
  resume: z.string().optional(),
  restart: z.string().optional(),
});

export const Route = createFileRoute("/aulas/$id/estudar")({
  ssr: false,
  validateSearch: (raw) => search.parse(raw),
  component: StudyRoute,
});

function StudyRoute() {
  const { id } = Route.useParams();
  const { sessao, resume, restart } = Route.useSearch();
  const aulaId = Number(id);
  if (!Number.isSafeInteger(aulaId) || aulaId <= 0) {
    return (
      <RequireAuth>
        <AppShell>
          <p className="text-sm text-rose-600">ID de aula inválido.</p>
        </AppShell>
      </RequireAuth>
    );
  }
  return (
    <RequireAuth>
      <AppShell>
        <StudyView
          aulaId={aulaId}
          requestedSession={Number(sessao)}
          wantResume={resume === "1"}
          wantRestart={restart === "1"}
        />
      </AppShell>
    </RequireAuth>
  );
}

function StudyView({
  aulaId,
  requestedSession,
  wantResume,
  wantRestart,
}: {
  aulaId: number;
  requestedSession: number;
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
  const allQuestions = useMemo<ValidQuestion[]>(() => {
    const entries = validateAndRepair(questoes.data ?? []);
    return entries
      .filter((entry) => entry.status === "valid" || entry.status === "repairable")
      .map((entry) => (entry as { question: ValidQuestion }).question);
  }, [questoes.data]);
  const groups = useMemo(() => groupLessonSessions(allQuestions), [allQuestions]);
  const selectedSession = isLessonSessionNumber(requestedSession)
    ? requestedSession
    : groups.find((group) => group.available)?.session;
  const group = groups.find((item) => item.session === selectedSession);
  const questions = group?.available ? group.questions : [];
  const mode: StudyMode = wantRestart ? "restart" : wantResume ? "resume" : "normal";

  if (questoes.isLoading || !userId) {
    return <p className="text-sm text-slate-500">Preparando sua trilha…</p>;
  }
  if (questoes.error) return <p className="text-sm text-rose-600">Erro ao carregar questões.</p>;
  if (!group) {
    return (
      <div className="space-y-3 rounded-2xl bg-warning-soft p-4 text-warning-soft-foreground">
        <p className="font-semibold">Escolha uma das três sessões desta aula.</p>
        <Link
          to="/aulas/$id/preparar"
          params={{ id: String(aulaId) }}
          className="inline-flex min-h-11 items-center text-sm font-semibold underline"
        >
          Ver sessões
        </Link>
      </div>
    );
  }
  if (!group.available) {
    return (
      <div className="space-y-3 rounded-2xl bg-warning-soft p-4 text-warning-soft-foreground">
        <p className="font-semibold">A sessão {group.session} ainda está bloqueada.</p>
        <p className="text-sm">Ela será liberada em {formatReleaseDate(group.releaseAt)}.</p>
        <Link
          to="/aulas/$id/preparar"
          params={{ id: String(aulaId) }}
          className="inline-flex min-h-11 items-center text-sm font-semibold underline"
        >
          Voltar às sessões
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Sessão {group.session} de 3
        </p>
        <h1 className="font-display text-xl font-bold text-foreground">{group.title}</h1>
        <p className="text-sm text-muted-foreground">
          {questions.length} atividades • você pode sair e retomar depois
        </p>
      </header>
      <StudySession
        aulaId={aulaId}
        userId={userId}
        questions={questions}
        mode={mode}
        sessionScope={`sessao-${group.session}`}
        onModeSelected={(selectedMode) =>
          void navigate({
            to: "/aulas/$id/estudar",
            params: { id: String(aulaId) },
            search:
              selectedMode === "resume"
                ? { sessao: String(group.session), resume: "1" }
                : { sessao: String(group.session), restart: "1" },
            replace: true,
          })
        }
        onComplete={(sessionId) =>
          void navigate({
            to: "/aulas/$id/resultado",
            params: { id: String(aulaId) },
            search: { s: sessionId },
          })
        }
      />
    </div>
  );
}
