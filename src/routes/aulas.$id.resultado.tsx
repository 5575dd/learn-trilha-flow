import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { RequireAuth } from "@/auth/RequireAuth";
import { useAuth } from "@/auth/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { InMemoryAttemptRepository } from "@/data/repositories/AttemptRepository";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

const search = z.object({ s: z.string().default("") });

export const Route = createFileRoute("/aulas/$id/resultado")({
  ssr: false,
  validateSearch: (raw) => search.parse(raw),
  component: ResultRoute,
});

const repo = new InMemoryAttemptRepository();

function ResultRoute() {
  const { id } = Route.useParams();
  const { s } = Route.useSearch();
  const aulaId = Number(id);
  return (
    <RequireAuth>
      <AppShell>
        {!Number.isSafeInteger(aulaId) || aulaId <= 0 ? (
          <p className="text-sm text-rose-600">ID de aula inválido.</p>
        ) : (
          <Result aulaId={aulaId} sessionId={s} />
        )}
      </AppShell>
    </RequireAuth>
  );
}

function Result({ aulaId, sessionId }: { aulaId: number; sessionId: string }) {
  const { session } = useAuth();
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!sessionId || !session?.user.id) {
      setLoadError("Sessão ausente ou inválida.");
      setLoading(false);
      return;
    }
    void repo
      .load(session.user.id, sessionId)
      .then((loaded) => {
        if (loaded.length === 0) {
          setLoadError("Esta sessão não existe ou não possui tentativas.");
        } else {
          setAttempts(loaded);
        }
      })
      .catch(() => setLoadError("Não foi possível carregar o resultado salvo."))
      .finally(() => setLoading(false));
  }, [sessionId, session?.user.id]);

  if (loading) return <p className="text-sm text-slate-500">Carregando resultado…</p>;
  if (loadError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-600">{loadError}</p>
        <Link to="/" className="text-sm font-medium text-purple-700">
          Voltar ao início
        </Link>
      </div>
    );
  }

  const correct = attempts.filter((a) => a.result.status === "correct").length;
  const incorrect = attempts.filter((a) => a.result.status === "incorrect").length;
  const ignored = attempts.filter(
    (a) => a.result.status === "neutral" || a.result.status === "invalid",
  ).length;
  const denom = correct + incorrect;
  const rate = denom === 0 ? 0 : Math.round((correct / denom) * 100);
  const errors = attempts.filter((a) => a.result.status === "incorrect");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Resultado</h1>
        <p className="text-sm text-slate-500">Aula #{aulaId}</p>
      </header>
      <div className="rounded-3xl bg-gradient-to-br from-purple-600 to-orange-500 p-6 text-white shadow-md">
        <p className="text-sm opacity-80">Taxa de acerto</p>
        <p className="text-5xl font-bold">{rate}%</p>
        <p className="mt-1 text-xs opacity-80">
          {correct} acertos • {incorrect} erros • {ignored} ignoradas
        </p>
      </div>

      {errors.length > 0 && (
        <button
          type="button"
          onClick={() => setShowErrors((v) => !v)}
          className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800"
        >
          {showErrors ? "Esconder erros" : `Revisar erros (${errors.length})`}
        </button>
      )}

      {showErrors && (
        <ul className="space-y-2">
          {errors.map((a) => (
            <li key={a.attemptId} className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-xs text-slate-500">Questão #{a.questionId}</p>
              <p className="text-sm">
                <span className="font-medium">Sua resposta:</span> {a.result.studentAnswerDisplay}
              </p>
              <p className="text-sm text-emerald-700">
                <span className="font-medium">Gabarito:</span> {a.result.correctAnswerDisplay}
              </p>
              {a.result.explanation && (
                <p className="mt-1 text-xs text-slate-600">{a.result.explanation}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Link
          to="/aulas/$id"
          params={{ id: String(aulaId) }}
          className="min-h-12 rounded-2xl border border-slate-200 bg-white py-3 text-center text-sm font-medium text-slate-800"
        >
          Voltar à aula
        </Link>
        <Link
          to="/"
          className="min-h-12 rounded-2xl bg-purple-600 py-3 text-center text-sm font-semibold text-white"
        >
          Início
        </Link>
      </div>
    </div>
  );
}
