import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const mojibake = new RegExp(
  ["\\u00c3", "\\u00f0\\u0178", "\\u00e2\\u20ac", "\\u00ef\\u00bf\\u00bd", "\\ufffd"].join("|"),
);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|css|md|sql)$/.test(entry.name) ? [path] : [];
  });
}

describe("UTF-8 source hygiene", () => {
  it("contains no known mojibake patterns in modified text areas", () => {
    const directories = ["src", "docs", "supabase"]
      .map((name) => join(process.cwd(), name))
      .filter(existsSync);
    const files = [
      ...directories.flatMap(sourceFiles),
      join(process.cwd(), "PROJECT_CONTEXT_CODEX.md"),
      join(process.cwd(), ".env.example"),
    ];
    const corrupted = files.filter((path) => mojibake.test(readFileSync(path, "utf8")));
    expect(corrupted).toEqual([]);
  });

  it("preserves accents, punctuation, and the audio emoji", () => {
    const activity = readFileSync(
      join(process.cwd(), "src/components/activities/Activity.tsx"),
      "utf8",
    );
    expect(activity).toContain("🔊 Ouvir");
    expect(activity).toContain("Diálogo montado");
    expect(activity).toContain("Blocos disponíveis");
    expect(activity).toContain("Como você responderia");
    expect(activity).toContain("Ainda não sei");
    expect(activity).toContain("Flashcard — pense na resposta.");
  });
});
