import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AulaListItem } from "@/data/queries";
import { manifestStore, type ManifestStore } from "@/data/manifestStore";
import type { AttemptRecord } from "@/domain/session/sessionReducer";
import type { SupportedKind, ValidQuestion } from "@/domain/questions/questionTypes";
import {
  buildAulaQuestionIds,
  buildErrorQuestionIds,
  buildQuestionTypeIds,
  buildQuickQuestionIds,
} from "@/domain/session/sessionSourceBuilder";
import type { SessionCriteria, SessionSource } from "@/domain/session/sessionManifest";
import type { ReviewState } from "@/domain/review/reviewProjection";

export interface StudyHubProps {
  userId: string;
  aulas: readonly AulaListItem[];
  questions: readonly ValidQuestion[];
  attempts: readonly AttemptRecord[];
  dueReviewItems?: readonly ReviewState[];
  reviewLoading?: boolean;
  reviewError?: string;
  reviewLocalOnly?: boolean;
  store?: ManifestStore;
  random?: () => number;
  onOpenManifest: (manifestId: string) => void;
}

export function StudyHub({
  userId,
  aulas,
  questions,
  attempts,
  dueReviewItems = [],
  reviewLoading = false,
  reviewError = "",
  reviewLocalOnly = false,
  store = manifestStore,
  random,
  onOpenManifest,
}: StudyHubProps) {
  const [, refresh] = useState(0);
  const availableAulas = useMemo(
    () => aulas.filter((aula) => buildAulaQuestionIds(questions, aula.id).length > 0),
    [aulas, questions],
  );
  const availableTypes = useMemo(
    () => [...new Set(questions.map((question) => question.kind))].sort() as SupportedKind[],
    [questions],
  );
  const [aulaId, setAulaId] = useState(() => String(availableAulas[0]?.id ?? ""));
  const [questionType, setQuestionType] = useState<SupportedKind | "">(
    () => availableTypes[0] ?? "",
  );
  const [message, setMessage] = useState("");

  useEffect(() => store.subscribe(userId, () => refresh((value) => value + 1)), [store, userId]);
  useEffect(() => {
    if (!aulaId && availableAulas[0]) setAulaId(String(availableAulas[0].id));
  }, [aulaId, availableAulas]);
  useEffect(() => {
    if (!questionType && availableTypes[0]) setQuestionType(availableTypes[0]);
  }, [availableTypes, questionType]);

  let recoverable = null;
  let storageError = "";
  try {
    recoverable = store.findRecoverable(userId);
  } catch {
    storageError = "O armazenamento local não está disponível.";
  }

  function createAndOpen(source: SessionSource, criteria: SessionCriteria, questionIds: number[]) {
    if (questionIds.length === 0) {
      setMessage("Nenhuma questão disponível para este modo.");
      return;
    }
    try {
      const manifest = store.create({ userId, source, criteria, questionIds });
      setMessage("");
      onOpenManifest(manifest.id);
    } catch {
      setMessage("Não foi possível salvar a sessão neste dispositivo.");
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Estudar</h1>
        <p className="text-sm text-slate-500">Escolha um modo para iniciar sua sessão.</p>
      </header>

      {storageError && <p className="text-sm text-rose-600">{storageError}</p>}
      {message && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {message}
        </p>
      )}

      {recoverable ? (
        <StudyCard title="Continuar sessão">
          <p className="text-sm text-slate-500">Retome do ponto em que você parou.</p>
          <Action onClick={() => onOpenManifest(recoverable.id)}>Continuar sessão</Action>
        </StudyCard>
      ) : (
        <p className="text-sm text-slate-500">Nenhuma sessão recuperável.</p>
      )}

      <StudyCard title="Revisão do dia">
        {reviewLoading ? (
          <p className="text-sm text-slate-500">Carregando revisões…</p>
        ) : (
          <>
            {reviewError && <p className="text-sm text-amber-700">{reviewError}</p>}
            {reviewLocalOnly && (
              <p className="text-xs font-medium text-amber-700">Dados somente deste dispositivo</p>
            )}
            {dueReviewItems.length > 0 ? (
              <>
                <p className="text-sm text-slate-600">
                  {dueReviewItems.length}{" "}
                  {dueReviewItems.length === 1 ? "questão vencida" : "questões vencidas"}
                </p>
                <Action
                  onClick={() => {
                    const availableIds = new Set(questions.map((question) => question.id));
                    const ids = [
                      ...new Set(
                        dueReviewItems
                          .map((review) => review.questionId)
                          .filter(
                            (id) => Number.isSafeInteger(id) && id > 0 && availableIds.has(id),
                          ),
                      ),
                    ];
                    if (ids.length === 0) {
                      setMessage("Nenhuma revisão vencida está disponível no momento.");
                      return;
                    }
                    createAndOpen({ kind: "dueReview" }, {}, ids);
                  }}
                >
                  Iniciar revisão do dia
                </Action>
              </>
            ) : (
              <p className="text-sm text-slate-500">Nenhuma revisão vencida hoje.</p>
            )}
          </>
        )}
      </StudyCard>

      <StudyCard title="Sessão rápida">
        <p className="text-sm text-slate-500">Até 10 questões variadas.</p>
        <Action
          onClick={() => {
            const ids = buildQuickQuestionIds(questions, { limit: 10, random });
            createAndOpen({ kind: "quick" }, { limit: 10 }, ids);
          }}
        >
          Iniciar sessão rápida
        </Action>
      </StudyCard>

      <StudyCard title="Revisar erros locais">
        <p className="text-sm text-slate-500">Pratique novamente as respostas incorretas.</p>
        <Action
          onClick={() =>
            createAndOpen({ kind: "errors" }, {}, buildErrorQuestionIds(attempts, questions))
          }
        >
          Revisar erros
        </Action>
      </StudyCard>

      <StudyCard title="Estudar uma aula">
        {availableAulas.length > 0 ? (
          <>
            <select
              aria-label="Aula"
              value={aulaId}
              onChange={(event) => setAulaId(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              {availableAulas.map((aula) => (
                <option key={aula.id} value={aula.id}>
                  {aula.titulo ?? `Aula ${aula.id}`}
                </option>
              ))}
            </select>
            <Action
              onClick={() => {
                const selectedAulaId = Number(aulaId);
                createAndOpen(
                  { kind: "aula", aulaId: selectedAulaId },
                  { aulaId: selectedAulaId },
                  buildAulaQuestionIds(questions, selectedAulaId),
                );
              }}
            >
              Estudar aula
            </Action>
          </>
        ) : (
          <p className="text-sm text-slate-500">Nenhuma aula possui questões disponíveis.</p>
        )}
      </StudyCard>

      <StudyCard title="Praticar por tipo">
        {availableTypes.length > 0 ? (
          <>
            <select
              aria-label="Tipo de questão"
              value={questionType}
              onChange={(event) => setQuestionType(event.target.value as SupportedKind)}
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <Action
              onClick={() => {
                if (!questionType) return;
                createAndOpen(
                  { kind: "questionType", questionType },
                  { questionType },
                  buildQuestionTypeIds(questions, questionType),
                );
              }}
            >
              Praticar tipo
            </Action>
          </>
        ) : (
          <p className="text-sm text-slate-500">Nenhum tipo de questão disponível.</p>
        )}
      </StudyCard>
    </div>
  );
}

function StudyCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function Action({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 w-full rounded-xl bg-purple-600 px-4 text-sm font-semibold text-white"
    >
      {children}
    </button>
  );
}
