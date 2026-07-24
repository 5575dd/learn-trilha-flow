import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { listQuestoesByAula } from "@/data/queries";
import { validateAndRepair } from "@/domain/questions/questionValidator";

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
          <p className="text-sm text-rose-600">ID de aula invÃ¡lido.</p>
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

  if (questoes.isLoading) return <p className="text-sm text-slate-500">Analisando questÃµesâ€¦</p>;
  if (questoes.error) return <p className="text-sm text-rose-600">Erro ao carregar questÃµes.</p>;

  const entries = validateAndRepair(questoes.data ?? []);
  const valids = entries.filter((e) => e.status === "valid" || e.status === "repairable");
  const invalids = entries.filter((e) => e.status === "invalid");
  const unsupported = entries.filter((e) => e.status === "unsupported");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Preparar sessÃ£o</h1>
        <p className="text-sm text-slate-500">
          Revisamos as questÃµes desta aula antes de vocÃª comeÃ§ar.
        </p>
      </header>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Prontas" value={valids.length} tone="ok" />
        <Stat label="Ignoradas" value={unsupported.length} tone="warn" />
        <Stat label="InvÃ¡lidas" value={invalids.length} tone="err" />
      </div>
      {valids.length === 0 ? (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          Nenhuma questÃ£o suportada nesta aula.
        </div>
      ) : (
        <Link
          to="/aulas/$id/estudar"
          params={{ id: String(aulaId) }}
          className="block min-h-12 rounded-2xl bg-purple-600 py-3 text-center text-base font-semibold text-white"
        >
          ComeÃ§ar ({valids.length})
        </Link>
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
