import type { EvaluationResult } from "@/domain/answers/evaluationTypes";

export function FeedbackPanel({
  result,
  translation,
  onContinue,
}: {
  result: EvaluationResult;
  translation?: string;
  onContinue: () => void;
}) {
  const isCorrect = result.status === "correct";
  const isInvalid = result.status === "invalid";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-2xl p-4 ${
        isCorrect
          ? "bg-emerald-50 text-emerald-900"
          : isInvalid
            ? "bg-amber-50 text-amber-900"
            : "bg-rose-50 text-rose-900"
      }`}
    >
      <p className="text-sm font-semibold">
        {isCorrect ? "Perfeito!" : isInvalid ? "Resposta incompleta" : "Ainda não"}
      </p>
      {!isInvalid && (
        <>
          <p className="mt-2 text-sm">
            <span className="font-medium">Sua resposta:</span> {result.studentAnswerDisplay || "—"}
          </p>
          {!isCorrect && (
            <p className="mt-1 text-sm">
              <span className="font-medium">Gabarito:</span> {result.correctAnswerDisplay}
            </p>
          )}
        </>
      )}
      {result.explanation && <p className="mt-2 text-sm">{result.explanation}</p>}
      {translation && <p className="mt-1 text-xs opacity-80">{translation}</p>}
      <button
        type="button"
        onClick={onContinue}
        className="mt-4 min-h-12 w-full rounded-2xl bg-slate-900 px-4 text-base font-semibold text-white"
      >
        Continuar
      </button>
    </div>
  );
}
