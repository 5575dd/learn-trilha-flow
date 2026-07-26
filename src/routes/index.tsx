import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Flame } from "lucide-react";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { listAulas, listHistorico } from "@/data/queries";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Trilha — Revisão de inglês aula por aula" },
      {
        name: "description",
        content:
          "Retome sua trilha de inglês: revise aulas, pratique atividades e acompanhe seu progresso real.",
      },
      { property: "og:title", content: "Trilha — Revisão de inglês aula por aula" },
      {
        property: "og:description",
        content:
          "Retome sua trilha de inglês: revise aulas, pratique atividades e acompanhe seu progresso real.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <RequireAuth>
      <AppShell>
        <Home />
      </AppShell>
    </RequireAuth>
  );
}

function Home() {
  const aulas = useQuery({ queryKey: ["aulas"], queryFn: listAulas });
  const historico = useQuery({ queryKey: ["historico"], queryFn: listHistorico });
  const dias = (historico.data ?? []).slice(0, 7);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-brand p-5 text-primary-foreground shadow-float">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-80">Sua trilha</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-balance-tight">
          Bem-vindo à sua Trilha
        </h1>
        <p className="mt-1 text-sm opacity-90">Escolha uma aula para revisar hoje.</p>
        <Link
          to="/estudar"
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-card px-4 text-sm font-semibold text-primary shadow-card transition-transform active:scale-[0.98]"
        >
          Estudar agora
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>

      <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="min-w-0 truncate text-sm font-semibold text-muted-foreground">
            Histórico de estudo
          </h2>
          <Flame className="h-4 w-4 shrink-0 text-accent" aria-hidden />
        </div>
        {historico.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>
        ) : historico.error ? (
          <p className="mt-3 text-sm text-destructive">Não foi possível carregar o histórico.</p>
        ) : dias.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhum estudo registrado ainda.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {dias.map((h, i) => (
              <li
                key={`${h.data_estudo ?? "sem-data"}-${i}`}
                className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-foreground"
              >
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                {h.data_estudo ?? "sem data"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="min-w-0 truncate font-display text-lg font-semibold">Suas aulas</h2>
          <Link
            to="/aulas"
            className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-primary"
          >
            Ver todas
          </Link>
        </div>
        {aulas.isLoading ? (
          <ul className="space-y-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
            ))}
          </ul>
        ) : aulas.error ? (
          <p className="text-sm text-destructive">Erro ao carregar aulas.</p>
        ) : (aulas.data ?? []).length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            Nenhuma aula disponível.
          </p>
        ) : (
          <ul className="space-y-3">
            {(aulas.data ?? []).slice(0, 3).map((a) => (
              <li key={a.id}>
                <Link
                  to="/aulas/$id"
                  params={{ id: String(a.id) }}
                  className="block rounded-2xl border border-border bg-card p-4 shadow-card transition-transform active:scale-[0.99]"
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {a.data_aula ?? "sem data"}
                  </p>
                  <p className="mt-1 font-display font-semibold text-balance-tight">
                    {a.titulo ?? "Aula"}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-1 font-medium">
                      {a.quantidade_atividades} atividades
                    </span>
                    <span className="rounded-full bg-muted px-2 py-1 font-medium">{a.status}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
