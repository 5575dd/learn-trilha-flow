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
  const isSelfEvaluation = result.status === "neutral" || result.status === "skipped";
  const remembered = result.diagnosticCode === "selfeval.know";
  const title = isCorrect
    ? "Perfeito!"
    : isInvalid
      ? "Resposta incompleta"
      : isSelfEvaluation
        ? remembered
          ? "Ótimo, registrado!"
          : "Tudo bem, vamos revisar"
        : "Ainda não";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-3xl border p-4 shadow-card ${
        isCorrect
          ? "border-transparent bg-success-soft text-success-soft-foreground"
          : isSelfEvaluation
            ? remembered
              ? "border-transparent bg-primary-soft text-primary-soft-foreground"
              : "border-transparent bg-warning-soft text-warning-soft-foreground"
            : isInvalid
              ? "border-transparent bg-warning-soft text-warning-soft-foreground"
              : "border-transparent bg-destructive-soft text-destructive-soft-foreground"
      }`}
    >
      <p className="font-display text-base font-bold">{title}</p>
      {isSelfEvaluation ? (
        <p className="mt-2 text-sm">
          {remembered
            ? "Você marcou este conteúdo como dominado."
            : "Este conteúdo ficará sinalizado como ponto de revisão."}
        </p>
      ) : (
        !isInvalid && (
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
        )
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
