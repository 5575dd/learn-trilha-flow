import { describe, it, expect } from "vitest";
import { parseQuestion } from "@/domain/questions/questionParser";
import type { RawQuestion } from "@/domain/questions/questionTypes";

function raw(overrides: Partial<RawQuestion>): RawQuestion {
  return {
    id: 1,
    aula_id: 1,
    tipo: "MC",
    enunciado: "",
    opcoes: null,
    resposta_correta: null,
    explicacao: "",
    traducao: "",
    audio_texto: null,
    sessao: 1,
    ordem: 0,
    dificuldade: 1,
    metadados: {},
    ...overrides,
  };
}

describe("questionParser", () => {
  it("parses MC with pipe-separated options", () => {
    const entry = parseQuestion(
      raw({ tipo: "MC", opcoes: "does|do|is|are", resposta_correta: "does" }),
    );
    expect(entry.status).toBe("valid");
    if (entry.status !== "valid" && entry.status !== "repairable") return;
    expect(entry.question.kind).toBe("MC");
    if (entry.question.kind === "MC") {
      expect(entry.question.options).toEqual(["does", "do", "is", "are"]);
      expect(entry.question.canonicalAnswerText).toBe("does");
    }
  });

  it("uses metadados.raw_options when present", () => {
    const entry = parseQuestion(
      raw({
        tipo: "MC",
        opcoes: "ignored|also-ignored",
        resposta_correta: "green",
        metadados: { raw_options: ["red", "green", "blue"] },
      }),
    );
    if (entry.status !== "valid" && entry.status !== "repairable") throw new Error("bad");
    if (entry.question.kind === "MC") {
      expect(entry.question.options).toEqual(["red", "green", "blue"]);
    }
  });

  it("repairs MC letter gabarito 'B'", () => {
    const entry = parseQuestion(raw({ tipo: "MC", opcoes: "a|b|c|d", resposta_correta: "B" }));
    expect(entry.status).toBe("repairable");
    if (entry.status === "repairable" && entry.question.kind === "MC") {
      expect(entry.question.canonicalAnswerText).toBe("b");
    }
  });

  it("supports OPEN as self-evaluation", () => {
    const entry = parseQuestion(raw({ tipo: "OPEN", resposta_correta: "x" }));
    expect(entry.status).toBe("valid");
    if (entry.status === "valid") expect(entry.question.kind).toBe("OPEN");
  });

  it("parses MICROSCENARIO as an objective multiple-choice activity", () => {
    const entry = parseQuestion(
      raw({
        tipo: "MICROSCENARIO",
        enunciado: "Choose the most polite response.",
        opcoes: "A|B|C|D",
        resposta_correta: "B",
        metadados: { support_text: "You are speaking to your teacher." },
      }),
    );
    expect(entry.status).toBe("valid");
    if (entry.status !== "valid" || entry.question.kind !== "MICROSCENARIO") return;
    expect(entry.question.options).toEqual(["A", "B", "C", "D"]);
    expect(entry.question.supportText).toBe("You are speaking to your teacher.");
  });

  it("parses MATCHING pairs from metadata", () => {
    const entry = parseQuestion(
      raw({
        tipo: "MATCHING",
        metadados: {
          pairs: [
            { left: "mother", right: "mãe" },
            { left: "father", right: "pai" },
            { left: "sister", right: "irmã" },
          ],
        },
      }),
    );
    expect(entry.status).toBe("valid");
    if (entry.status !== "valid" || entry.question.kind !== "MATCHING") return;
    expect(entry.question.pairs).toHaveLength(3);
    expect(entry.question.canonicalAnswerText).toContain("mother → mãe");
  });

  it("parses CLASSIFY groups from metadata", () => {
    const entry = parseQuestion(
      raw({
        tipo: "CLASSIFY",
        metadados: {
          categories: [
            { name: "Family", items: ["mother", "father"] },
            { name: "Jobs", items: ["doctor", "teacher"] },
          ],
        },
      }),
    );
    expect(entry.status).toBe("valid");
    if (entry.status !== "valid" || entry.question.kind !== "CLASSIFY") return;
    expect(entry.question.categories).toEqual(["Family", "Jobs"]);
    expect(entry.question.items).toHaveLength(4);
  });

  it("PRONUNCIATION never becomes a valid question", () => {
    const entry = parseQuestion(raw({ tipo: "PRONUNCIATION", resposta_correta: "x" }));
    expect(entry.status).toBe("unsupported");
  });

  it("invalid when tipo is missing", () => {
    const entry = parseQuestion(raw({ tipo: null, resposta_correta: "x" }));
    expect(entry.status).toBe("invalid");
  });

  it("TF accepts True/False and Verdadeiro/Falso", () => {
    expect(parseQuestion(raw({ tipo: "TF", resposta_correta: "True" })).status).toBe("valid");
    expect(parseQuestion(raw({ tipo: "TF", resposta_correta: "false" })).status).toBe("repairable");
    expect(parseQuestion(raw({ tipo: "TF", resposta_correta: "Verdadeiro" })).status).toBe(
      "repairable",
    );
  });

  it.each(["não", "nao"])("normalizes TF false value %s", (value) => {
    const entry = parseQuestion(raw({ tipo: "TF", resposta_correta: value }));
    expect(entry.status).toBe("repairable");
    if (entry.status === "repairable" && entry.question.kind === "TF") {
      expect(entry.question.canonicalAnswerText).toBe("False");
    }
  });

  it("ORDER builds blocks with per-occurrence ids", () => {
    const entry = parseQuestion(
      raw({
        tipo: "ORDER",
        opcoes: "are|Where|they|from",
        resposta_correta: "Where are they from",
      }),
    );
    if (entry.status !== "valid") throw new Error("expected valid");
    if (entry.question.kind !== "ORDER") throw new Error("expected ORDER");
    expect(entry.question.availableBlocks).toHaveLength(4);
    expect(entry.question.canonicalSequence).toEqual(["Where", "are", "they", "from"]);
    expect(entry.question.canonicalAnswerText).toBe("Where are they from");
  });
});
