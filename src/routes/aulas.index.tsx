import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { listAulas } from "@/data/queries";

export const Route = createFileRoute("/aulas/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Aulas de inglês para revisar — Trilha" },
      {
        name: "description",
        content:
          "Todas as suas aulas de inglês em um só lugar: escolha uma aula e comece a revisão guiada.",
      },
      { property: "og:title", content: "Aulas de inglês para revisar — Trilha" },
      {
        property: "og:description",
        content: "Escolha uma aula de inglês e comece a revisão guiada na Trilha.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <AulasList />
      </AppShell>
    </RequireAuth>
  ),
});

function AulasList() {
  const aulas = useQuery({ queryKey: ["aulas"], queryFn: listAulas });
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-bold">Aulas</h1>
        <p className="text-sm text-muted-foreground">Selecione uma aula para revisar.</p>
      </header>
      {aulas.isLoading && (
        <ul className="space-y-3" aria-label="Carregando…">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </ul>
      )}
      {aulas.error && (
        <p className="rounded-2xl bg-destructive-soft p-4 text-sm font-medium text-destructive-soft-foreground">
          Erro ao carregar aulas.
        </p>
      )}
      {!aulas.isLoading && !aulas.error && (aulas.data ?? []).length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma aula disponível.
        </p>
      )}
      <ul className="space-y-3">
        {(aulas.data ?? []).map((a) => (
          <li key={a.id}>
            <Link
              to="/aulas/$id"
              params={{ id: String(a.id) }}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card transition-transform active:scale-[0.99]"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  {a.data_aula ?? "sem data"}
                </p>
                <p className="mt-1 font-display font-semibold text-balance-tight">
                  {a.titulo ?? "Aula"}
                </p>
                {a.tema && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.tema}</p>
                )}
                <p className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-1 font-medium">
                    {a.quantidade_atividades} atividades
                  </span>
                  <span className="rounded-full bg-muted px-2 py-1 font-medium">{a.status}</span>
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
