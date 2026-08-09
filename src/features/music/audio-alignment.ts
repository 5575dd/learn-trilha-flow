export type AlignedWordTiming = {
  lineIndex: number;
  wordIndex: number;
  text: string;
  start: number;
  end: number;
  confidence: number;
};

export type AlignmentProgress = {
  phase: "decode" | "model" | "transcription" | "alignment";
  message: string;
  progress?: number;
};

export type AudioAlignment = {
  syncedLyrics: string;
  wordTimings: AlignedWordTiming[];
  confidence: number;
  matchedWords: number;
  totalWords: number;
};

export type HeardWord = { text: string; start: number; end: number };
type TimedLine = {
  rawIndex: number;
  phraseIndex: number;
  sourceStart: number;
  text: string;
  words: string[];
};

type ReferenceWord = {
  lineIndex: number;
  wordIndex: number;
  text: string;
  normalized: string;
  sourceTime: number;
};

type Anchor = {
  source: number;
  target: number;
  targetEnd: number;
  similarity: number;
  lineIndex: number;
  wordIndex: number;
};

let worker: Worker | null = null;
const pending = new Map<
  string,
  {
    resolve: (words: HeardWord[]) => void;
    reject: (error: Error) => void;
    onProgress?: (progress: AlignmentProgress) => void;
    timeout: number;
  }
>();

function alignmentWorker() {
  if (!worker) {
    worker = new Worker(new URL("./audio-alignment.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event) => {
      const message = event.data as {
        id: string;
        type: "progress" | "complete" | "error";
        phase?: AlignmentProgress["phase"];
        message?: string;
        progress?: number;
        words?: HeardWord[];
      };
      const request = pending.get(message.id);
      if (!request) return;
      if (message.type === "progress" && message.phase && message.message) {
        request.onProgress?.({
          phase: message.phase,
          message: message.message,
          progress: message.progress,
        });
        return;
      }
      pending.delete(message.id);
      window.clearTimeout(request.timeout);
      if (message.type === "complete") request.resolve(message.words ?? []);
      else request.reject(new Error(message.message ?? "A análise do áudio falhou."));
    });
    worker.addEventListener("error", (event) => {
      for (const request of pending.values()) {
        window.clearTimeout(request.timeout);
        request.reject(new Error(event.message || "A análise do áudio foi interrompida."));
      }
      pending.clear();
      worker?.terminate();
      worker = null;
    });
  }
  return worker;
}

function normalizeWord(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .replace(/[^a-zA-Z']/g, "")
    .toLowerCase();
}

function levenshtein(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}

function wordSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function parseTimedLyrics(raw: string) {
  const rawLines = raw.split(/\r?\n/);
  let phraseIndex = 0;
  const timedLines: TimedLine[] = [];
  rawLines.forEach((line, rawIndex) => {
    const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (!match) return;
    const text = match[3].trim();
    if (!text || /^\[[^\]]+\]$/.test(text)) return;
    timedLines.push({
      rawIndex,
      phraseIndex,
      sourceStart: Number(match[1]) * 60 + Number(match[2]),
      text,
      words: text.split(/\s+/).filter(Boolean),
    });
    phraseIndex += 1;
  });
  return { rawLines, timedLines };
}

function referenceWords(lines: TimedLine[], duration: number) {
  return lines.flatMap((line, lineIndex) => {
    const nextStart = lines[lineIndex + 1]?.sourceStart ?? Math.min(duration, line.sourceStart + 7);
    const span = Math.max(0.6, Math.min(12, nextStart - line.sourceStart));
    return line.words
      .map((text, wordIndex): ReferenceWord | null => {
        const normalized = normalizeWord(text);
        if (!normalized) return null;
        return {
          lineIndex: line.phraseIndex,
          wordIndex,
          text,
          normalized,
          sourceTime: line.sourceStart + (span * wordIndex) / Math.max(1, line.words.length),
        };
      })
      .filter((word): word is ReferenceWord => Boolean(word));
  });
}

function flattenHeardWords(words: HeardWord[]) {
  return words.flatMap((word) => {
    const parts = word.text.split(/\s+/).filter(Boolean);
    return parts
      .map((text, index) => ({
        text,
        normalized: normalizeWord(text),
        start: word.start + ((word.end - word.start) * index) / Math.max(1, parts.length),
        end: word.start + ((word.end - word.start) * (index + 1)) / Math.max(1, parts.length),
      }))
      .filter((part) => part.normalized);
  });
}

type TimelineGuide = (source: number) => number;

function findAnchors(
  reference: ReferenceWord[],
  heardInput: HeardWord[],
  timelineGuide?: TimelineGuide,
) {
  const heard = flattenHeardWords(heardInput);
  const rows = reference.length + 1;
  const columns = heard.length + 1;
  const scores = new Float32Array(rows * columns);
  const directions = new Uint8Array(rows * columns);
  const gap = -0.46;

  for (let i = 1; i < rows; i += 1) scores[i * columns] = i * gap;
  for (let j = 1; j < columns; j += 1) scores[j] = j * gap;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const similarity = wordSimilarity(reference[i - 1].normalized, heard[j - 1].normalized);
      const timelineDistance = timelineGuide
        ? Math.abs(heard[j - 1].start - timelineGuide(reference[i - 1].sourceTime))
        : 0;
      // Refrões e expressões repetidas são lexicalmente idênticos. Na
      // segunda passagem, a posição esperada no áudio desempata essas
      // ocorrências sem exigir que a letra pública tenha um deslocamento zero.
      const timelinePenalty = timelineGuide
        ? Math.min(2.6, Math.max(0, timelineDistance - 2.5) * 0.22)
        : 0;
      const diagonal =
        scores[(i - 1) * columns + j - 1] +
        (similarity >= 0.72 ? 1.3 + similarity - timelinePenalty : -1.05);
      const up = scores[(i - 1) * columns + j] + gap;
      const left = scores[i * columns + j - 1] + gap;
      const offset = i * columns + j;
      if (diagonal >= up && diagonal >= left) {
        scores[offset] = diagonal;
        directions[offset] = 1;
      } else if (up >= left) {
        scores[offset] = up;
        directions[offset] = 2;
      } else {
        scores[offset] = left;
        directions[offset] = 3;
      }
    }
  }

  const anchors: Anchor[] = [];
  let i = reference.length;
  let j = heard.length;
  while (i > 0 && j > 0) {
    const direction = directions[i * columns + j];
    if (direction === 1) {
      const similarity = wordSimilarity(reference[i - 1].normalized, heard[j - 1].normalized);
      if (similarity >= 0.72) {
        anchors.push({
          source: reference[i - 1].sourceTime,
          target: heard[j - 1].start,
          targetEnd: heard[j - 1].end,
          similarity,
          lineIndex: reference[i - 1].lineIndex,
          wordIndex: reference[i - 1].wordIndex,
        });
      }
      i -= 1;
      j -= 1;
    } else if (direction === 2) i -= 1;
    else j -= 1;
  }
  return anchors.reverse();
}

function linearTimelineGuide(anchors: Anchor[]): TimelineGuide | undefined {
  if (anchors.length < 4) return undefined;
  const sampleStep = Math.max(1, Math.floor(anchors.length / 48));
  const sample = anchors.filter((_, index) => index % sampleStep === 0);
  const slopes: number[] = [];
  for (let left = 0; left < sample.length; left += 1) {
    for (let right = left + 1; right < sample.length; right += 1) {
      const sourceSpan = sample[right].source - sample[left].source;
      if (sourceSpan < 8) continue;
      const slope = (sample[right].target - sample[left].target) / sourceSpan;
      if (slope >= 0.82 && slope <= 1.18) slopes.push(slope);
    }
  }
  const slope = slopes.length ? median(slopes) : 1;
  const intercept = median(anchors.map((anchor) => anchor.target - anchor.source * slope));
  return (source: number) => source * slope + intercept;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function consistentAnchors(anchors: Anchor[]) {
  if (anchors.length < 5) return anchors;
  const guide = linearTimelineGuide(anchors);
  if (!guide) return anchors;
  const residuals = anchors.map((anchor) => anchor.target - guide(anchor.source));
  const center = median(residuals);
  const deviation = median(residuals.map((residual) => Math.abs(residual - center)));
  // Um arquivo da mesma gravação pode ter deslocamento e uma pequena variação
  // de velocidade, mas não pode saltar dezenas de segundos no meio da faixa.
  const tolerance = Math.max(2.8, Math.min(8, deviation * 4 + 1.4));
  return anchors.filter(
    (anchor) => Math.abs(anchor.target - guide(anchor.source) - center) <= tolerance,
  );
}

const identityStopWords = new Set([
  "about",
  "after",
  "again",
  "ain't",
  "also",
  "because",
  "been",
  "before",
  "come",
  "could",
  "every",
  "from",
  "have",
  "here",
  "into",
  "just",
  "know",
  "like",
  "more",
  "some",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "time",
  "want",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your",
]);

function identityEvidence(anchors: Anchor[], reference: ReferenceWord[], duration: number) {
  const byPosition = new Map(
    reference.map((word) => [`${word.lineIndex}-${word.wordIndex}`, word]),
  );
  const content = anchors.filter((anchor) => {
    const word = byPosition.get(`${anchor.lineIndex}-${anchor.wordIndex}`);
    return (
      anchor.similarity >= 0.9 &&
      Boolean(word) &&
      word!.normalized.length >= 4 &&
      !identityStopWords.has(word!.normalized)
    );
  });
  const distinctiveWords = new Set(
    content.map((anchor) => byPosition.get(`${anchor.lineIndex}-${anchor.wordIndex}`)!.normalized),
  );
  const matchedLines = new Set(content.map((anchor) => anchor.lineIndex)).size;
  const sourceSpan =
    content.length > 1 ? content[content.length - 1].source - content[0].source : 0;
  const targetSpan =
    content.length > 1 ? content[content.length - 1].target - content[0].target : 0;
  const totalSourceSpan =
    reference.length > 1 ? reference[reference.length - 1].sourceTime - reference[0].sourceTime : 0;
  return {
    contentMatches: content.length,
    distinctiveWords: distinctiveWords.size,
    matchedLines,
    sourceCoverage: sourceSpan / Math.max(1, totalSourceSpan),
    targetCoverage: targetSpan / Math.max(1, duration),
  };
}

function mapperFromAnchors(anchors: Anchor[], duration: number) {
  const guide = linearTimelineGuide(anchors);
  return (source: number) => {
    if (anchors.length === 0) return Math.max(0, Math.min(duration, source));
    if (source < anchors[0].source) {
      const target = guide ? guide(source) : source + anchors[0].target - anchors[0].source;
      return Math.max(0, Math.min(duration, target));
    }
    const last = anchors[anchors.length - 1];
    if (source > last.source) {
      const target = guide ? guide(source) : source + last.target - last.source;
      return Math.max(0, Math.min(duration, target));
    }
    let low = 0;
    let high = anchors.length - 1;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (anchors[middle].source <= source) low = middle;
      else high = middle;
    }
    const left = anchors[low];
    const right = anchors[high];
    const ratio = (source - left.source) / Math.max(0.01, right.source - left.source);
    return Math.max(0, Math.min(duration, left.target + ratio * (right.target - left.target)));
  };
}

function lrcTimestamp(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = (safe - minutes * 60).toFixed(2).padStart(5, "0");
  return `${String(minutes).padStart(2, "0")}:${remainder}`;
}

async function decodeToMono16k(file: Blob, onProgress?: (progress: AlignmentProgress) => void) {
  onProgress?.({ phase: "decode", message: "Lendo o áudio neste aparelho…" });
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const frameCount = Math.max(1, Math.ceil(decoded.duration * 16_000));
    const offline = new OfflineAudioContext(1, frameCount, 16_000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return {
      samples: new Float32Array(rendered.getChannelData(0)),
      duration: decoded.duration,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

function transcribe(
  samples: Float32Array,
  onProgress?: (progress: AlignmentProgress) => void,
  mode: "fast" | "careful" = "fast",
) {
  const id = crypto.randomUUID();
  return new Promise<HeardWord[]>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => {
        pending.delete(id);
        reject(
          new Error(
            "A análise demorou mais de 15 minutos e foi interrompida. Mantenha esta tela aberta e tente novamente.",
          ),
        );
      },
      15 * 60 * 1000,
    );
    pending.set(id, { resolve, reject, onProgress, timeout });
    // Não transferimos o buffer: a segunda escuta leve reutiliza a mesma
    // amostra e o mesmo modelo, sem duplicar centenas de MB no Safari.
    alignmentWorker().postMessage({ id, samples: samples.buffer, mode });
  });
}

const learningStopWords = new Set([
  ...identityStopWords,
  "and",
  "are",
  "but",
  "did",
  "does",
  "for",
  "had",
  "has",
  "him",
  "his",
  "its",
  "not",
  "the",
  "then",
  "was",
  "were",
  "you",
]);

export function countAlignedContentWords(wordTimings: AlignedWordTiming[]) {
  return new Set(
    wordTimings
      .filter((word) => word.confidence >= 0.82)
      .map((word) => normalizeWord(word.text))
      .filter(
        (word) =>
          word.length >= 3 &&
          !learningStopWords.has(word) &&
          !/^(ah|hey|oh|ooh|uh|whoa|woah|yeah)$/.test(word),
      ),
  ).size;
}

export function countReliableLearningWords(wordTimings: AlignedWordTiming[]) {
  const byLine = new Map<number, AlignedWordTiming[]>();
  for (const word of wordTimings) {
    const line = byLine.get(word.lineIndex) ?? [];
    line.push(word);
    byLine.set(word.lineIndex, line);
  }
  const useful = new Set<string>();
  for (const line of byLine.values()) {
    const confirmed = line.filter((word) => word.confidence >= 0.82).length;
    // Duas palavras ou mais confirmam a posição de uma linha. Em versos
    // curtos, uma única palavra confirmada também é evidência suficiente.
    if (confirmed < 2 && !(confirmed === 1 && line.length <= 5)) continue;
    for (const timing of line) {
      const word = normalizeWord(timing.text);
      if (
        word.length >= 3 &&
        !learningStopWords.has(word) &&
        !/^(ah|hey|oh|ooh|uh|whoa|woah|yeah)$/.test(word)
      ) {
        useful.add(word);
      }
    }
  }
  return useful.size;
}

export function alignRecognizedWordsToLyrics(
  syncedLyrics: string,
  heard: HeardWord[],
  duration: number,
): AudioAlignment {
  const { rawLines, timedLines } = parseTimedLyrics(syncedLyrics);
  const reference = referenceWords(timedLines, duration);
  const firstPass = findAnchors(reference, heard);
  const guide = linearTimelineGuide(firstPass);
  // A primeira passagem descobre o deslocamento e a velocidade da gravação.
  // A segunda usa essa linha do tempo para não confundir refrões repetidos.
  const rawAnchors = findAnchors(reference, heard, guide);
  const guidedAnchors = consistentAnchors(rawAnchors);
  const firstPassAnchors = consistentAnchors(firstPass);
  const guidedLines = new Set(guidedAnchors.map((anchor) => anchor.lineIndex)).size;
  const firstPassLines = new Set(firstPassAnchors.map((anchor) => anchor.lineIndex)).size;
  // Em vozes muito agudas, graves ou com muitos efeitos, a primeira estimativa
  // temporal pode ficar pobre. Nessa situação preservamos a sequência lexical
  // consistente em vez de reduzir a música a uma ou duas palavras.
  const anchors =
    guidedAnchors.length >= 8 && guidedLines >= 4
      ? guidedAnchors
      : firstPassAnchors.length >= 8 && firstPassLines >= 4
        ? firstPassAnchors
        : guidedAnchors;
  const matchedOriginalWords = new Set(
    anchors.map((anchor) => `${anchor.lineIndex}-${anchor.wordIndex}`),
  );
  const confidence =
    anchors.reduce((sum, anchor) => sum + anchor.similarity, 0) / Math.max(1, reference.length);
  const sourceSpan =
    reference.length > 1 ? reference[reference.length - 1].sourceTime - reference[0].sourceTime : 0;
  const alignedSourceSpan =
    anchors.length > 1 ? anchors[anchors.length - 1].source - anchors[0].source : 0;
  const targetSpan =
    anchors.length > 1 ? anchors[anchors.length - 1].target - anchors[0].target : 0;
  const sourceCoverage = alignedSourceSpan / Math.max(1, sourceSpan);
  const targetCoverage = targetSpan / Math.max(1, duration);
  const matchedLines = new Set(anchors.map((anchor) => anchor.lineIndex)).size;
  const lineCoverage = matchedLines / Math.max(1, timedLines.length);
  const identity = identityEvidence(rawAnchors, reference, duration);
  const strongAlignment =
    anchors.length >= Math.max(10, Math.min(24, Math.ceil(reference.length * 0.12))) &&
    confidence >= 0.3 &&
    sourceCoverage >= 0.42 &&
    targetCoverage >= 0.18 &&
    lineCoverage >= 0.28;
  const distributedIdentity =
    rawAnchors.length >= Math.max(12, Math.min(30, Math.ceil(reference.length * 0.08))) &&
    identity.contentMatches >= 10 &&
    identity.distinctiveWords >= 6 &&
    identity.matchedLines >= 4 &&
    identity.sourceCoverage >= 0.38 &&
    identity.targetCoverage >= 0.16;
  const stableFinalAlignment =
    anchors.length >= Math.max(8, Math.min(18, Math.ceil(reference.length * 0.06))) &&
    matchedLines >= Math.max(3, Math.min(8, Math.ceil(timedLines.length * 0.12))) &&
    sourceCoverage >= 0.32 &&
    targetCoverage >= 0.14;

  if ((!strongAlignment && !distributedIdentity) || !stableFinalAlignment) {
    throw new Error(
      "Este áudio não corresponde com segurança à música selecionada. Escolha a gravação original correta; o arquivo não foi salvo.",
    );
  }

  const mapTime = mapperFromAnchors(anchors, duration);
  const lineStart = new Map<number, number>();
  timedLines.forEach((line) => {
    lineStart.set(line.rawIndex, mapTime(line.sourceStart));
  });
  let previousStart = -0.05;
  const rewritten = rawLines.map((line, rawIndex) => {
    const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (!match) return line;
    const source = Number(match[1]) * 60 + Number(match[2]);
    const target = Math.max(previousStart + 0.05, lineStart.get(rawIndex) ?? mapTime(source));
    previousStart = target;
    return `[${lrcTimestamp(target)}]${match[3]}`;
  });

  const anchorByWord = new Map(
    anchors.map((anchor) => [`${anchor.lineIndex}-${anchor.wordIndex}`, anchor]),
  );
  const wordTimings = reference.map((word, index): AlignedWordTiming => {
    const anchor = anchorByWord.get(`${word.lineIndex}-${word.wordIndex}`);
    const start = anchor?.target ?? mapTime(word.sourceTime);
    const next = reference[index + 1];
    const end =
      anchor?.targetEnd ?? Math.max(start + 0.12, next ? mapTime(next.sourceTime) : start + 0.45);
    return {
      lineIndex: word.lineIndex,
      wordIndex: word.wordIndex,
      text: word.text,
      start,
      end: Math.min(duration, Math.max(start + 0.08, end)),
      confidence: anchor?.similarity ?? 0,
    };
  });

  if (countReliableLearningWords(wordTimings) < 6) {
    throw new Error(
      "A primeira escuta não localizou palavras suficientes para montar uma atividade segura.",
    );
  }

  return {
    syncedLyrics: rewritten.join("\n"),
    wordTimings,
    confidence,
    matchedWords: matchedOriginalWords.size,
    totalWords: reference.length,
  };
}

export async function alignAudioToLyrics(
  file: Blob,
  syncedLyrics: string,
  onProgress?: (progress: AlignmentProgress) => void,
): Promise<AudioAlignment> {
  const { samples, duration } = await decodeToMono16k(file, onProgress);
  const heard = await transcribe(samples, onProgress, "fast");
  onProgress?.({
    phase: "alignment",
    message: "Conferindo o que foi ouvido com a letra…",
  });
  try {
    return alignRecognizedWordsToLyrics(syncedLyrics, heard, duration);
  } catch (firstError) {
    onProgress?.({
      phase: "model",
      message: "A primeira escuta não foi suficiente. Tentando novamente sem pesar o aparelho…",
    });
    const carefulHeard = await transcribe(samples, onProgress, "careful");
    onProgress?.({
      phase: "alignment",
      message: "Validando a sincronização mais precisa…",
    });
    try {
      return alignRecognizedWordsToLyrics(syncedLyrics, carefulHeard, duration);
    } catch (secondError) {
      throw secondError instanceof Error ? secondError : firstError;
    }
  }
}
