import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { listQuestoesByAula } from "@/data/queries";
import { validateAndRepair } from "@/domain/questions/questionValidator";
import type { ValidQuestion } from "@/domain/questions/questionTypes";
import { formatReleaseDate, groupLessonSessions } from "@/domain/session/lessonSessions";

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

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Preparar sessão</h1>
        <p className="text-sm text-slate-500">
          Esta aula é revisada em três momentos diferentes. Você pode pausar e retomar.
        </p>
      </header>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Prontas" value={valids.length} tone="ok" />
        <Stat label="Ignoradas" value={unsupported.length} tone="warn" />
        <Stat label="Inválidas" value={invalids.length} tone="err" />
      </div>
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
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-soft font-display text-lg font-bold text-primary-soft-foreground">
                  {session.session}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-base font-bold text-foreground">
                    {session.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{session.description}</p>
                  <p className="mt-2 text-xs font-semibold text-muted-foreground">
                    {session.questions.length} atividades
                  </p>
                </div>
              </div>

              {session.available ? (
                <Link
                  to="/aulas/$id/estudar"
                  params={{ id: String(aulaId) }}
                  search={{ sessao: String(session.session) }}
                  className="mt-4 block min-h-12 rounded-2xl bg-primary py-3 text-center text-base font-semibold text-primary-foreground"
                >
                  Começar sessão {session.session}
                </Link>
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
