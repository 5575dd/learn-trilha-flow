import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { listQuestoesByAula } from "@/data/queries";
import { validateAndRepair } from "@/domain/questions/questionValidator";
import type { ValidQuestion } from "@/domain/questions/questionTypes";
import { formatReleaseDate, groupLessonSessions } from "@/domain/session/lessonSessions";
import { useLearningProgress } from "@/hooks/useLearningProgress";
import { LessonProgressBadge } from "@/components/study/LessonProgressBadge";
import { LessonSessionActions } from "@/components/study/LessonSessionActions";

export const Route = createFileRoute("/aulas/$id/preparar")({
  ssr: false,
  component: Prepare,
});

function Prepare() {
  const { id } = Route.useParams();
  const aulaId = Number(id);
  return (
    <RequireAuth>
      <AppShell>
        {!Number.isSafeInteger(aulaId) || aulaId <= 0 ? (
          <p className="text-sm text-rose-600">ID de aula inválido.</p>
        ) : (
          <PrepareView aulaId={aulaId} />
        )}
      </AppShell>
    </RequireAuth>
  );
}

function PrepareView({ aulaId }: { aulaId: number }) {
  const learning = useLearningProgress();
  const questoes = useQuery({
    queryKey: ["questoes", aulaId],
    queryFn: () => listQuestoesByAula(aulaId),
  });

  if (questoes.isLoading) return <p className="text-sm text-slate-500">Analisando questões…</p>;
  if (questoes.error) return <p className="text-sm text-rose-600">Erro ao carregar questões.</p>;

  const entries = validateAndRepair(questoes.data ?? []);
  const valids = entries.filter((e) => e.status === "valid" || e.status === "repairable");
  const invalids = entries.filter((e) => e.status === "invalid");
  const unsupported = entries.filter((e) => e.status === "unsupported");
  const questions = valids.map((entry) => (entry as { question: ValidQuestion }).question);
  const sessions = groupLessonSessions(questions);
  const progress = learning.getLesson(aulaId);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Preparar sessão</h1>
        <div className="mt-3">
          <LessonProgressBadge
            progress={progress}
            loading={learning.isLoading}
            error={!!learning.error}
          />
        </div>
        {learning.warning && <p className="mt-2 text-xs text-amber-800">{learning.warning}</p>}
      </header>
      {questions.length === 0 ? (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          Nenhuma questão suportada nesta aula.
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <section
              key={session.session}
              className="rounded-3xl border border-border bg-card p-4 shadow-card"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft font-display text-base font-bold text-primary-soft-foreground">
                  {session.session}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-base font-bold text-foreground">
                    {session.title}
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">
                    {session.questions.length} atividades
                  </p>
                </div>
              </div>

              {session.available ? (
                <LessonSessionActions
                  aulaId={aulaId}
                  compact
                  loading={learning.isLoading}
                  error={!!learning.error}
                  progress={
                    progress.sessions.find((item) => item.session === session.session) ?? {
                      session: session.session,
                      total: session.questions.length,
                      answered: 0,
                      completed: false,
                      available: true,
                    }
                  }
                />
              ) : session.questions.length === 0 ? (
                <p className="mt-4 rounded-xl bg-muted p-3 text-center text-sm text-muted-foreground">
                  Nenhuma atividade nesta sessão.
                </p>
              ) : (
                <p className="mt-4 rounded-xl bg-warning-soft p-3 text-center text-sm font-medium text-warning-soft-foreground">
                  Libera em {formatReleaseDate(session.releaseAt)}
                </p>
              )}
            </section>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2" aria-label="Disponibilidade das atividades">
        <Stat label="Prontas" value={valids.length} tone="ok" />
        <Stat label="Ignoradas" value={unsupported.length} tone="warn" />
        <Stat label="Inválidas" value={invalids.length} tone="err" />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "err";
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-800"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800"
        : "bg-rose-50 text-rose-800";
  return (
    <div className={`rounded-2xl p-3 text-center ${cls}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}
