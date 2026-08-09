import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  alignRecognizedWordsToLyrics,
  countAlignedContentWords,
  countReliableLearningWords,
} from "./audio-alignment";
import { translateLineOnDevice, translateLinesOnDevice } from "./device-translation";
import { findCrossedPendingLine, lineAtTime, unresolvedGaps } from "./lyrics-game-state";
import { POST as translateLines } from "./server/translate";

describe("sincronização das músicas", () => {
  it("realinha a letra usando as palavras reconhecidas no próprio áudio", () => {
    const lyrics = [
      "[00:00.00]Every time that I look in the mirror",
      "[00:04.00]All these lines on my face getting clearer",
      "[00:08.00]The past is gone it went by like dusk to dawn",
    ].join("\n");
    const spoken = lyrics
      .replace(/^\[[^\]]+\]/gm, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((text, index) => ({
        text,
        start: 12 + index * 0.42,
        end: 12.32 + index * 0.42,
      }));

    const result = alignRecognizedWordsToLyrics(lyrics, spoken, 25);

    expect(result.syncedLyrics).toMatch(/^\[00:12\.00\]Every time/);
    expect(result.matchedWords).toBe(result.totalWords);
    expect(result.confidence).toBeGreaterThan(0.95);
  });

  it("bloqueia o áudio de outra música", () => {
    const lyrics = [
      "[00:00.00]Today is gonna be the day that they bring it back to you",
      "[00:05.00]By now you should have somehow realized what you have to do",
      "[00:10.00]I do not believe that anybody feels the way I do",
    ].join("\n");
    const wrongSong = "Every time I look in the mirror all these lines on my face getting clearer"
      .split(" ")
      .map((text, index) => ({ text, start: index * 0.4, end: index * 0.4 + 0.3 }));

    expect(() => alignRecognizedWordsToLyrics(lyrics, wrongSong, 35)).toThrow(
      /não corresponde com segurança/i,
    );
  });

  it("não libera uma aula com vocabulário insuficiente", () => {
    expect(
      countReliableLearningWords([
        { lineIndex: 0, wordIndex: 0, text: "the", start: 1, end: 1.2, confidence: 1 },
        { lineIndex: 0, wordIndex: 1, text: "beat", start: 1.3, end: 1.6, confidence: 1 },
      ]),
    ).toBeLessThan(6);
  });

  it("conta somente palavras de conteúdo confirmadas", () => {
    expect(
      countAlignedContentWords([
        { lineIndex: 0, wordIndex: 0, text: "the", start: 1, end: 1.2, confidence: 1 },
        { lineIndex: 0, wordIndex: 1, text: "beat", start: 1.3, end: 1.6, confidence: 1 },
        { lineIndex: 1, wordIndex: 0, text: "beat", start: 2, end: 2.3, confidence: 1 },
        { lineIndex: 1, wordIndex: 1, text: "stronger", start: 2.4, end: 2.8, confidence: 0.9 },
      ]),
    ).toBe(2);
  });
});

describe("estado do exercício", () => {
  const lines = [
    { start: 10, end: 14, gapIndexes: [1] },
    { start: 14, end: 18, gapIndexes: [] },
    { start: 18, end: 22, gapIndexes: [2] },
  ];

  it("trava no fim do verso com lacuna pendente", () => {
    expect(findCrossedPendingLine(lines, 10.8, 11.2, {})).toBe(-1);
    expect(findCrossedPendingLine(lines, 13.8, 14, {})).toBe(0);
    expect(unresolvedGaps(lines[0], 0, {})).toEqual([1]);
  });

  it("avança normalmente em versos sem lacuna", () => {
    expect(lineAtTime(lines, 16)).toBe(1);
    expect(findCrossedPendingLine(lines, 17.8, 18, {})).toBe(-1);
  });
});

describe("tradução", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("traduz no aparelho e entrega os versos progressivamente", async () => {
    const delivered: string[] = [];
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const source = new URL(String(url)).searchParams.get("q");
      return Response.json({
        responseStatus: 200,
        responseData: { translatedText: `PT: ${source}` },
      });
    });

    await expect(translateLineOnDevice("November rain", fetcher)).resolves.toBe(
      "PT: November rain",
    );
    const result = await translateLinesOnDevice(["First line", "Second line"], {
      concurrency: 2,
      fetcher,
      onTranslation: (line) => delivered.push(line),
    });

    expect(delivered).toHaveLength(2);
    expect(result["Second line"]).toBe("PT: Second line");
  });

  it("usa uma segunda fonte quando a primeira falha", async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error("fonte principal indisponível");
      return Response.json({ responseData: { translatedText: "Continue dançando" } });
    });

    const response = await translateLines(
      new Request("https://example.test/api/translate", {
        method: "POST",
        body: JSON.stringify({ lines: ["Keep dancing tonight"] }),
      }),
    );
    const body = (await response.json()) as {
      translations: Record<string, string>;
    };

    expect(response.status).toBe(200);
    expect(body.translations["Keep dancing tonight"]).toBe("Continue dançando");
  });
});

vi.mock("./MusicApp", () => ({
  MusicApp: () => <p>módulo musical carregado</p>,
}));

describe("isolamento visual", () => {
  it("renderiza o módulo dentro de Shadow DOM", async () => {
    const { MusicModuleHost } = await import("./MusicModuleHost");
    const { container } = render(<MusicModuleHost />);
    const host = container.querySelector<HTMLElement>("[data-testid='music-module-host']");

    expect(host?.shadowRoot).not.toBeNull();
    expect(host?.shadowRoot?.textContent).toContain("módulo musical carregado");
    expect(screen.queryByText("módulo musical carregado")).toBeNull();
  });
});
