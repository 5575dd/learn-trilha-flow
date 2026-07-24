import { describe, expect, it } from "vitest";
import { assertValidId } from "@/data/queries";

describe("route ID validation", () => {
  it.each([Number.NaN, 0, -1, 1.5])("rejects invalid aula ID %s before a query", (id) => {
    expect(() => assertValidId(id, "aula")).toThrow("ID de aula invÃ¡lido");
  });

  it("accepts a positive safe integer", () => {
    expect(() => assertValidId(1, "aula")).not.toThrow();
  });
});
