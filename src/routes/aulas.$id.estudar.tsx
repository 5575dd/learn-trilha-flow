import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { z } from "zod";
import { RequireAuth } from "@/auth/RequireAuth";
import { useAuth } from "@/auth/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { StudySession, type StudyMode } from "@/components/study/StudySession";
import { listQuestoesByAula } from "@/data/queries";
import { validateAndRepair } from "@/domain/questions/questionValidator";
import type { ValidQuestion } from "@/domain/questions/questionTypes";

const search = z.object({ resume: z.string().optional(), restart: z.string().optional() });

export const Route = createFileRoute("/aulas/$id/estudar")({
  ssr: false,
  validateSearch: (raw) => search.parse(raw),
  component: StudyRoute,
});

function StudyRoute() {
  const { id } = Route.useParams();
  const { resume, restart } = Route.useSearch();
  const aulaId = Number(id);
  if (!Number.isSafeInteger(aulaId) || aulaId <= 0) {
    return (
      <RequireAuth>
        <AppShell>
          <p className="text-sm text-rose-600">ID de aula inválido.</p>
        </AppShell>
      </RequireAuth>
    );
  }
  return (
    <RequireAuth>
      <AppShell>
        <StudyView aulaId={aulaId} wantResume={resume === "1"} wantRestart={restart === "1"} />
      </AppShell>
    </RequireAuth>
  );
}

function StudyView({
  aulaId,
  wantResume,
  wantRestart,
}: {
  aulaId: number;
  wantResume: boolean;
  wantRestart: boolean;
}) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const questoes = useQuery({
    queryKey: ["questoes", aulaId],
    queryFn: () => listQuestoesByAula(aulaId),
  });
  const questions = useMemo<ValidQuestion[]>(() => {
    const entries = validateAndRepair(questoes.data ?? []);
    return entries
      .filter((entry) => entry.status === "valid" || entry.status === "repairable")
      .map((entry) => (entry as { question: ValidQuestion }).question);
  }, [questoes.data]);
  const mode: StudyMode = wantRestart ? "restart" : wantResume ? "resume" : "normal";

  if (questoes.isLoading || !userId) {
    return <p className="text-sm text-slate-500">Preparando sua trilha…</p>;
  }
  if (questoes.error) return <p className="text-sm text-rose-600">Erro ao carregar questões.</p>;

  return (
    <StudySession
      aulaId={aulaId}
      userId={userId}
      questions={questions}
      mode={mode}
      onModeSelected={(selectedMode) =>
        void navigate({
          to: "/aulas/$id/estudar",
          params: { id: String(aulaId) },
          search: selectedMode === "resume" ? { resume: "1" } : { restart: "1" },
          replace: true,
        })
      }
      onComplete={(sessionId) =>
        void navigate({
          to: "/aulas/$id/resultado",
          params: { id: String(aulaId) },
          search: { s: sessionId },
        })
      }
    />
  );
}
