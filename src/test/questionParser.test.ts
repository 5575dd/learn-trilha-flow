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
    const entry = parseQuestion(
      raw({ tipo: "MC", opcoes: "a|b|c|d", resposta_correta: "B" }),
    );
    expect(entry.status).toBe("repairable");
    if (entry.status === "repairable" && entry.question.kind === "MC") {
      expect(entry.question.canonicalAnswerText).toBe("b");
    }
  });

  it("classifies OPEN as unsupported", () => {
    const entry = parseQuestion(raw({ tipo: "OPEN", resposta_correta: "x" }));
    expect(entry.status).toBe("unsupported");
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

  it("ORDER builds blocks with per-occurrence ids", () => {
    const entry = parseQuestion(
      raw({ tipo: "ORDER", opcoes: "are|Where|they|from", resposta_correta: "Where are they from" }),
    );
    if (entry.status !== "valid") throw new Error("expected valid");
    if (entry.question.kind !== "ORDER") throw new Error("expected ORDER");
    expect(entry.question.availableBlocks).toHaveLength(4);
    expect(entry.question.canonicalSequence).toEqual(["Where", "are", "they", "from"]);
    expect(entry.question.canonicalAnswerText).toBe("Where are they from");
  });
});
