import { describe, expect, it } from "vitest";
import {
  buildAulaQuestionIds,
  buildErrorQuestionIds,
  buildQuestionTypeIds,
  buildQuickQuestionIds,
} from "@/domain/session/sessionSourceBuilder";
import type { ValidQuestion } from "@/domain/questions/questionTypes";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

const questions: ValidQuestion[] = [
  {
    id: 3,
    aulaId: 2,
    enunciado: "",
    explicacao: "",
    traducao: "",
    sessao: 1,
    ordem: 1,
    kind: "TF",
    canonicalAnswerText: "True",
  },
  {
    id: 2,
    aulaId: 1,
    enunciado: "",
    explicacao: "",
    traducao: "",
    sessao: 2,
    ordem: 1,
    kind: "MC",
    options: ["a", "b"],
    canonicalAnswerText: "a",
  },
  {
    id: 1,
    aulaId: 1,
    enunciado: "",
    explicacao: "",
    traducao: "",
    sessao: 1,
    ordem: 1,
    kind: "TF",
    canonicalAnswerText: "False",
  },
  {
    id: 1,
    aulaId: 1,
    enunciado: "",
    explicacao: "",
    traducao: "",
    sessao: 1,
    ordem: 2,
    kind: "TF",
    canonicalAnswerText: "False",
  },
];

function attempt(questionId: number, status: "correct" | "incorrect"): AttemptRecord {
  return {
    attemptId: `a-${questionId}-${status}`,
    questionId,
    timeMs: 1,
    result: {
      status,
      studentAnswerDisplay: "",
      correctAnswerDisplay: "",
      normalizedStudentAnswer: "",
      normalizedCorrectAnswer: "",
      explanation: "",
      diagnosticCode: "",
      metadata: {},
    },
  };
}

describe("sessionSourceBuilder", () => {
  it("builds a complete aula deterministically without duplicates", () => {
    expect(buildAulaQuestionIds(questions, 1)).toEqual([1, 2]);
  });

  it("builds a limited quick session with injected randomness", () => {
    expect(buildQuickQuestionIds(questions, { limit: 2, random: () => 0 })).toHaveLength(2);
  });

  it("never duplicates IDs in a quick session", () => {
    const ids = buildQuickQuestionIds(questions, { limit: 10, random: () => 0.5 });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds local error review from available incorrect attempts", () => {
    expect(
      buildErrorQuestionIds(
        [
          attempt(2, "incorrect"),
          attempt(2, "incorrect"),
          attempt(3, "correct"),
          attempt(99, "incorrect"),
        ],
        questions,
      ),
    ).toEqual([2]);
  });

  it("builds practice by question type", () => {
    expect(buildQuestionTypeIds(questions, "TF")).toEqual([1, 3]);
    expect(buildQuestionTypeIds(questions, "MC")).toEqual([2]);
  });

  it("returns empty sources safely", () => {
    expect(buildAulaQuestionIds([], 1)).toEqual([]);
    expect(buildQuickQuestionIds([])).toEqual([]);
    expect(buildErrorQuestionIds([], [])).toEqual([]);
    expect(buildQuestionTypeIds([], "TF")).toEqual([]);
  });
});
