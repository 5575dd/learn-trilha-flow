import { describe, it, expect } from "vitest";
import { parseAulaContent } from "@/data/adapters/aulaAdapter";

describe("aulaAdapter", () => {
  it("returns empty content for null/invalid input", () => {
    const c = parseAulaContent(null);
    expect(c.grammar).toEqual([]);
    expect(c.vocabulary).toEqual([]);
  });
  it("parses grammar entries from real-shape object", () => {
    const c = parseAulaContent({
      grammar: [
        {
          name: "Wh- Questions",
          explanation_ptbr: "explicação",
          examples: [{ text_english: "Where do you live?", translation_ptbr: "Onde…" }],
        },
      ],
    });
    expect(c.grammar).toHaveLength(1);
    expect(c.grammar[0].examples[0].text_english).toBe("Where do you live?");
  });
  it("accepts JSON string input", () => {
    const c = parseAulaContent(JSON.stringify({ objectives: ["a", "b"] }));
    expect(c.objectives).toEqual(["a", "b"]);
  });

  it("maps the complete motor V4 lesson shape", () => {
    const c = parseAulaContent({
      learning_objectives_ptbr: ["Usar have e has"],
      key_takeaways_ptbr: ["Has acompanha he, she e it"],
      pre_activity_review_ptbr: ["Releia a regra de terceira pessoa"],
      overview_ptbr: "Resumo completo.",
      vocabulary: [
        {
          term: "mother",
          translation_ptbr: "mãe",
          definition_english: "A female parent.",
          example_from_lesson: "My mother is a doctor.",
        },
      ],
      timeline: [{ start: "01:00", end: "02:00", content: "Family vocabulary", source: "SLIDE" }],
      texts_and_dialogues: [
        {
          title: "Family",
          original_english: "My father is a doctor.",
          translation_ptbr: "Meu pai é médico.",
          comprehension_points_ptbr: ["Identificar a profissão."],
        },
      ],
      corrections_and_doubts: [
        {
          original_or_question: "He have?",
          answer_or_correction: "He has.",
          explanation_ptbr: "Terceira pessoa.",
        },
      ],
    });

    expect(c.objectives).toEqual(["Usar have e has"]);
    expect(c.keyTakeaways).toEqual(["Has acompanha he, she e it"]);
    expect(c.vocabulary[0].meaning_ptbr).toBe("mãe");
    expect(c.timeline[0].description).toBe("Family vocabulary");
    expect(c.dialogues[0].original_english).toBe("My father is a doctor.");
    expect(c.corrections[0].corrected).toBe("He has.");
  });
});
