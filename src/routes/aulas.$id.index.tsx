import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { getAula, listQuestoesByAula } from "@/data/queries";
import type { ValidQuestion } from "@/domain/questions/questionTypes";
import { validateAndRepair } from "@/domain/questions/questionValidator";
import { replaceIpaWithPortugueseApproximation } from "@/domain/questions/pronunciation";
import { formatReleaseDate, groupLessonSessions } from "@/domain/session/lessonSessions";

export const Route = createFileRoute("/aulas/$id/")({
  ssr: false,
  component: AulaDetailRoute,
});

function AulaDetailRoute() {
  const { id } = Route.useParams();
  const aulaId = Number(id);
  return (
    <RequireAuth>
      <AppShell>
        {!Number.isSafeInteger(aulaId) || aulaId <= 0 ? (
          <p className="text-sm text-rose-600">ID de aula inválido.</p>
        ) : (
          <AulaDetail id={aulaId} />
        )}
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
  const validCount = entries.filter(
    (e) => e.status === "valid" || e.status === "repairable",
  ).length;
  const invalidCount = entries.filter((e) => e.status === "invalid").length;
  const unsupportedCount = entries.filter((e) => e.status === "unsupported").length;
  const validQuestions = entries
    .filter((entry) => entry.status === "valid" || entry.status === "repairable")
    .map((entry) => (entry as { question: ValidQuestion }).question);
  const sessionGroups = groupLessonSessions(validQuestions);

  const section = (title: string, body: React.ReactNode, show: boolean) =>
    show ? (
      <details open className="group rounded-2xl border border-border bg-card p-4 shadow-card">
        <summary className="min-h-11 cursor-pointer list-none font-display text-base font-bold text-foreground">
          {title}
        </summary>
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-foreground">{body}</div>
      </details>
    ) : null;

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs text-slate-500">
          {a.data_aula ?? "sem data"} • {a.status}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{a.titulo ?? "Aula"}</h1>
        {a.tema && <p className="mt-1 text-sm text-slate-600">{a.tema}</p>}
      </header>

      {(a.resumo || a.content.overview) && (
        <section className="rounded-2xl bg-primary-soft p-4 text-primary-soft-foreground">
          <h2 className="font-display text-base font-bold">Resumo detalhado</h2>
          <div className="mt-2 space-y-2 text-sm leading-relaxed">
            {(a.content.overview ?? a.resumo ?? "")
              .split(/\n+/)
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Atividades" value={a.quantidade_atividades || validCount} />
        <Stat label="Prontas" value={validCount} />
        <Stat label="Não compatíveis" value={unsupportedCount + invalidCount} />
      </section>

      {section(
        "Objetivos",
        <ul className="list-disc pl-4">
          {a.content.objectives.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>,
        a.content.objectives.length > 0,
      )}

      {section(
        "O que você precisa lembrar",
        <ul className="list-disc space-y-1 pl-5">
          {a.content.keyTakeaways.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>,
        a.content.keyTakeaways.length > 0,
      )}

      {section(
        "Revisão rápida antes de praticar",
        <ol className="list-decimal space-y-1 pl-5">
          {a.content.preActivityReview.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>,
        a.content.preActivityReview.length > 0,
      )}

      {section(
        "Gramática",
        a.content.grammar.map((g, i) => (
          <article key={i} className="rounded-xl bg-muted p-3">
            <p className="font-semibold">{g.name}</p>
            {g.structure && <p className="mt-1 font-mono text-xs">{g.structure}</p>}
            {g.when_to_use_ptbr && (
              <p className="mt-2 text-sm text-muted-foreground">{g.when_to_use_ptbr}</p>
            )}
            {g.explanation_ptbr && (
              <p className="mt-1 text-sm text-muted-foreground">{g.explanation_ptbr}</p>
            )}
            {g.examples.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                {g.examples.map((e, j) => (
                  <li key={j}>
                    {e.text_english} — <span className="text-slate-500">{e.translation_ptbr}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
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
              {v.definition_english && <p className="mt-1">{v.definition_english}</p>}
              {v.example_en && <p className="mt-1 italic">{v.example_en}</p>}
              {v.usage_note_ptbr && (
                <p className="mt-1 text-muted-foreground">{v.usage_note_ptbr}</p>
              )}
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
            {d.original_english && <p className="whitespace-pre-line">{d.original_english}</p>}
            {d.translation_ptbr && (
              <p className="whitespace-pre-line text-muted-foreground">{d.translation_ptbr}</p>
            )}
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
        "Dúvidas, correções e dicas",
        <ul className="space-y-2">
          {a.content.corrections.map((item, index) => (
            <li key={index} className="rounded-xl bg-muted p-3">
              {item.original && <p className="font-medium">{item.original}</p>}
              {item.corrected && <p className="mt-1 text-success">{item.corrected}</p>}
              {item.note && <p className="mt-1 text-muted-foreground">{item.note}</p>}
            </li>
          ))}
        </ul>,
        a.content.corrections.length > 0,
      )}

      {section(
        "Linha do tempo da aula",
        <ol className="space-y-2">
          {a.content.timeline.map((item, index) => (
            <li key={index} className="grid grid-cols-[auto_1fr] gap-3">
              <span className="font-mono text-xs text-primary">
                {item.start ?? item.timestamp}
                {item.end ? `–${item.end}` : ""}
              </span>
              <span>
                {item.description}
                {item.source ? ` (${item.source})` : ""}
              </span>
            </li>
          ))}
        </ol>,
        a.content.timeline.length > 0,
      )}

      {section(
        "Pronúncia",
        <ul className="space-y-2">
          {a.content.pronunciation.map((item, index) => (
            <li key={index} className="rounded-xl bg-muted p-3">
              <p className="font-semibold">
                {item.term}
                {item.phonetic
                  ? ` — como soa: ${replaceIpaWithPortugueseApproximation(item.phonetic)}`
                  : ""}
              </p>
              {item.tip && (
                <p className="mt-1 text-muted-foreground">
                  {replaceIpaWithPortugueseApproximation(item.tip)}
                </p>
              )}
            </li>
          ))}
        </ul>,
        a.content.pronunciation.length > 0,
      )}

      {section(
        "Quadros de apoio",
        <div className="space-y-3">
          {a.content.visuals.map((visual, index) => (
            <article key={index} className="rounded-xl bg-muted p-3">
              {visual.title && <p className="font-semibold">{visual.title}</p>}
              {visual.description && (
                <p className="mt-1 text-muted-foreground">{visual.description}</p>
              )}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {Object.entries(visual.groups).map(([name, items]) => (
                  <div key={name} className="rounded-lg bg-card p-2">
                    <p className="text-xs font-semibold">{name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{items.join(" • ")}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>,
        a.content.visuals.length > 0,
      )}

      {section(
        "Suas três sessões",
        <div className="space-y-3">
          {sessionGroups.map((session) => (
            <div key={session.session} className="rounded-xl bg-muted p-3">
              <p className="font-semibold">
                Sessão {session.session} — {session.title}
              </p>
              <p className="mt-1 text-muted-foreground">{session.description}</p>
              <p className="mt-2 text-xs font-semibold">
                {session.questions.length} atividades •{" "}
                {session.available
                  ? "disponível"
                  : `libera em ${formatReleaseDate(session.releaseAt)}`}
              </p>
            </div>
          ))}
        </div>,
        sessionGroups.some((session) => session.questions.length > 0),
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
    <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
