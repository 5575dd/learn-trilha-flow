import { describe, it, expect } from "vitest";

// The historico_estudo table has no id column and its only column (data_estudo)
// is nullable. The list query must therefore not depend on an id and must
// tolerate null values.
describe("historico shape", () => {
  it("orderable purely by data_estudo desc without an id column", () => {
    const rows = [
      { data_estudo: "2026-07-13" },
      { data_estudo: "2026-07-14" },
      { data_estudo: null },
    ];
    const sorted = [...rows].sort((a, b) =>
      (b.data_estudo ?? "").localeCompare(a.data_estudo ?? ""),
    );
    expect(sorted[0].data_estudo).toBe("2026-07-14");
    expect(sorted[1].data_estudo).toBe("2026-07-13");
    expect("id" in sorted[0]).toBe(false);
  });
});
