import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { listAulas } from "@/data/queries";

export const Route = createFileRoute("/aulas/")({
  ssr: false,
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
        <h1 className="text-2xl font-bold text-slate-900">Aulas</h1>
        <p className="text-sm text-slate-500">Selecione uma aula para revisar.</p>
      </header>
      {aulas.isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
      {aulas.error && <p className="text-sm text-rose-600">Erro ao carregar aulas.</p>}
      <ul className="space-y-3">
        {(aulas.data ?? []).map((a) => (
          <li key={a.id}>
            <Link
              to="/aulas/$id"
              params={{ id: String(a.id) }}
              className="block rounded-2xl bg-white p-4 shadow-sm"
            >
              <p className="text-xs text-slate-500">{a.data_aula ?? "sem data"}</p>
              <p className="mt-1 font-semibold text-slate-900">{a.titulo ?? "Aula"}</p>
              <p className="mt-1 text-xs text-slate-500">{a.tema ?? ""}</p>
              <p className="mt-1 text-sm text-slate-500">
                {a.quantidade_atividades} atividades • {a.status}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
