// Central answer normalization. NEVER modify to be lossy for gameplay.
// - NFKC unicode
// - strip invisible characters
// - normalize whitespace + quotes + dashes
// - lowercase
// - strip trailing punctuation (?, !, ., …)
// - preserves internal word order / interior punctuation

const INVISIBLES = /[\u200B-\u200D\uFEFF\u00A0]/g;
const SMART_QUOTES: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2013": "-",
  "\u2014": "-",
};

export function normalizeAnswer(input: string | null | undefined): string {
  if (input == null) return "";
  let s = String(input).normalize("NFKC");
  s = s.replace(INVISIBLES, " ");
  s = s.replace(/[\u2018\u2019\u201C\u201D\u2013\u2014]/g, (c) => SMART_QUOTES[c] ?? c);
  s = s.replace(/\r\n?/g, "\n");
  s = s.replace(/\s+/g, " ").trim();
  s = s.toLowerCase();
  // Strip only trailing punctuation (?, !, ., …, ,, ;, :)
  s = s.replace(/[?!.,;:\u2026]+$/g, "").trim();
  return s;
}

export function answersEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeAnswer(a);
  const nb = normalizeAnswer(b);
  if (!na || !nb) return false;
  return na === nb;
}
