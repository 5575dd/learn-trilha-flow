import type { RawQuestion, QuestionEntry } from "./questionTypes";
import { parseQuestion } from "./questionParser";

// Small validator/repair shell — orchestrates parseQuestion and lets us add
// row-level sanity checks in one place.
export function validateAndRepair(rows: RawQuestion[]): QuestionEntry[] {
  return rows.map(parseQuestion);
}
