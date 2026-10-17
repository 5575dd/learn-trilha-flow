import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, LoaderCircle, TriangleAlert } from "lucide-react";
import { getSupabase } from "@/lib/supabase";

const importLabels: Record<string, string> = {
  waiting: "Aguardando a gravação no portal",
  captured: "Gravação encontrada",
  downloaded: "Gravação recebida para análise",
  processing: "Preparando suas atividades",
  ready: "Atividades disponíveis",
  skipped: "Sem aula · feriado nacional",
  error: "Nova tentativa programada",
};

export function LatestImportStatus() {
  const state = useQuery({
    queryKey: ["latest-import"],
    staleTime: 120_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("lms_imports")
        .select("lesson_date,status,updated_at")
        .order("lesson_date", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] as { lesson_date: string; status: string; updated_at: string } | undefined;
    },
  });
  if (!state.data || !importLabels[state.data.status]) return null;
  const { lesson_date: date, status } = state.data;
  const Icon =
    status === "ready"
      ? CheckCircle2
      : status === "error"
        ? TriangleAlert
        : status === "processing"
          ? LoaderCircle
          : Clock3;
  return (
    <section
      className="flex min-w-0 items-start gap-3 border-y border-border py-4"
      aria-label="Importação da aula"
      role="status"
    >
      <Icon
        className={`mt-0.5 size-5 shrink-0 ${status === "ready" ? "text-emerald-700" : "text-muted-foreground"} ${status === "processing" ? "animate-spin" : ""}`}
        aria-hidden
      />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{importLabels[status]}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Aula de {date.split("-").reverse().join("/")}
        </p>
      </div>
    </section>
  );
}
