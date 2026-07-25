import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { StudySession } from "@/components/study/StudySession";
import { listQuestoesByIds, type QuestionsByIdsResult } from "@/data/queries";
import type { AttemptRepository } from "@/data/repositories/AttemptRepository";
import { attemptRepository } from "@/data/repositories/DualAttemptRepository";
import { manifestStore, type ManifestStore } from "@/data/manifestStore";
import { validateAndRepair } from "@/domain/questions/questionValidator";
import type { ValidQuestion } from "@/domain/questions/questionTypes";
import type { SessionManifest } from "@/domain/session/sessionManifest";

const defaultRepository = attemptRepository;

export interface SessionRunnerProps {
  manifest: SessionManifest;
  userId: string;
  store?: ManifestStore;
  repository?: AttemptRepository;
  loadQuestions?: (ids: readonly number[]) => Promise<QuestionsByIdsResult>;
  onComplete?: (manifestId: string) => void;
}

export function SessionRunner({
  manifest,
  userId,
  store = manifestStore,
  repository = defaultRepository,
  loadQuestions = listQuestoesByIds,
  onComplete,
}: SessionRunnerProps) {
  const questionIdsKey = manifest.questionIds.join(",");
  const query = useQuery({
    queryKey: ["manifest-questions", manifest.id, questionIdsKey],
    queryFn: () => loadQuestions(manifest.questionIds),
    enabled: manifest.userId === userId,
  });

  useEffect(() => {
    if (manifest.userId === userId && manifest.status !== "completed") {
      store.markActive(userId, manifest.id);
    }
  }, [manifest.id, manifest.status, manifest.userId, store, userId]);

  const questions = useMemo<ValidQuestion[]>(() => {
    const entries = validateAndRepair(query.data?.questions ?? []);
    return entries
      .filter((entry) => entry.status === "valid" || entry.status === "repairable")
      .map((entry) => (entry as { question: ValidQuestion }).question);
  }, [query.data?.questions]);

  const unavailableIds = useMemo(() => {
    const available = new Set(questions.map((question) => question.id));
    return manifest.questionIds.filter((id) => !available.has(id));
  }, [manifest.questionIds, questions]);

  const manifestIndexes = useMemo(
    () => questions.map((question) => manifest.questionIds.indexOf(question.id)),
    [manifest.questionIds, questions],
  );
  const initialRunnerIndex = useMemo(() => {
    const index = manifestIndexes.findIndex(
      (manifestIndex) => manifestIndex >= manifest.currentIndex,
    );
    return index < 0 ? questions.length : index;
  }, [manifest.currentIndex, manifestIndexes, questions.length]);

  const updateIndex = useCallback(
    (index: number) => {
      const manifestIndex =
        index >= manifestIndexes.length
          ? manifest.questionIds.length
          : (manifestIndexes[index] ?? manifest.currentIndex);
      store.update(userId, manifest.id, { currentIndex: manifestIndex });
    },
    [
      manifest.currentIndex,
      manifest.id,
      manifest.questionIds.length,
      manifestIndexes,
      store,
      userId,
    ],
  );

  const complete = useCallback(() => {
    store.markCompleted(userId, manifest.id);
    onComplete?.(manifest.id);
  }, [manifest.id, onComplete, store, userId]);

  const managedSession = useMemo(
    () => ({
      id: manifest.id,
      currentIndex: initialRunnerIndex,
      onCurrentIndexChange: updateIndex,
      onComplete: complete,
      mode: manifest.source.kind,
    }),
    [complete, initialRunnerIndex, manifest.id, manifest.source.kind, updateIndex],
  );

  if (manifest.userId !== userId) {
    return <p className="text-sm text-rose-600">Esta sessão não pertence ao usuário atual.</p>;
  }
  if (query.isLoading) {
    return <p className="text-sm text-slate-500">Carregando sessão…</p>;
  }
  if (query.error) {
    return <p className="text-sm text-rose-600">Não foi possível carregar as questões.</p>;
  }
  if (questions.length === 0) {
    return (
      <p className="text-sm text-amber-700">
        Nenhuma questão desta sessão está disponível no momento.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {unavailableIds.length > 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          {unavailableIds.length} questão(ões) não está(ão) mais disponível(is) e foi(ram)
          ignorada(s).
        </p>
      )}
      <StudySession
        aulaId={manifest.source.kind === "aula" ? manifest.source.aulaId : 0}
        userId={userId}
        questions={questions}
        mode="resume"
        repository={repository}
        managedSession={managedSession}
      />
    </div>
  );
}
