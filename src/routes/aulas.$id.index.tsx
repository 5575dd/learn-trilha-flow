import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { getAula, listQuestoesByAula } from "@/data/queries";
import { validateAndRepair } from "@/domain/questions/questionValidator";

export const Route = createFileRoute("/aulas/$id/")({
  ssr: false,
  component: AulaDetailRoute,
});

function AulaDetailRoute() {
  const { id } = Route.useParams();
  return (
    <RequireAuth>
      <AppShell>
        <AulaDetail id={Number(id)} />
      </AppShell>
    </RequireAuth>
  );
}

function AulaDetail({ id }: { id: number }) {
  const aula = useQuery({ queryKey: ["aula", id], queryFn: () => getAula(id) });
  const questoes = useQuery({
    queryKey: ["questoes", id],
    queryFn: () => listQuestoesByAula(id),
  });

  if (aula.isLoading) return <p className="text-sm text-slate-500">Carregando aula…</p>;
  if (aula.error) return <p className="text-sm text-rose-600">Erro ao carregar aula.</p>;
  if (!aula.data) return <p className="text-sm text-slate-500">Aula não encontrada.</p>;

  const a = aula.data;
  const entries = questoes.data ? validateAndRepair(questoes.data) : [];
  const validCount = entries.filter((e) => e.status === "valid" || e.status === "repairable").length;
  const invalidCount = entries.filter((e) => e.status === "invalid").length;
  const unsupportedCount = entries.filter((e) => e.status === "unsupported").length;

  const section = (title: string, body: React.ReactNode, show: boolean) =>
    show ? (
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500">{title}</h2>
        <div className="mt-2 space-y-2 text-sm text-slate-800">{body}</div>
      </section>
    ) : null;

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs text-slate-500">{a.data_aula ?? "sem data"} • {a.status}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{a.titulo ?? "Aula"}</h1>
        {a.tema && <p className="mt-1 text-sm text-slate-600">{a.tema}</p>}
      </header>

      {a.resumo && (
        <section className="rounded-2xl bg-purple-50 p-4">
          <h2 className="text-sm font-semibold text-purple-800">Resumo</h2>
          <p className="mt-2 text-sm text-slate-800">{a.resumo}</p>
        </section>
      )}

      <section className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Atividades" value={a.quantidade_atividades} />
        <Stat label="Válidas" value={validCount} />
        <Stat label="Ignoradas" value={unsupportedCount + invalidCount} />
      </section>

      {section(
        "Objetivos",
        <ul className="list-disc pl-4">{a.content.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>,
        a.content.objectives.length > 0,
      )}

      {section(
        "Gramática",
        a.content.grammar.map((g, i) => (
          <div key={i}>
            <p className="font-medium">{g.name}</p>
            {g.explanation_ptbr && <p className="text-xs text-slate-600">{g.explanation_ptbr}</p>}
            {g.examples.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-xs text-slate-700">
                {g.examples.slice(0, 3).map((e, j) => (
                  <li key={j}>
                    {e.text_english} — <span className="text-slate-500">{e.translation_ptbr}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )),
        a.content.grammar.length > 0,
      )}

      {section(
        "Vocabulário",
        <ul className="grid grid-cols-2 gap-2 text-xs">
          {a.content.vocabulary.map((v, i) => (
            <li key={i} className="rounded-xl bg-slate-50 p-2">
              <p className="font-medium">{v.word}</p>
              <p className="text-slate-500">{v.meaning_ptbr}</p>
            </li>
          ))}
        </ul>,
        a.content.vocabulary.length > 0,
      )}

      {section(
        "Diálogos",
        a.content.dialogues.map((d, i) => (
          <div key={i}>
            {d.title && <p className="font-medium">{d.title}</p>}
            {d.lines.slice(0, 6).map((l, j) => (
              <p key={j} className="text-xs">
                <span className="font-medium">{l.speaker}: </span>
                {l.text_english}
              </p>
            ))}
          </div>
        )),
        a.content.dialogues.length > 0,
      )}

      {section(
        "Sessões",
        <ul className="list-disc pl-4">
          {a.content.sessions.map((s, i) => (
            <li key={i}>
              <span className="font-medium">{s.name}</span>
              {s.description ? ` — ${s.description}` : ""}
            </li>
          ))}
        </ul>,
        a.content.sessions.length > 0,
      )}

      <Link
        to="/aulas/$id/preparar"
        params={{ id: String(a.id) }}
        className="fixed inset-x-0 bottom-16 z-10 mx-auto block max-w-md px-4"
      >
        <span className="block min-h-12 rounded-2xl bg-purple-600 py-3 text-center text-base font-semibold text-white shadow-md">
          Preparar sessão
        </span>
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="text-lg font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
