import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { RequireAuth } from "@/auth/RequireAuth";
import { useAuth } from "@/auth/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { SessionResult } from "@/components/study/SessionResult";
import { manifestStore } from "@/data/manifestStore";

const search = z.object({ m: z.string().optional() });

export const Route = createFileRoute("/sessao/resultado")({
  ssr: false,
  validateSearch: (raw) => search.parse(raw),
  component: ResultRoute,
});

function ResultRoute() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { m } = Route.useSearch();
  const userId = session?.user.id ?? "";
  const manifest = userId && m ? manifestStore.get(userId, m) : null;

  return (
    <RequireAuth>
      <AppShell>
        {!m || !manifest ? (
          <div className="space-y-3">
            <p className="text-sm text-rose-600">
              Resultado indisponível: manifest ausente ou inválido.
            </p>
            <Link to="/estudar" className="text-sm font-semibold text-purple-700">
              Voltar para Estudar
            </Link>
          </div>
        ) : (
          <SessionResult
            manifest={manifest}
            userId={userId}
            onOpenManifest={(manifestId) =>
              void navigate({ to: "/sessao", search: { m: manifestId } })
            }
          />
        )}
      </AppShell>
    </RequireAuth>
  );
}
