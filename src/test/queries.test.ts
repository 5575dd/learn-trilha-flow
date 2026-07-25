import { describe, expect, it } from "vitest";
import { assertValidId, listQuestoesByIds, orderQuestionsByIds } from "@/data/queries";
import type { RawQuestion } from "@/domain/questions/questionTypes";

describe("route ID validation", () => {
  it.each([Number.NaN, 0, -1, 1.5])("rejects invalid aula ID %s before a query", (id) => {
    expect(() => assertValidId(id, "aula")).toThrow("ID de aula inválido");
  });

  it("accepts a positive safe integer", () => {
    expect(() => assertValidId(1, "aula")).not.toThrow();
  });
});

const raw = (id: number): RawQuestion => ({
  id,
  aula_id: 1,
  tipo: "TF",
  enunciado: "",
  opcoes: null,
  resposta_correta: "True",
  explicacao: "",
  traducao: "",
  audio_texto: null,
  sessao: 1,
  ordem: id,
  dificuldade: 1,
  metadados: {},
});

describe("question ID queries", () => {
  it("preserves manifest order and reports missing IDs", () => {
    const result = orderQuestionsByIds([3, 1, 2], [raw(1), raw(3)]);
    expect(result.questions.map((question) => question.id)).toEqual([3, 1]);
    expect(result.missingIds).toEqual([2]);
  });

  it("returns an empty result without querying for an empty source", async () => {
    await expect(listQuestoesByIds([])).resolves.toEqual({ questions: [], missingIds: [] });
  });

  it("rejects invalid question IDs", () => {
    expect(() => orderQuestionsByIds([1, Number.NaN], [])).toThrow(/IDs de questões inválida/);
  });
});
