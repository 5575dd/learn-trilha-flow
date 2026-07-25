import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/auth/RequireAuth";
import { useAuth } from "@/auth/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { hydrateManifestStore } from "@/data/manifestStore";
import { listQuestoesDisponiveis } from "@/data/queries";
import { consolidatedAttemptReadService } from "@/data/repositories/ConsolidatedAttemptRepository";
import { reviewRepository } from "@/data/repositories/ReviewRepository";
import {
  buildProgressSummary,
  sessionSourceLabel,
  type ProgressMetrics,
} from "@/domain/progress/progressSummary";
import type { ValidQuestion } from "@/domain/questions/questionTypes";
import { validateAndRepair } from "@/domain/questions/questionValidator";

export const Route = createFileRoute("/progresso")({
  ssr: false,
  component: ProgressRoute,
});

function ProgressRoute() {
  return (
    <RequireAuth>
      <AppShell>
        <ProgressPage />
      </AppShell>
    </RequireAuth>
  );
}

function ProgressPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const questionsQuery = useQuery({
    queryKey: ["questoes-disponiveis"],
    queryFn: listQuestoesDisponiveis,
  });
  const progressQuery = useQuery({
    queryKey: ["progresso", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [attempts, reviews, hydration] = await Promise.all([
        consolidatedAttemptReadService.listByUser(userId),
        reviewRepository.listDue(userId),
        hydrateManifestStore(userId, { includeHistory: true }),
      ]);
      return {
        attempts,
        reviews,
        hydration,
        localOnly: attempts.localOnly || reviews.localOnly || hydration.localOnly,
        warning: [attempts.error, reviews.error, hydration.error].filter(Boolean).join(" "),
      };
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => {
      setOnline(true);
      void progressQuery.refetch();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [progressQuery]);

  const questions = useMemo<ValidQuestion[]>(() => {
    const entries = validateAndRepair(questionsQuery.data ?? []);
    return entries
      .filter((entry) => entry.status === "valid" || entry.status === "repairable")
      .map((entry) => (entry as { question: ValidQuestion }).question);
  }, [questionsQuery.data]);
  const summary = useMemo(
    () =>
      buildProgressSummary({
        entries: progressQuery.data?.attempts.entries ?? [],
        manifests: progressQuery.data?.hydration.manifests ?? [],
        questions,
        dueReviewsToday: progressQuery.data?.reviews.reviews.length ?? 0,
      }),
    [progressQuery.data, questions],
  );

  if (progressQuery.isLoading || !userId) {
    return <p className="text-sm text-slate-500">Carregando progresso…</p>;
  }
  if (progressQuery.error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-600">Não foi possível carregar o progresso local.</p>
        <button
          type="button"
          className="text-sm font-semibold text-purple-700"
          onClick={() => void progressQuery.refetch()}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const empty = summary.metrics.totalAttempts === 0 && summary.history.length === 0;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Progresso</h1>
        <p className="text-sm text-slate-500">Seu histórico real de estudo e revisão.</p>
      </header>

      {!online && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Offline — exibindo dados salvos neste dispositivo.
        </p>
      )}
      {progressQuery.data?.localOnly && online && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Dados somente deste dispositivo.
        </p>
      )}
      {progressQuery.data?.warning && (
        <p className="text-sm text-amber-700">{progressQuery.data.warning}</p>
      )}

      {empty ? (
        <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">
          Seu progresso aparecerá aqui depois da primeira sessão.
        </p>
      ) : (
        <>
          <Metrics metrics={summary.metrics} />

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Histórico recente</h2>
            {summary.history.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma sessão registrada.</p>
            ) : (
              summary.history.map((item) => (
                <article
                  key={item.manifestId}
                  className="space-y-2 rounded-2xl bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {sessionSourceLabel(item.source)}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(item.date)}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    {item.questionCount} questões · progresso {item.currentIndex}/
                    {item.questionCount}
                  </p>
                  {item.recoverable && (
                    <HistoryAction
                      label="Continuar"
                      onClick={() =>
                        void navigate({
                          to: "/sessao",
                          search: { m: item.manifestId },
                        })
                      }
                    />
                  )}
                  {item.resultAvailable && (
                    <HistoryAction
                      label="Ver resultado"
                      onClick={() =>
                        void navigate({
                          to: "/sessao/resultado",
                          search: { m: item.manifestId },
                        })
                      }
                    />
                  )}
                </article>
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Desempenho</h2>
            {summary.performance.length === 0 ? (
              <p className="rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm">
                Dados insuficientes para resumir por tipo de questão.
              </p>
            ) : (
              summary.performance.map((item) => {
                const percent =
                  item.accuracyRate === null ? null : Math.round(item.accuracyRate * 100);
                return (
                  <article key={item.kind} className="rounded-2xl bg-white p-4 shadow-sm">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-slate-800">{item.kind}</span>
                      <span className="text-slate-600">
                        {percent === null ? "Dados insuficientes" : `${percent}%`}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full bg-purple-600" style={{ width: `${percent ?? 0}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {item.correct} corretas · {item.incorrect} incorretas
                    </p>
                  </article>
                );
              })
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Metrics({ metrics }: { metrics: ProgressMetrics }) {
  const rate = metrics.accuracyRate === null ? "—" : `${Math.round(metrics.accuracyRate * 100)}%`;
  const minutes = Math.round(metrics.totalStudyTimeMs / 60_000);
  const items = [
    ["Tentativas", metrics.totalAttempts],
    ["Corretas", metrics.correct],
    ["Incorretas", metrics.incorrect],
    ["Taxa de acerto", rate],
    ["Questões únicas", metrics.uniqueQuestions],
    ["Tempo de estudo", `${minutes} min`],
    ["Sessões concluídas", metrics.completedSessions],
    ["Revisões vencidas", metrics.dueReviewsToday],
  ];
  return (
    <section className="grid grid-cols-2 gap-3" aria-label="Indicadores de progresso">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        </div>
      ))}
    </section>
  );
}

function HistoryAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="min-h-10 w-full rounded-xl bg-purple-600 px-3 text-sm font-semibold text-white"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function statusLabel(status: "created" | "active" | "completed" | "abandoned"): string {
  return {
    created: "Criada",
    active: "Em andamento",
    completed: "Concluída",
    abandoned: "Abandonada",
  }[status];
}
