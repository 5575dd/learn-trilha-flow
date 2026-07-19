import type { ValidQuestion } from "../questions/questionTypes";
import type { EvaluationResult } from "./evaluationTypes";
import { normalizeAnswer } from "./answerNormalizer";

export interface StudentInput {
  // For MC/TF/FB: the raw text the student entered/selected.
  text?: string;
  // For ORDER: the block ids selected in order.
  selectedBlockIds?: string[];
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
  if (q.kind === "ORDER") {
    const ids = input.selectedBlockIds ?? [];
    if (ids.length !== q.availableBlocks.length) {
      return base(q, "", "invalid", "order.incomplete");
    }
    const byId = new Map(q.availableBlocks.map((b) => [b.id, b.text]));
    const words: string[] = [];
    for (const id of ids) {
      const t = byId.get(id);
      if (t === undefined) return base(q, "", "invalid", "order.unknown_block");
      words.push(t);
    }
    const sentence = words.join(" ");
    const ok = normalizeAnswer(sentence) === normalizeAnswer(q.canonicalAnswerText);
    return base(q, sentence, ok ? "correct" : "incorrect", ok ? "order.match" : "order.mismatch");
  }

  const text = (input.text ?? "").trim();
  if (!text) return base(q, "", "invalid", "empty");

  const ok = normalizeAnswer(text) === normalizeAnswer(q.canonicalAnswerText);
  return base(q, text, ok ? "correct" : "incorrect", ok ? "match" : "mismatch");
}
