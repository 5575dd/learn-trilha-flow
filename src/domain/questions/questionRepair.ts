// Placeholder for row-level repair helpers.  Current repairs are handled inline
// inside questionParser.ts (letter -> option text, TF casing).  Kept as its own
// module so future repairs stay isolated and testable.
import type { QuestionEntry } from "./questionTypes";

export function isRepairable(entry: QuestionEntry): boolean {
  return entry.status === "repairable";
}
