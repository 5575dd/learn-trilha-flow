import { describe, expect, it } from "vitest";
import { tutorQuestionView } from "@/features/tucunare/tucunareQuestion";
import type { ValidQuestion } from "@/domain/questions/questionTypes";

const base = {
  id: 10,
  aulaId: 19,
  sessao: 2,
  ordem: 1,
  enunciado: "Visible exercise",
  traducao: "HIDDEN TRANSLATION",
  explicacao: "HIDDEN EXPLANATION",
  canonicalAnswerText: "HIDDEN ANSWER",
};
const cases: ValidQuestion[] = [
  ...(["MC", "READING_MC", "LISTENING_MC", "MICROSCENARIO"] as const).map((kind) => ({
    ...base,
    kind,
    options: ["Visible option", "Another option"],
    supportText: "Visible support",
    audioText: "Visible audio",
  })),
  ...(["ORDER", "DIALOGUE_ORDER"] as const).map((kind) => ({
    ...base,
    kind,
    availableBlocks: [],
    shuffledBlocks: [{ id: "b", text: "Visible block" }],
    canonicalSequence: ["HIDDEN SEQUENCE"],
    separator: " " as const,
  })),
  {
    ...base,
    kind: "MATCHING",
    pairs: [
      { id: "a", left: "work", right: "trabalhar" },
      { id: "b", left: "eat", right: "comer" },
    ],
    shuffledAnswers: ["trabalhar", "comer"],
  },
  {
    ...base,
    kind: "CLASSIFY",
    categories: ["Do", "Does"],
    items: [{ id: "a", text: "she", category: "HIDDEN CATEGORY" }],
  },
  { ...base, kind: "CORRECTION", supportText: "She go to work." },
  { ...base, kind: "FB", hintOptions: ["in", "on"] },
  { ...base, kind: "DICTATION", audioText: "HIDDEN ANSWER" },
  { ...base, kind: "SHORT_ANSWER" },
  { ...base, kind: "TF" },
  { ...base, kind: "FLASHCARD", frontText: "Visible front" },
  { ...base, kind: "OPEN", frontText: "Visible scenario" },
];

describe("current visible exercise for Tucunare", () => {
  it("includes the submitted answer when provided without revealing the answer key", () => {
    const view = tutorQuestionView(cases[0], "My submitted answer");
    expect(JSON.parse(view).resposta_do_estudante).toBe("My submitted answer");
    expect(view).not.toContain("HIDDEN");
  });
  it.each(cases)("supports $kind without answer or grading metadata", (question) => {
    const view = tutorQuestionView(question);
    expect(JSON.parse(view)).toMatchObject({ tipo: question.kind, enunciado: "Visible exercise" });
    expect(view).not.toContain("HIDDEN");
    expect(view).not.toMatch(/canonical|explicacao|resposta_correta/);
  });
  it("includes correction originals and separates matching columns and classification items", () => {
    expect(tutorQuestionView(cases.find((q) => q.kind === "CORRECTION")!)).toContain(
      "She go to work.",
    );
    expect(JSON.parse(tutorQuestionView(cases.find((q) => q.kind === "MATCHING")!))).toMatchObject({
      coluna_esquerda: ["eat", "work"],
      coluna_direita: ["comer", "trabalhar"],
    });
    expect(JSON.parse(tutorQuestionView(cases.find((q) => q.kind === "CLASSIFY")!))).toMatchObject({
      categorias: ["Do", "Does"],
      itens: ["she"],
    });
  });
  it("bounds a multilingual exercise without breaking the JSON or exposing hidden fields", () => {
    const view = tutorQuestionView({
      ...cases[0],
      kind: "MC",
      enunciado: '漢\\"'.repeat(2000),
      options: Array(12).fill("漢".repeat(1000)),
      supportText: "漢".repeat(5000),
    });
    expect(() => JSON.parse(view)).not.toThrow();
    expect(new TextEncoder().encode(view).length).toBeLessThan(4000);
  });
});
