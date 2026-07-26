import {
  findIpaExpression,
  findWrittenPronunciationApproximation,
  ipaToPortugueseApproximation,
} from "@/domain/questions/pronunciation";

export function AccessiblePronunciation({ text }: { text: string }) {
  const ipa = findIpaExpression(text);
  if (!ipa) {
    return <p className="text-base text-foreground">{text || "—"}</p>;
  }

  const approximation =
    findWrittenPronunciationApproximation(text) || ipaToPortugueseApproximation(ipa);

  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-primary-soft p-3 text-sm text-primary-soft-foreground">
        <span className="font-semibold">Como soa para brasileiros:</span>{" "}
        {approximation ? `“${approximation}”` : "use o botão para ouvir a palavra"}
      </p>
      <details className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-semibold text-foreground">
          Ver explicação técnica da pronúncia
        </summary>
        <p className="mt-2 font-sans leading-relaxed">{text}</p>
        <p className="mt-2 text-xs">
          Os símbolos entre barras pertencem ao Alfabeto Fonético Internacional (IPA).
        </p>
      </details>
    </div>
  );
}
