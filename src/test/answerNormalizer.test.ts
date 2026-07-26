import { describe, it, expect } from "vitest";
import {
  answersEqual,
  answersEqualIgnoringDiacritics,
  normalizeAnswer,
} from "@/domain/answers/answerNormalizer";

describe("normalizeAnswer", () => {
  it("Where equals Where", () => {
    expect(answersEqual("Where", "Where")).toBe(true);
  });
  it("Where equals where (case)", () => {
    expect(answersEqual("Where", "where")).toBe(true);
  });
  it("trims surrounding whitespace", () => {
    expect(answersEqual("  Where  ", "Where")).toBe(true);
  });
  it("ignores trailing punctuation", () => {
    expect(answersEqual("Where do you live?", "Where do you live")).toBe(true);
  });
  it("grandmother equals grandmother", () => {
    expect(answersEqual("grandmother", "grandmother")).toBe(true);
  });
  it("differs when a word changes (plural)", () => {
    expect(answersEqual("Who is your best friend", "who is your best friends?")).toBe(false);
  });
  it("rejects random text", () => {
    expect(answersEqual("banana banana", "grandmother")).toBe(false);
  });
  it("collapses inner whitespace", () => {
    expect(normalizeAnswer("Where   are   they   from")).toBe(
      normalizeAnswer("where are they from"),
    );
  });
  it("extra word breaks equality", () => {
    expect(answersEqual("Where are they from now", "Where are they from")).toBe(false);
  });
  it("empty answers are never equal", () => {
    expect(answersEqual("", "Where")).toBe(false);
    expect(answersEqual("Where", "")).toBe(false);
  });
  it("can identify a difference caused only by accents", () => {
    expect(answersEqual("Nico and Natália are twins", "Nico and Natalia are twins")).toBe(false);
    expect(
      answersEqualIgnoringDiacritics("Nico and Natália are twins", "Nico and Natalia are twins"),
    ).toBe(true);
  });
});
