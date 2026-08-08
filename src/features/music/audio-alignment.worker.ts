/// <reference lib="webworker" />

import { env, pipeline } from "@huggingface/transformers";

env.allowLocalModels = false;

type TranscribedChunk = {
  text?: string;
  timestamp?: [number | null, number | null];
};

type TranscriptionResult = {
  text?: string;
  chunks?: TranscribedChunk[];
};

type Transcriber = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<TranscriptionResult>;

let transcriberPromise: Promise<Transcriber> | null = null;

function getTranscriber(id: string) {
  if (!transcriberPromise) {
    self.postMessage({
      type: "progress",
      id,
      phase: "model",
      message: "Preparando o reconhecedor de inglês…",
    });
    transcriberPromise = pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", {
      dtype: "q8",
      progress_callback: (progress: Record<string, unknown>) => {
        const percentage =
          typeof progress.progress === "number" ? Math.round(progress.progress) : undefined;
        self.postMessage({
          type: "progress",
          id,
          phase: "model",
          message:
            percentage == null
              ? "Baixando o reconhecedor pela primeira vez…"
              : `Baixando o reconhecedor: ${percentage}%`,
          progress: percentage,
        });
      },
    }) as unknown as Promise<Transcriber>;
  }
  return transcriberPromise;
}

self.addEventListener("message", async (event) => {
  const {
    id,
    samples,
    mode = "fast",
  } = event.data as {
    id: string;
    samples: ArrayBuffer;
    mode?: "fast" | "careful";
  };
  try {
    const transcriber = await getTranscriber(id);
    const audio = new Float32Array(samples);
    const sampleRate = 16_000;
    // A segunda escuta reutiliza o mesmo modelo leve e muda apenas o tamanho
    // das janelas. Isso melhora trechos difíceis sem carregar um segundo
    // modelo grande, que fazia o Safari encerrar a página por falta de memória.
    const segmentSeconds = mode === "careful" ? 18 : 28;
    const overlapSeconds = mode === "careful" ? 3 : 2;
    const stepSeconds = segmentSeconds - overlapSeconds;
    const duration = audio.length / sampleRate;
    const words: { text: string; start: number; end: number }[] = [];

    for (let start = 0; start < duration; start += stepSeconds) {
      const end = Math.min(duration, start + segmentSeconds);
      const percentage = Math.min(99, Math.round((start / Math.max(1, duration)) * 100));
      self.postMessage({
        type: "progress",
        id,
        phase: "transcription",
        message:
          mode === "careful"
            ? `Fazendo uma segunda escuta leve: ${percentage}%`
            : `Ouvindo e conferindo a música: ${percentage}%`,
        progress: percentage,
      });
      const segment = audio.slice(Math.floor(start * sampleRate), Math.ceil(end * sampleRate));
      const result = await transcriber(segment, {
        return_timestamps: "word",
      });
      const isFirst = start === 0;
      const isLast = end >= duration;
      for (const chunk of result.chunks ?? []) {
        const localStart = chunk.timestamp?.[0];
        if (!chunk.text?.trim() || typeof localStart !== "number") continue;
        const localEnd =
          typeof chunk.timestamp?.[1] === "number" ? chunk.timestamp[1] : localStart + 0.35;
        if (!isFirst && localStart < overlapSeconds / 2) continue;
        if (!isLast && localEnd > segmentSeconds - overlapSeconds / 2) continue;
        words.push({
          text: chunk.text.trim(),
          start: start + localStart,
          end: start + localEnd,
        });
      }
    }
    self.postMessage({
      type: "progress",
      id,
      phase: "transcription",
      message:
        mode === "careful"
          ? "Fazendo uma segunda escuta leve: 100%"
          : "Ouvindo e conferindo a música: 100%",
      progress: 100,
    });
    self.postMessage({ type: "complete", id, words });
  } catch (error) {
    transcriberPromise = null;
    self.postMessage({
      type: "error",
      id,
      message:
        error instanceof Error
          ? error.message
          : "O reconhecedor não conseguiu analisar este áudio.",
    });
  }
});

export {};
