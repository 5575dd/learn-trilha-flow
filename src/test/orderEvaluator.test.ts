import { describe, it, expect } from "vitest";
import { parseQuestion, buildOrderBlocks } from "@/domain/questions/questionParser";
import { evaluateAnswer } from "@/domain/answers/answerEvaluator";
import type { RawQuestion, ORDERQuestion } from "@/domain/questions/questionTypes";

function orderQ(opcoes: string, resposta_correta: string): ORDERQuestion {
  const raw: RawQuestion = {
    id: 1,
    aula_id: 1,
    tipo: "ORDER",
    enunciado: "",
    opcoes,
    resposta_correta,
    explicacao: "",
    traducao: "",
    audio_texto: null,
    sessao: 1,
    ordem: 0,
    dificuldade: 1,
    metadados: {},
  };
  const entry = parseQuestion(raw);
  if (entry.status !== "valid" || entry.question.kind !== "ORDER") throw new Error("expected ORDER");
  return entry.question;
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  arr.forEach((v, i) => {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([v, ...p]);
  });
  return out;
}

describe("ORDER evaluator", () => {
  const cases: Array<[string, string]> = [
    ["Where|do|you|live", "Where do you live"],
    ["Where|is|your|sister|now", "Where is your sister now"],
    ["are|Where|they|from", "Where are they from"],
  ];

  for (const [opcoes, gabarito] of cases) {
    it(`accepts canonical sentence: ${gabarito}`, () => {
      const q = orderQ(opcoes, gabarito);
      const canonicalIds = q.canonicalSequence.map((word) => {
        const blk = q.availableBlocks.find((b) => b.text === word);
        if (!blk) throw new Error(`missing ${word}`);
        return blk.id;
      });
      // Distinguish repeated words: consume ids in order
      const remaining = [...q.availableBlocks];
      const ids: string[] = [];
      for (const word of q.canonicalSequence) {
        const idx = remaining.findIndex((b) => b.text === word);
        expect(idx).toBeGreaterThanOrEqual(0);
        ids.push(remaining[idx].id);
        remaining.splice(idx, 1);
      }
      const result = evaluateAnswer(q, { selectedBlockIds: ids });
      expect(result.status).toBe("correct");
      expect(result.correctAnswerDisplay).toBe(gabarito);
      // guard: unused canonicalIds path shouldn't throw
      expect(canonicalIds.length).toBe(q.canonicalSequence.length);
    });
  }

  it("keeps canonical answer/sequence immutable across permutations", () => {
    const q = orderQ("are|Where|they|from", "Where are they from");
    const originalCanonical = q.canonicalAnswerText;
    const originalSeq = [...q.canonicalSequence];
    let correctCount = 0;

    for (const perm of permutations(q.availableBlocks)) {
      const ids = perm.map((b) => b.id);
      const result = evaluateAnswer(q, { selectedBlockIds: ids });
      // canonical must not have changed
      expect(q.canonicalAnswerText).toBe(originalCanonical);
      expect(q.canonicalSequence).toEqual(originalSeq);
      expect(result.correctAnswerDisplay).toBe(originalCanonical);
      if (result.status === "correct") correctCount++;
    }
    // Exactly one permutation is canonical
    expect(correctCount).toBe(1);
  });

  it("blocks helper preserves per-occurrence identity", () => {
    const blocks = buildOrderBlocks(["a", "a", "b"]);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(3);
  });
});
