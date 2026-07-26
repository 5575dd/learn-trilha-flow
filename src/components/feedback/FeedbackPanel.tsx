import type { EvaluationResult } from "@/domain/answers/evaluationTypes";
import { AccessiblePronunciation } from "@/components/activities/AccessiblePronunciation";

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
  const acceptedWithSpellingWarning = result.diagnosticCode === "match.diacritic_variant";
  const title = acceptedWithSpellingWarning
    ? "Correto, com atenção"
    : isCorrect
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
      ) : acceptedWithSpellingWarning ? (
        <div className="mt-2 space-y-1 text-sm">
          <p>Sua resposta foi aceita porque a diferença foi apenas de acentuação.</p>
          <p>
            <span className="font-semibold">Forma usada na aula:</span>{" "}
            {result.correctAnswerDisplay}
          </p>
        </div>
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
      {result.explanation &&
        (/[\u0250-\u02af\u02c8\u02cc]/u.test(result.explanation) ? (
          <div className="mt-2">
            <AccessiblePronunciation text={result.explanation} />
          </div>
        ) : (
          <p className="mt-2 text-sm opacity-90">{result.explanation}</p>
        ))}
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
