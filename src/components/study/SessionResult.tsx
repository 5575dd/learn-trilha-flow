import { useEffect, useState } from "react";
import { manifestStore, type ManifestStore } from "@/data/manifestStore";
import {
  InMemoryAttemptRepository,
  type AttemptRepository,
} from "@/data/repositories/AttemptRepository";
import type { AttemptRecord } from "@/domain/session/sessionReducer";
import type { SessionManifest } from "@/domain/session/sessionManifest";
import { buildErrorQuestionIdsFromIds } from "@/domain/session/sessionSourceBuilder";

const defaultRepository = new InMemoryAttemptRepository();

export function SessionResult({
  manifest,
  userId,
  store = manifestStore,
  repository = defaultRepository,
  onOpenManifest,
}: {
  manifest: SessionManifest;
  userId: string;
  store?: ManifestStore;
  repository?: AttemptRepository;
  onOpenManifest: (manifestId: string) => void;
}) {
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (manifest.userId !== userId) {
      setError("Esta sessão não pertence ao usuário atual.");
      setLoading(false);
      return;
    }
    void repository
      .load(userId, manifest.id)
      .then(setAttempts)
      .catch(() => setError("Não foi possível carregar o resultado."))
      .finally(() => setLoading(false));
  }, [manifest.id, manifest.userId, repository, userId]);

  if (loading) return <p className="text-sm text-slate-500">Carregando resultado…</p>;
  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (attempts.length === 0) {
    return <p className="text-sm text-amber-700">Esta sessão não possui tentativas salvas.</p>;
  }

  const correct = attempts.filter((attempt) => attempt.result.status === "correct").length;
  const incorrect = attempts.filter((attempt) => attempt.result.status === "incorrect").length;
  const ignored = attempts.length - correct - incorrect;
  const denominator = correct + incorrect;
  const rate = denominator > 0 ? Math.round((correct / denominator) * 100) : null;
  const errorIds = buildErrorQuestionIdsFromIds(attempts, manifest.questionIds);

  function reviewErrors() {
    if (errorIds.length === 0) return;
    try {
      const review = store.create({
        userId,
        source: { kind: "errors", fromSessionId: manifest.id },
        criteria: { fromSessionId: manifest.id },
        questionIds: errorIds,
      });
      onOpenManifest(review.id);
    } catch {
      setError("Não foi possível criar a revisão de erros.");
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Resultado</h1>
        <p className="text-sm text-slate-500">Sessão {manifest.id}</p>
      </header>
      <div className="rounded-3xl bg-gradient-to-br from-purple-600 to-orange-500 p-6 text-white">
        <p className="text-sm opacity-80">Taxa de acerto</p>
        <p className="text-5xl font-bold">{rate === null ? "—" : `${rate}%`}</p>
        <p className="mt-1 text-xs opacity-80">
          {correct} acertos • {incorrect} erros • {ignored} ignoradas
        </p>
      </div>
      {errorIds.length > 0 ? (
        <button
          type="button"
          onClick={reviewErrors}
          className="min-h-12 w-full rounded-2xl bg-purple-600 px-4 text-sm font-semibold text-white"
        >
          Revisar erros desta sessão
        </button>
      ) : (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          Nenhum erro para revisar nesta sessão.
        </p>
      )}
    </div>
  );
}
