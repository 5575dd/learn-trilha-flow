import { describe, expect, it } from "vitest";
import { groupLessonSessions, isQuestionReleased } from "@/domain/session/lessonSessions";
import type { ValidQuestion } from "@/domain/questions/questionTypes";

function question(id: number, sessao: number, releaseAt?: string): ValidQuestion {
  return {
    id,
    aulaId: 1,
    enunciado: "Question",
    explicacao: "",
    traducao: "Pergunta",
    sessao,
    ordem: id,
    releaseAt,
    kind: "TF",
    canonicalAnswerText: "True",
  };
}

describe("lesson session rotation", () => {
  it("groups questions into three separate sessions", () => {
    const groups = groupLessonSessions([
      question(3, 2),
      question(1, 1),
      question(4, 3),
      question(2, 1),
    ]);
    expect(groups.map((group) => group.questions.map((item) => item.id))).toEqual([
      [1, 2],
      [3],
      [4],
    ]);
  });

  it("keeps a future session locked and a past session available", () => {
    const now = Date.parse("2026-07-26T12:00:00.000Z");
    expect(isQuestionReleased(question(1, 1, "2026-07-26T11:59:00.000Z"), now)).toBe(true);
    expect(isQuestionReleased(question(2, 2, "2026-07-26T12:01:00.000Z"), now)).toBe(false);

    const groups = groupLessonSessions(
      [question(1, 1, "2026-07-26T11:59:00.000Z"), question(2, 2, "2026-07-26T12:01:00.000Z")],
      now,
    );
    expect(groups[0].available).toBe(true);
    expect(groups[1].available).toBe(false);
  });
});
