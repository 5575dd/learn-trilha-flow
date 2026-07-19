import type { ValidQuestion } from "../questions/questionTypes";
import type { EvaluationResult } from "./evaluationTypes";
import { normalizeAnswer } from "./answerNormalizer";

export interface StudentInput {
  text?: string;
  selectedBlockIds?: string[];
  // For self-eval kinds (FLASHCARD/OPEN/MICROSCENARIO): student marks themselves.
  selfEval?: "know" | "unknown" | "skip";
}

function base(
  q: ValidQuestion,
  student: string,
  status: EvaluationResult["status"],
  diagnostic: string,
): EvaluationResult {
  return {
    status,
    studentAnswerDisplay: student,
    correctAnswerDisplay: q.canonicalAnswerText,
    normalizedStudentAnswer: normalizeAnswer(student),
    normalizedCorrectAnswer: normalizeAnswer(q.canonicalAnswerText),
    explanation: q.explicacao,
    diagnosticCode: diagnostic,
    metadata: { questionId: q.id, kind: q.kind },
  };
}

export function evaluateAnswer(q: ValidQuestion, input: StudentInput): EvaluationResult {
  if (q.kind === "ORDER" || q.kind === "DIALOGUE_ORDER") {
    const ids = input.selectedBlockIds ?? [];
    if (ids.length !== q.availableBlocks.length) {
      return base(q, "", "invalid", "order.incomplete");
    }
    const byId = new Map(q.availableBlocks.map((b) => [b.id, b.text]));
    const parts: string[] = [];
    for (const id of ids) {
      const t = byId.get(id);
      if (t === undefined) return base(q, "", "invalid", "order.unknown_block");
      parts.push(t);
    }
    const sentence = parts.join(q.separator);
    const canonical =
      q.kind === "DIALOGUE_ORDER" ? q.canonicalSequence.join(q.separator) : q.canonicalAnswerText;
    const ok = normalizeAnswer(sentence) === normalizeAnswer(canonical);
    return base(q, sentence, ok ? "correct" : "incorrect", ok ? "order.match" : "order.mismatch");
  }

  if (q.kind === "FLASHCARD" || q.kind === "OPEN" || q.kind === "MICROSCENARIO") {
    // Self-assessment. Never auto-correct. Always neutral for progress.
    const mark = input.selfEval;
    if (!mark) return base(q, input.text ?? "", "invalid", "selfeval.missing");
    return base(q, input.text ?? mark, "neutral", `selfeval.${mark}`);
  }

  const text = (input.text ?? "").trim();
  if (!text) return base(q, "", "invalid", "empty");

  const ok = normalizeAnswer(text) === normalizeAnswer(q.canonicalAnswerText);
  return base(q, text, ok ? "correct" : "incorrect", ok ? "match" : "mismatch");
}
