import { describe, expect, it } from "vitest";
import { evaluateAnswer } from "@/domain/answers/answerEvaluator";
import type {
  ClassifyQuestion,
  MatchingQuestion,
  TextInputQuestion,
} from "@/domain/questions/questionTypes";

const base = {
  id: 1,
  aulaId: 1,
  enunciado: "Question",
  explicacao: "Explanation",
  traducao: "Pergunta",
  sessao: 1,
  ordem: 1,
};

describe("structured activity evaluator", () => {
  it("evaluates every matching pair", () => {
    const question: MatchingQuestion = {
      ...base,
      kind: "MATCHING",
      pairs: [
        { id: "a", left: "mother", right: "mãe" },
        { id: "b", left: "father", right: "pai" },
        { id: "c", left: "sister", right: "irmã" },
      ],
      shuffledAnswers: ["pai", "irmã", "mãe"],
      canonicalAnswerText: "mother → mãe • father → pai • sister → irmã",
    };
    expect(evaluateAnswer(question, { matches: { a: "mãe", b: "pai", c: "irmã" } }).status).toBe(
      "correct",
    );
    expect(evaluateAnswer(question, { matches: { a: "pai", b: "mãe", c: "irmã" } }).status).toBe(
      "incorrect",
    );
  });

  it("evaluates every classification", () => {
    const question: ClassifyQuestion = {
      ...base,
      kind: "CLASSIFY",
      categories: ["Family", "Jobs"],
      items: [
        { id: "a", text: "mother", category: "Family" },
        { id: "b", text: "teacher", category: "Jobs" },
        { id: "c", text: "father", category: "Family" },
      ],
      canonicalAnswerText: "Family: mother, father • Jobs: teacher",
    };
    expect(
      evaluateAnswer(question, {
        classifications: { a: "Family", b: "Jobs", c: "Family" },
      }).status,
    ).toBe("correct");
    expect(
      evaluateAnswer(question, {
        classifications: { a: "Jobs", b: "Jobs", c: "Family" },
      }).status,
    ).toBe("incorrect");
  });

  it("accepts an answer that differs only by accents and records a spelling reminder", () => {
    const question: TextInputQuestion = {
      ...base,
      kind: "DICTATION",
      canonicalAnswerText: "Nico and Natalia are twins",
      audioText: "Nico and Natalia are twins",
    };
    const result = evaluateAnswer(question, {
      text: "Nico and Natália are twins",
    });
    expect(result.status).toBe("correct");
    expect(result.diagnosticCode).toBe("match.diacritic_variant");
  });
});
