const IPA_EXPRESSION = /\/([^/\n]*[\u0250-\u02af\u02c8\u02cc][^/\n]*)\//i;
const IPA_EXPRESSION_GLOBAL = /\/([^/\n]*[\u0250-\u02af\u02c8\u02cc][^/\n]*)\//gi;

const IPA_SEQUENCES: Array<[RegExp, string]> = [
  [/tʃ/g, "tch"],
  [/dʒ/g, "dj"],
  [/aɪ/g, "ai"],
  [/eɪ/g, "ei"],
  [/(?:oʊ|əʊ)/g, "ou"],
  [/aʊ/g, "au"],
  [/ɔɪ/g, "ói"],
  [/iː/g, "ii"],
  [/uː/g, "uu"],
];

const IPA_CHARACTERS: Record<string, string> = {
  ʌ: "â",
  ə: "a",
  ɪ: "i",
  ʊ: "u",
  ɛ: "é",
  æ: "é",
  ɑ: "á",
  ɒ: "ó",
  ɔ: "ó",
  ɜ: "â",
  ɚ: "âr",
  ɝ: "âr",
  θ: "th",
  ð: "th",
  ʃ: "sh",
  ʒ: "j",
  ŋ: "ng",
  ɹ: "r",
  j: "i",
};

export function findIpaExpression(text: string): string | null {
  return text.match(IPA_EXPRESSION)?.[1] || null;
}

export function findPronunciationTarget(text: string): string | null {
  const match = text.match(/(?:word\s+)?['’‘"]([A-Za-z][A-Za-z -]{0,30})['’‘"]/i);
  return match?.[1]?.trim() || null;
}

export function ipaToPortugueseApproximation(ipa: string): string {
  let approximation = ipa.trim().toLocaleLowerCase();
  IPA_SEQUENCES.forEach(([pattern, replacement]) => {
    approximation = approximation.replace(pattern, replacement);
  });
  approximation = [...approximation]
    .map((character) => IPA_CHARACTERS[character] ?? character)
    .join("");
  return approximation
    .replace(/[ˈˌ]/g, "")
    .replace(/[.·\s]+/g, "-")
    .replace(/[^a-záàâãéêíóôõúçthdjnrwu-]/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function replaceIpaWithPortugueseApproximation(text: string): string {
  return text.replace(IPA_EXPRESSION_GLOBAL, (_expression, ipa: string) => {
    const approximation = ipaToPortugueseApproximation(ipa);
    return approximation ? `“${approximation}”` : "pronúncia disponível em áudio";
  });
}

export function findWrittenPronunciationApproximation(text: string): string | null {
  const match =
    text.match(/sounds?\s+like\s+['’‘"]([^'’‘"]+)['’‘"]/i) ??
    text.match(/soa\s+como\s+['’‘"]([^'’‘"]+)['’‘"]/i);
  return match?.[1]?.trim() || null;
}
