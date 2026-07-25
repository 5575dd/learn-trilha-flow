import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { RequireAuth } from "@/auth/RequireAuth";
import { useAuth } from "@/auth/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { StudyHub } from "@/components/study/StudyHub";
import { listAulas, listQuestoesDisponiveis } from "@/data/queries";
import { attemptRepository } from "@/data/repositories/DualAttemptRepository";
import { validateAndRepair } from "@/domain/questions/questionValidator";
import type { ValidQuestion } from "@/domain/questions/questionTypes";

const repository = attemptRepository;

export const Route = createFileRoute("/estudar")({
  ssr: false,
  component: StudyRoute,
});

function StudyRoute() {
  return (
    <RequireAuth>
      <AppShell>
        <StudyPage />
      </AppShell>
    </RequireAuth>
  );
}

function StudyPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const aulas = useQuery({ queryKey: ["aulas"], queryFn: listAulas });
  const rawQuestions = useQuery({
    queryKey: ["questoes-disponiveis"],
    queryFn: listQuestoesDisponiveis,
  });
  const attempts = useQuery({
    queryKey: ["tentativas-locais", userId],
    queryFn: () => repository.listByUser(userId),
    enabled: !!userId,
  });
  const questions = useMemo<ValidQuestion[]>(() => {
    const entries = validateAndRepair(rawQuestions.data ?? []);
    return entries
      .filter((entry) => entry.status === "valid" || entry.status === "repairable")
      .map((entry) => (entry as { question: ValidQuestion }).question);
  }, [rawQuestions.data]);

  if (aulas.isLoading || rawQuestions.isLoading || attempts.isLoading || !userId) {
    return <p className="text-sm text-slate-500">Carregando modos de estudo…</p>;
  }
  if (aulas.error || rawQuestions.error || attempts.error) {
    return <p className="text-sm text-rose-600">Não foi possível carregar os modos de estudo.</p>;
  }

  return (
    <StudyHub
      userId={userId}
      aulas={aulas.data ?? []}
      questions={questions}
      attempts={attempts.data ?? []}
      onOpenManifest={(manifestId) => void navigate({ to: "/sessao", search: { m: manifestId } })}
    />
  );
}
