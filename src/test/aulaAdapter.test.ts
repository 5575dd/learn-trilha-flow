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
});
