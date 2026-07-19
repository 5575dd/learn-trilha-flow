import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { listAulas, listHistorico } from "@/data/queries";

export const Route = createFileRoute("/")({
  ssr: false,
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Bem-vindo à sua Trilha</h1>
        <p className="text-sm text-slate-500">Escolha uma aula para revisar hoje.</p>
      </header>

      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500">Histórico de estudo</h2>
        {historico.isLoading ? (
          <p className="mt-2 text-sm text-slate-500">Carregando…</p>
        ) : historico.error ? (
          <p className="mt-2 text-sm text-rose-600">Não foi possível carregar o histórico.</p>
        ) : (historico.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nenhum estudo registrado ainda.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {(historico.data ?? []).slice(0, 7).map((h, i) => (
              <li
                key={`${h.data_estudo ?? "sem-data"}-${i}`}
                className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-800"
              >
                {h.data_estudo ?? "sem data"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Suas aulas</h2>
          <Link to="/aulas" className="text-sm font-medium text-purple-700">
            Ver todas
          </Link>
        </div>
        {aulas.isLoading ? (
          <p className="text-sm text-slate-500">Carregando aulas…</p>
        ) : aulas.error ? (
          <p className="text-sm text-rose-600">Erro ao carregar aulas.</p>
        ) : (aulas.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma aula disponível.</p>
        ) : (
          <ul className="space-y-3">
            {(aulas.data ?? []).slice(0, 3).map((a) => (
              <li key={a.id}>
                <Link
                  to="/aulas/$id"
                  params={{ id: String(a.id) }}
                  className="block rounded-2xl bg-white p-4 shadow-sm"
                >
                  <p className="text-xs text-slate-500">{a.data_aula ?? "sem data"}</p>
                  <p className="mt-1 font-semibold text-slate-900">{a.titulo ?? "Aula"}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {a.quantidade_atividades} atividades • {a.status}
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
