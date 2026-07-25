import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { RequireAuth } from "@/auth/RequireAuth";
import { useAuth } from "@/auth/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { SessionRunner } from "@/components/study/SessionRunner";
import { hydrateManifestStore, manifestStore } from "@/data/manifestStore";

const search = z.object({ m: z.string().optional() });

export const Route = createFileRoute("/sessao/")({
  ssr: false,
  validateSearch: (raw) => search.parse(raw),
  component: SessionRoute,
});

function SessionRoute() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { m } = Route.useSearch();
  const userId = session?.user.id ?? "";
  const hydration = useQuery({
    queryKey: ["manifest-hydration", userId, m],
    queryFn: () => hydrateManifestStore(userId, { manifestId: m }),
    enabled: !!userId && !!m,
  });
  const manifest = userId && m ? manifestStore.get(userId, m) : null;

  return (
    <RequireAuth>
      <AppShell>
        {hydration.isLoading && !manifest ? (
          <p className="text-sm text-slate-500">Recuperando sessão…</p>
        ) : !m || !manifest ? (
          <InvalidSession />
        ) : manifest.status === "abandoned" ? (
          <div className="space-y-3">
            <p className="text-sm text-amber-700">Esta sessão foi abandonada.</p>
            <Link to="/estudar" className="text-sm font-semibold text-purple-700">
              Voltar para Estudar
            </Link>
          </div>
        ) : manifest.status === "completed" ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">Esta sessão já foi concluída.</p>
            <Link
              to="/sessao/resultado"
              search={{ m: manifest.id }}
              className="text-sm font-semibold text-purple-700"
            >
              Ver resultado
            </Link>
          </div>
        ) : (
          <SessionRunner
            manifest={manifest}
            userId={userId}
            onComplete={(manifestId) =>
              void navigate({ to: "/sessao/resultado", search: { m: manifestId } })
            }
          />
        )}
      </AppShell>
    </RequireAuth>
  );
}

function InvalidSession() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-rose-600">Sessão ausente, inválida ou não encontrada.</p>
      <Link to="/estudar" className="text-sm font-semibold text-purple-700">
        Voltar para Estudar
      </Link>
    </div>
  );
}
