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
      className={`rounded-3xl border p-4 shadow-card ${
        isCorrect
          ? "border-transparent bg-success-soft text-success-soft-foreground"
          : isInvalid
            ? "border-transparent bg-warning-soft text-warning-soft-foreground"
            : "border-transparent bg-destructive-soft text-destructive-soft-foreground"
      }`}
    >
      <p className="font-display text-base font-bold">
        {isCorrect ? "Perfeito!" : isInvalid ? "Resposta incompleta" : "Ainda não"}
      </p>
      {!isInvalid && (
        <>
          <p className="mt-2 text-sm">
            <span className="font-semibold">Sua resposta:</span>{" "}
            {result.studentAnswerDisplay || "—"}
          </p>
          {!isCorrect && (
            <p className="mt-1 text-sm">
              <span className="font-semibold">Gabarito:</span> {result.correctAnswerDisplay}
            </p>
          )}
        </>
      )}
      {result.explanation && <p className="mt-2 text-sm opacity-90">{result.explanation}</p>}
      {translation && <p className="mt-1 text-xs opacity-75">{translation}</p>}
      <button
        type="button"
        onClick={onContinue}
        className="mt-4 min-h-12 w-full rounded-2xl bg-foreground px-4 text-base font-semibold text-background transition-transform active:scale-[0.99]"
      >
        Continuar
      </button>
    </div>
  );
}
