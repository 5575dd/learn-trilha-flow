"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { translateLinesOnDevice } from "./device-translation";
import type { SpotifyTrack } from "./spotify";
import { findCrossedPendingLine, lineAtTime, unresolvedGaps } from "./lyrics-game-state";

type CoursePhrase = {
  start: number;
  text: string;
  section?: string;
  words?: WordTiming[];
};

type WordTiming = {
  lineIndex: number;
  wordIndex: number;
  text: string;
  start: number;
  end: number;
  confidence: number;
};

type CourseAudio = {
  url: string;
  duration: number;
  fileName: string;
  syncRatio: number;
  syncLead: number;
};

type Difficulty = "beginner" | "intermediate" | "advanced" | "expert";
type AnswerMode = "write" | "select" | "karaoke";
type ExperienceMode = "practice" | "challenge";
type Stage = "setup" | "game" | "result";
type GapStatus = "correct" | "revealed";

type SavedGameSession = {
  version: 2;
  trackId: string;
  difficulty: Difficulty;
  answerMode: AnswerMode;
  experienceMode: ExperienceMode;
  seed: number;
  currentTime: number;
  activeLineIndex: number;
  blockedLineIndex: number | null;
  waitingForAnswer: boolean;
  resolved: Record<string, GapStatus>;
  typed: Record<string, string>;
  hinted: Record<string, boolean>;
  score: number;
  streak: number;
  bestStreak: number;
  errors: number;
  replays: number;
  energy: number;
  updatedAt: number;
};

type GameLine = {
  id: string;
  start: number;
  end: number;
  text: string;
  words: string[];
  gapIndexes: number[];
  practice: boolean;
  wordTimings: WordTiming[];
};

type GapRef = {
  key: string;
  lineIndex: number;
  wordIndex: number;
  answer: string;
};

const difficultyConfig: Record<Difficulty, { label: string; detail: string; target: number }> = {
  beginner: {
    label: "Iniciante",
    detail: "12 palavras úteis por rodada",
    target: 12,
  },
  intermediate: {
    label: "Intermediário",
    detail: "18 palavras úteis por rodada",
    target: 18,
  },
  advanced: {
    label: "Avançado",
    detail: "26 palavras úteis por rodada",
    target: 26,
  },
  expert: {
    label: "Especialista",
    detail: "38 palavras úteis por rodada",
    target: 38,
  },
};

const ignoredWords = new Set(["ah", "hey", "la", "na", "oh", "ooh", "uh", "whoa", "woah", "yeah"]);

const functionWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "hers",
  "him",
  "his",
  "i",
  "if",
  "in",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "ours",
  "she",
  "so",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "to",
  "us",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "will",
  "with",
  "would",
  "you",
  "your",
  "yours",
]);

const usefulShortWords = new Set([
  "break",
  "bring",
  "come",
  "dream",
  "feel",
  "find",
  "get",
  "give",
  "go",
  "hear",
  "keep",
  "know",
  "leave",
  "live",
  "look",
  "lose",
  "make",
  "need",
  "run",
  "say",
  "see",
  "sing",
  "stay",
  "take",
  "tell",
  "think",
  "try",
  "turn",
  "wait",
  "want",
  "win",
]);

function cleanWord(value: string) {
  return value.replace(/^[^A-Za-zÀ-ÿ']+|[^A-Za-zÀ-ÿ']+$/g, "").replace(/’/g, "'");
}

function normalizedAnswer(value: string) {
  return cleanWord(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function wordParts(value: string) {
  const clean = cleanWord(value);
  const start = value.indexOf(clean);
  if (!clean || start < 0) return { before: "", clean: value, after: "" };
  return {
    before: value.slice(0, start),
    clean,
    after: value.slice(start + clean.length),
  };
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${rest}`;
}

function knownLineTranslation(text: string) {
  const lower = normalizedAnswer(text);
  const known: Array<[string[], string]> = [
    [["every", "time", "mirror"], "Toda vez que me olho no espelho."],
    [["past", "gone"], "O passado já foi embora."],
    [["dusk", "dawn"], "Do anoitecer até o amanhecer."],
    [["laughter", "tears"], "Cante pelos momentos de riso e também pelos de lágrimas."],
    [["dream", "true"], "Continue sonhando até que seus sonhos se tornem realidade."],
    [["dream", "on"], "Continue sonhando e persistindo."],
    [["sing", "year"], "Cante comigo e viva intensamente este momento."],
  ];
  const words = lower.split(/\s+/);
  const found = known.find(([needles]) => needles.every((needle) => words.includes(needle)));
  return found?.[1] ?? null;
}

function vocabularyScore(answer: string, frequency: number) {
  const normalized = normalizedAnswer(answer);
  let score = Math.min(answer.length, 9);
  if (usefulShortWords.has(normalized)) score += 8;
  if (/(ing|ed|ful|less|ment|ness|tion|ly)$/i.test(normalized)) score += 3;
  if (answer.length >= 6) score += 2;
  if (frequency >= 2) score += Math.min(3, frequency - 1);
  return score;
}

function hasReliableLineTiming(line: Pick<GameLine, "words" | "wordTimings">) {
  if (line.wordTimings.length === 0) return true;
  const confirmed = line.wordTimings.filter((timing) => timing.confidence >= 0.82);
  return confirmed.length >= 2 || (confirmed.length >= 1 && line.words.length <= 5);
}

function rankedVocabulary(lines: GameLine[]) {
  const groups = new Map<string, GapRef[]>();
  lines.forEach((line, lineIndex) => {
    if (!line.practice) return;
    const reliableLineTiming = hasReliableLineTiming(line);
    line.words.forEach((word, wordIndex) => {
      const answer = cleanWord(word);
      const normalized = normalizedAnswer(answer);
      if (
        answer.length >= 2 &&
        // Duas palavras confirmadas localizam o verso inteiro. Assim a atividade
        // pode trabalhar vocabulário relevante do verso sem depender de o
        // reconhecedor ter acertado exatamente a palavra escolhida.
        reliableLineTiming &&
        !ignoredWords.has(normalized) &&
        !functionWords.has(normalized) &&
        /^[A-Za-zÀ-ÿ]+(?:['’][A-Za-zÀ-ÿ]+)?$/.test(answer)
      ) {
        const occurrence = {
          key: `${lineIndex}-${wordIndex}`,
          lineIndex,
          wordIndex,
          answer,
        };
        groups.set(normalized, [...(groups.get(normalized) ?? []), occurrence]);
      }
    });
  });

  return Array.from(groups.entries())
    .map(([normalized, occurrences]) => ({
      normalized,
      occurrences,
      score: vocabularyScore(occurrences[0].answer, occurrences.length),
      firstLine: occurrences[0].lineIndex,
    }))
    .sort(
      (a, b) =>
        b.score - a.score || a.firstLine - b.firstLine || a.normalized.localeCompare(b.normalized),
    );
}

function vocabularyRoundInfo(lines: GameLine[], difficulty: Difficulty, seed: number) {
  const vocabulary = rankedVocabulary(lines);
  const target = Math.max(1, Math.min(difficultyConfig[difficulty].target, vocabulary.length));
  const rounds = Math.max(1, Math.ceil(vocabulary.length / target));
  const round = ((seed % rounds) + rounds) % rounds;
  return { vocabulary, target, rounds, round };
}

function buildLines(
  phrases: CoursePhrase[],
  audio: CourseAudio,
  difficulty: Difficulty,
  seed: number,
  answerMode: AnswerMode,
) {
  const usable = phrases
    .filter((phrase) => phrase.text.trim() && !/^\s*\[.+\]\s*$/.test(phrase.text))
    .map((phrase, index, source) => {
      const start = Math.max(0, phrase.start * audio.syncRatio - audio.syncLead);
      const nextStart =
        source[index + 1]?.start != null
          ? source[index + 1].start * audio.syncRatio - audio.syncLead
          : Math.min(audio.duration, start + 8);
      const section = phrase.section?.toLowerCase() ?? "";
      const wordCount = phrase.text.trim().split(/\s+/).length;
      const dialogueIntro =
        start < 45 &&
        (/\b(homie|calm down|pull off|gotta go get|takin'|hungrier|motherfucker)\b/i.test(
          phrase.text,
        ) ||
          /^(damn|ayo|ah\b|man\b|what the fuck)/i.test(phrase.text.trim()) ||
          (wordCount <= 9 && /[?!]\s*$/.test(phrase.text.trim())));
      const spokenIntro =
        /intro|spoken|dialog|interlude|skit|sample/.test(section) ||
        dialogueIntro ||
        (start < 35 && wordCount >= 11 && /[.!?]$/.test(phrase.text.trim()));
      const trustedWordTimings = (phrase.words ?? []).filter((word) => word.confidence >= 0.82);
      const hasAutomaticAlignment = (phrase.words?.length ?? 0) > 0;
      const reliableLineTiming =
        trustedWordTimings.length >= 2 || (trustedWordTimings.length >= 1 && wordCount <= 5);
      return {
        id: `line-${index}`,
        start,
        end: Math.max(start + 0.8, Math.min(audio.duration, nextStart - 0.04)),
        text: phrase.text.trim(),
        words: phrase.text.trim().split(/\s+/),
        gapIndexes: [] as number[],
        practice: !spokenIntro && (!hasAutomaticAlignment || reliableLineTiming),
        wordTimings: phrase.words ?? [],
      };
    });

  if (answerMode === "karaoke") return usable;

  const { vocabulary, target, round } = vocabularyRoundInfo(usable, difficulty, seed);
  const selectedVocabulary = vocabulary.slice(round * target, (round + 1) * target);
  selectedVocabulary.forEach((entry, entryIndex) => {
    const occurrence = entry.occurrences[(seed + entryIndex) % entry.occurrences.length];
    usable[occurrence.lineIndex].gapIndexes.push(occurrence.wordIndex);
  });
  usable.forEach((line) => {
    line.gapIndexes.sort((a, b) => a - b);
  });
  return usable;
}

function allGaps(lines: GameLine[]) {
  return lines.flatMap((line, lineIndex) =>
    line.gapIndexes.map((wordIndex) => ({
      key: `${lineIndex}-${wordIndex}`,
      lineIndex,
      wordIndex,
      answer: cleanWord(line.words[wordIndex]),
    })),
  );
}

function buildOptions(answer: string, lines: GameLine[], offset: number) {
  const pool = Array.from(
    new Set(
      lines
        .flatMap((line) => line.words)
        .map(cleanWord)
        .filter(
          (word) =>
            word.length >= 2 &&
            !functionWords.has(normalizedAnswer(word)) &&
            normalizedAnswer(word) !== normalizedAnswer(answer),
        ),
    ),
  ).sort((a, b) => Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length));
  const fallback = ["still", "time", "know", "feel", "stay", "away"];
  const distractors = Array.from(new Set([...pool, ...fallback])).slice(0, 3);
  const options = [answer, ...distractors];
  const rotation = offset % options.length;
  return [...options.slice(rotation), ...options.slice(0, rotation)];
}

export function LyricsGameCourse({
  track,
  phrases,
  audio,
  loading,
  loadingMessage,
  error,
  onRetry,
}: {
  track: SpotifyTrack;
  phrases: CoursePhrase[];
  audio: CourseAudio | null;
  loading: boolean;
  loadingMessage: string;
  error: string | null;
  onRetry: () => void;
}) {
  const playerRef = useRef<HTMLAudioElement>(null);
  const lyricStageRef = useRef<HTMLDivElement>(null);
  const keyboardAnchorRef = useRef<HTMLInputElement>(null);
  const previousTimeRef = useRef(0);
  const slowReplayEndRef = useRef<number | null>(null);
  const blockedLineIndexRef = useRef<number | null>(null);
  const manualScrollUntilRef = useRef(0);
  const [stage, setStage] = useState<Stage>("setup");
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("write");
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("practice");
  const [seed, setSeed] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(audio?.duration ?? 0);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [waitingForAnswer, setWaitingForAnswer] = useState(false);
  const [manualPause, setManualPause] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [resolved, setResolved] = useState<Record<string, GapStatus>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{
    kind: "correct" | "wrong" | "info";
    text: string;
  } | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState(false);
  const [browsingLyrics, setBrowsingLyrics] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [hinted, setHinted] = useState<Record<string, boolean>>({});
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [errors, setErrors] = useState(0);
  const [replays, setReplays] = useState(0);
  const [energy, setEnergy] = useState(5);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [visualViewportHeight, setVisualViewportHeight] = useState(0);
  const [visualViewportTop, setVisualViewportTop] = useState(0);
  const [resumeSession, setResumeSession] = useState<SavedGameSession | null>(null);
  const keyboardBaseHeight = useRef(0);

  const lines = useMemo(
    () => (audio ? buildLines(phrases, audio, difficulty, seed, answerMode) : ([] as GameLine[])),
    [answerMode, audio, difficulty, phrases, seed],
  );
  const vocabularyPlan = useMemo(
    () => vocabularyRoundInfo(lines, difficulty, seed),
    [difficulty, lines, seed],
  );
  const gaps = useMemo(() => allGaps(lines), [lines]);
  const activeLine = activeLineIndex >= 0 ? lines[activeLineIndex] : undefined;
  const unresolvedInLine =
    activeLine?.gapIndexes.filter((wordIndex) => !resolved[`${activeLineIndex}-${wordIndex}`]) ??
    [];
  const activeGapIndex = unresolvedInLine[0] ?? -1;
  const activeGapKey = activeGapIndex >= 0 ? `${activeLineIndex}-${activeGapIndex}` : "";
  const activeAnswer =
    activeGapIndex >= 0 && activeLine ? cleanWord(activeLine.words[activeGapIndex]) : "";
  const completedCount = Object.keys(resolved).length;
  const correctCount = Object.values(resolved).filter((status) => status === "correct").length;
  const revealedCount = Object.values(resolved).filter((status) => status === "revealed").length;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const translationTexts = useMemo(
    () => Array.from(new Set(lines.map((line) => line.text))),
    [lines],
  );
  const translationTextsKey = translationTexts.join("\n");

  const translationFor = (text: string) => translations[text] ?? knownLineTranslation(text);

  const scrollToActiveLine = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      if (activeLineIndex < 0) return;
      const viewport = lyricStageRef.current;
      const target = viewport?.querySelector<HTMLElement>(`[data-lyric-line="${activeLineIndex}"]`);
      if (!viewport || !target) return;
      const viewportRect = viewport.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetCenter = targetRect.top + targetRect.height / 2;
      const viewportCenter = viewportRect.top + viewportRect.height / 2;
      const centeredTop = viewport.scrollTop + targetCenter - viewportCenter;
      viewport.scrollTo({ top: Math.max(0, centeredTop), behavior });
      manualScrollUntilRef.current = 0;
      setBrowsingLyrics(false);
    },
    [activeLineIndex],
  );

  const noteManualLyricsBrowse = () => {
    manualScrollUntilRef.current = Date.now() + 8_000;
    setBrowsingLyrics(true);
  };

  const focusActiveGap = (key = activeGapKey) => {
    if (answerMode !== "write" || stage !== "game") return;
    const input = lyricStageRef.current?.querySelector<HTMLInputElement>(`[data-gap-key="${key}"]`);
    (input ?? keyboardAnchorRef.current)?.focus({ preventScroll: true });
  };

  const keepActiveGapFocused = (key = activeGapKey) => {
    if (answerMode !== "write" || stage !== "game") return;
    const focus = () => focusActiveGap(key);
    focus();
    window.requestAnimationFrame(focus);
    window.setTimeout(focus, 90);
    window.setTimeout(focus, 240);
    window.setTimeout(focus, 480);
  };

  const preserveKeyboardPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (answerMode !== "write" || stage !== "game") return;
    event.preventDefault();
    focusActiveGap();
  };

  const runKeepingKeyboard = (action: () => void, moveToAnchor = false) => {
    if (answerMode === "write" && stage === "game" && moveToAnchor) {
      keyboardAnchorRef.current?.focus({ preventScroll: true });
    } else {
      focusActiveGap();
    }
    action();
    keepActiveGapFocused();
  };

  useEffect(() => {
    const resetId = window.setTimeout(() => {
      const storageKey = `trilha-lyrics-game-${track.id}`;
      let savedSession: SavedGameSession | null = null;
      try {
        const saved = JSON.parse(
          window.localStorage.getItem(storageKey) ?? "null",
        ) as Partial<SavedGameSession> | null;
        const validDifficulty = ["beginner", "intermediate", "advanced", "expert"].includes(
          saved?.difficulty ?? "",
        );
        const validAnswerMode = ["write", "select", "karaoke"].includes(saved?.answerMode ?? "");
        const validExperienceMode = ["practice", "challenge"].includes(saved?.experienceMode ?? "");
        if (
          saved &&
          validDifficulty &&
          validAnswerMode &&
          validExperienceMode &&
          Number.isFinite(saved.currentTime) &&
          (saved.currentTime ?? 0) >= 1 &&
          saved.resolved &&
          typeof saved.resolved === "object"
        ) {
          savedSession = {
            version: 2,
            trackId: track.id,
            difficulty: saved.difficulty as Difficulty,
            answerMode: saved.answerMode as AnswerMode,
            experienceMode: saved.experienceMode as ExperienceMode,
            seed: Number.isFinite(saved.seed) ? Number(saved.seed) : 0,
            currentTime: Number(saved.currentTime),
            activeLineIndex: Number.isInteger(saved.activeLineIndex)
              ? Number(saved.activeLineIndex)
              : -1,
            blockedLineIndex: Number.isInteger(saved.blockedLineIndex)
              ? Number(saved.blockedLineIndex)
              : null,
            waitingForAnswer: Boolean(saved.waitingForAnswer),
            resolved: saved.resolved as Record<string, GapStatus>,
            typed:
              saved.typed && typeof saved.typed === "object"
                ? (saved.typed as Record<string, string>)
                : {},
            hinted:
              saved.hinted && typeof saved.hinted === "object"
                ? (saved.hinted as Record<string, boolean>)
                : {},
            score: Number.isFinite(saved.score) ? Number(saved.score) : 0,
            streak: Number.isFinite(saved.streak) ? Number(saved.streak) : 0,
            bestStreak: Number.isFinite(saved.bestStreak) ? Number(saved.bestStreak) : 0,
            errors: Number.isFinite(saved.errors) ? Number(saved.errors) : 0,
            replays: Number.isFinite(saved.replays) ? Number(saved.replays) : 0,
            energy: Number.isFinite(saved.energy) ? Number(saved.energy) : 5,
            updatedAt: Number.isFinite(saved.updatedAt) ? Number(saved.updatedAt) : Date.now(),
          };
        } else if (saved) {
          window.localStorage.removeItem(storageKey);
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }
      setResumeSession(savedSession);
      setStage("setup");
      setResolved({});
      setTyped({});
      setCurrentTime(0);
      setActiveLineIndex(-1);
      blockedLineIndexRef.current = null;
      setWaitingForAnswer(false);
      setFeedback(null);
    }, 0);
    return () => window.clearTimeout(resetId);
  }, [track.id]);

  useEffect(() => {
    if (!translationTextsKey) return;
    let cancelled = false;
    const legacyCacheKey = `trilha-song-translations-v3-${track.id}`;
    const globalCacheKey = "trilha-global-translations-v1";
    let cached: Record<string, string> = {};
    let globallyCached: Record<string, string> = {};
    try {
      cached = JSON.parse(window.localStorage.getItem(legacyCacheKey) ?? "{}") as Record<
        string,
        string
      >;
      globallyCached = JSON.parse(window.localStorage.getItem(globalCacheKey) ?? "{}") as Record<
        string,
        string
      >;
    } catch {
      window.localStorage.removeItem(legacyCacheKey);
      window.localStorage.removeItem(globalCacheKey);
    }
    const known = Object.fromEntries(
      translationTexts
        .map((line) => [line, knownLineTranslation(line)] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
    );
    const accumulated = { ...known, ...globallyCached, ...cached };
    const initialMissing = translationTexts.filter((line) => !accumulated[line]);

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setTranslations(accumulated);
      setTranslationLoading(initialMissing.length > 0);
      setTranslationError(false);
      if (initialMissing.length === 0) return;

      const saveTranslations = () => {
        const trackTranslations = Object.fromEntries(
          translationTexts
            .filter((line) => Boolean(accumulated[line]))
            .map((line) => [line, accumulated[line]]),
        );
        globallyCached = { ...globallyCached, ...trackTranslations };
        const cachedEntries = Object.entries(globallyCached);
        if (cachedEntries.length > 12_000) {
          globallyCached = Object.fromEntries(cachedEntries.slice(-12_000));
        }
        setTranslations({ ...accumulated });
        try {
          window.localStorage.setItem(globalCacheKey, JSON.stringify(globallyCached));
        } catch {
          // A tradução continua visível mesmo se o aparelho estiver sem espaço.
        }
      };

      // A fonte gratuita passa a ser consultada pelo próprio aparelho. Assim,
      // cada usuário tem seu limite independente e cada verso aparece assim
      // que fica pronto, sem esperar a música inteira.
      await translateLinesOnDevice(initialMissing, {
        concurrency: 2,
        onTranslation: (line, translation) => {
          accumulated[line] = translation;
          if (!cancelled) setTranslations({ ...accumulated });
        },
      });

      if (!cancelled) {
        saveTranslations();
        const deviceStillMissing = translationTexts.some((line) => !accumulated[line]);
        setTranslationError(deviceStillMissing);
        setTranslationLoading(false);
      }

      // Se o navegador bloquear as fontes externas, o servidor tenta somente
      // as linhas restantes, em lotes pequenos e controlados.
      const missing = translationTexts.filter((line) => !accumulated[line]);
      if (!cancelled && missing.length > 0) {
        for (let index = 0; index < missing.length; index += 4) {
          if (cancelled) return;
          const batch = missing.slice(index, index + 4);
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 36_000);
          try {
            const response = await fetch("/api/translate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lines: batch }),
              signal: controller.signal,
            });
            const result = (await response.json().catch(() => ({}))) as {
              translations?: Record<string, string>;
            };
            Object.assign(accumulated, result.translations ?? {});
            if (!cancelled && Object.keys(result.translations ?? {}).length > 0) {
              saveTranslations();
            }
          } catch {
            // A próxima rodada tenta novamente somente as linhas pendentes.
          } finally {
            window.clearTimeout(timeout);
          }
        }
      }

      if (cancelled) return;
      const stillMissing = translationTexts.some((line) => !accumulated[line]);
      setTranslationError(stillMissing);
      setTranslationLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [track.id, translationTexts, translationTextsKey]);

  useLayoutEffect(() => {
    if (answerMode !== "write" || stage !== "game") return;
    const input = lyricStageRef.current?.querySelector<HTMLInputElement>(
      `[data-gap-key="${activeGapKey}"]`,
    );
    (input ?? keyboardAnchorRef.current)?.focus({ preventScroll: true });
  }, [activeGapKey, activeLineIndex, answerMode, stage]);

  useEffect(() => {
    if (stage !== "game" || answerMode !== "write") {
      const resetId = window.setTimeout(() => setKeyboardOpen(false), 0);
      return () => window.clearTimeout(resetId);
    }
    const viewport = window.visualViewport;
    const currentHeight = viewport?.height ?? window.innerHeight;
    keyboardBaseHeight.current = Math.max(keyboardBaseHeight.current, currentHeight);

    const updateKeyboard = () => {
      const height = viewport?.height ?? window.innerHeight;
      keyboardBaseHeight.current = Math.max(keyboardBaseHeight.current, height);
      const rootNode = lyricStageRef.current?.getRootNode();
      const activeElement =
        rootNode instanceof ShadowRoot ? rootNode.activeElement : document.activeElement;
      const focusedGap =
        activeElement instanceof HTMLInputElement && Boolean(activeElement.dataset.gapKey);
      setVisualViewportHeight(height);
      setVisualViewportTop(viewport?.offsetTop ?? 0);
      setKeyboardOpen(focusedGap && keyboardBaseHeight.current - height > 80);
    };
    const updateAfterFocus = () => window.setTimeout(updateKeyboard, 40);

    updateKeyboard();
    viewport?.addEventListener("resize", updateKeyboard);
    viewport?.addEventListener("scroll", updateKeyboard);
    window.addEventListener("resize", updateKeyboard);
    document.addEventListener("focusin", updateAfterFocus);
    document.addEventListener("focusout", updateAfterFocus);
    return () => {
      viewport?.removeEventListener("resize", updateKeyboard);
      viewport?.removeEventListener("scroll", updateKeyboard);
      window.removeEventListener("resize", updateKeyboard);
      document.removeEventListener("focusin", updateAfterFocus);
      document.removeEventListener("focusout", updateAfterFocus);
    };
  }, [answerMode, stage]);

  useEffect(() => {
    if (stage !== "game") return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [stage]);

  useLayoutEffect(() => {
    if (activeLineIndex < 0) return;
    const mustAnswer = Boolean(activeGapKey);
    if (Date.now() < manualScrollUntilRef.current && !mustAnswer) return;
    const scroll = () => scrollToActiveLine("auto");
    const frame = window.requestAnimationFrame(scroll);
    if (!mustAnswer) return () => window.cancelAnimationFrame(frame);

    // O Safari redimensiona a área visível em etapas enquanto abre o teclado.
    // Recentrar durante essa animação impede que a lacuna fique fora da tela.
    const timers = [70, 180, 360, 620].map((delay) => window.setTimeout(scroll, delay));
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [activeGapKey, activeLineIndex, keyboardOpen, scrollToActiveLine]);

  useEffect(() => {
    if (stage !== "game") return;
    window.localStorage.setItem(
      `trilha-lyrics-game-${track.id}`,
      JSON.stringify({
        version: 2,
        trackId: track.id,
        difficulty,
        answerMode,
        experienceMode,
        seed,
        currentTime,
        activeLineIndex,
        blockedLineIndex: blockedLineIndexRef.current,
        waitingForAnswer,
        resolved,
        typed,
        hinted,
        score,
        streak,
        bestStreak,
        errors,
        replays,
        energy,
        updatedAt: Date.now(),
      }),
    );
  }, [
    answerMode,
    activeLineIndex,
    bestStreak,
    currentTime,
    difficulty,
    energy,
    errors,
    experienceMode,
    hinted,
    replays,
    resolved,
    score,
    seed,
    stage,
    streak,
    track.id,
    typed,
    waitingForAnswer,
  ]);

  if (loading) {
    return (
      <section className="course-loading">
        <span className="spin">↻</span>
        <h1>Analisando esta gravação…</h1>
        <p>{loadingMessage}</p>
        <small>
          Na primeira música, o aparelho precisa baixar o reconhecedor. Não feche esta tela.
        </small>
      </section>
    );
  }

  if (error || !audio || phrases.length === 0) {
    return (
      <section className="course-error">
        <span>!</span>
        <h1>A atividade ainda não ficou pronta</h1>
        <p>{error ?? "O áudio e a letra sincronizada não foram encontrados."}</p>
        <button className="button" onClick={onRetry}>
          Tentar novamente
        </button>
      </section>
    );
  }

  const resetAttempt = (newSeed = seed) => {
    const player = playerRef.current;
    if (player) {
      player.pause();
      player.currentTime = 0;
      player.playbackRate = 1;
    }
    slowReplayEndRef.current = null;
    setSeed(newSeed);
    setResolved({});
    setTyped({});
    setCurrentTime(0);
    previousTimeRef.current = 0;
    setActiveLineIndex(-1);
    blockedLineIndexRef.current = null;
    setManualPause(false);
    setFeedback(null);
    setShowHelp(false);
    setBrowsingLyrics(false);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setErrors(0);
    setReplays(0);
    setEnergy(5);
  };

  const beginGame = async () => {
    window.localStorage.removeItem(`trilha-lyrics-game-${track.id}`);
    setResumeSession(null);
    resetAttempt(seed);
    setStage("game");
    requestAnimationFrame(() => {
      const player = playerRef.current;
      if (!player) return;
      player.play().catch(() => setPlaying(false));
    });
  };

  const continueGame = () => {
    if (!resumeSession) return;
    const resumedLines = buildLines(
      phrases,
      audio,
      resumeSession.difficulty,
      resumeSession.seed,
      resumeSession.answerMode,
    );
    const maximumTime = Math.max(0, (audio.duration || duration) - 0.25);
    const resumedTime = Math.min(resumeSession.currentTime, maximumTime);
    const timeLineIndex = lineAtTime(resumedLines, resumedTime);
    const resumedLineIndex =
      resumeSession.activeLineIndex >= 0 && resumeSession.activeLineIndex < resumedLines.length
        ? resumeSession.activeLineIndex
        : timeLineIndex;
    const blockedLineIndex =
      resumeSession.waitingForAnswer &&
      resumeSession.blockedLineIndex != null &&
      resumeSession.blockedLineIndex < resumedLines.length
        ? resumeSession.blockedLineIndex
        : null;

    setDifficulty(resumeSession.difficulty);
    setAnswerMode(resumeSession.answerMode);
    setExperienceMode(resumeSession.experienceMode);
    setSeed(resumeSession.seed);
    setResolved(resumeSession.resolved);
    setTyped(resumeSession.typed);
    setHinted(resumeSession.hinted);
    setScore(resumeSession.score);
    setStreak(resumeSession.streak);
    setBestStreak(resumeSession.bestStreak);
    setErrors(resumeSession.errors);
    setReplays(resumeSession.replays);
    setEnergy(resumeSession.energy);
    setCurrentTime(resumedTime);
    previousTimeRef.current = resumedTime;
    blockedLineIndexRef.current = blockedLineIndex;
    setActiveLineIndex(blockedLineIndex ?? resumedLineIndex);
    setWaitingForAnswer(blockedLineIndex != null);
    setManualPause(false);
    setFeedback(
      blockedLineIndex != null
        ? { kind: "info", text: "Continue pela palavra que ficou pendente." }
        : null,
    );
    setShowHelp(false);
    setBrowsingLyrics(false);
    setStage("game");

    window.requestAnimationFrame(() => {
      const player = playerRef.current;
      if (!player) return;
      player.currentTime = resumedTime;
      player.playbackRate = 1;
      if (blockedLineIndex == null) {
        player.play().catch(() => setPlaying(false));
      } else {
        player.pause();
        window.setTimeout(() => keepActiveGapFocused(), 120);
      }
    });
  };

  const leaveGame = () => {
    playerRef.current?.pause();
    const storageKey = `trilha-lyrics-game-${track.id}`;
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(storageKey) ?? "null",
      ) as SavedGameSession | null;
      setResumeSession(saved);
    } catch {
      setResumeSession(null);
    }
    setStage("setup");
  };

  const finishGame = () => {
    if (playerRef.current) {
      playerRef.current.pause();
      playerRef.current.playbackRate = 1;
    }
    slowReplayEndRef.current = null;
    blockedLineIndexRef.current = null;
    setPlaying(false);
    setStage("result");
    window.localStorage.removeItem(`trilha-lyrics-game-${track.id}`);
    setResumeSession(null);
    window.localStorage.setItem(
      `trilha-lyrics-result-${track.id}`,
      JSON.stringify({
        difficulty,
        answerMode,
        correct: correctCount,
        revealed: revealedCount,
        errors,
        replays,
        score,
        bestStreak,
        completedAt: Date.now(),
      }),
    );
  };

  const loseEnergy = () => {
    if (experienceMode !== "challenge") return;
    setEnergy((current) => {
      const next = Math.max(0, current - 1);
      if (next === 0) {
        setFeedback({
          kind: "info",
          text: "Sua energia terminou. Você pode continuar sem pressão no modo prática.",
        });
      }
      return next;
    });
  };

  const resolveGap = (key: string, status: GapStatus) => {
    if (resolved[key]) return;
    setResolved((current) => ({ ...current, [key]: status }));
    setTyped((current) => ({ ...current, [key]: activeAnswer }));
    if (status === "correct") {
      const nextStreak = streak + 1;
      const multiplier = Math.min(3, 1 + Math.floor(nextStreak / 5) * 0.5);
      setStreak(nextStreak);
      setBestStreak((current) => Math.max(current, nextStreak));
      setScore((current) => current + Math.round(100 * multiplier));
      setFeedback({ kind: "correct", text: "Certo! Continue acompanhando." });
    } else {
      setStreak(0);
      setFeedback({
        kind: "info",
        text: "Palavra revelada e guardada para revisão.",
      });
      loseEnergy();
    }
    setShowHelp(false);

    const linePending = activeLine?.gapIndexes.filter(
      (wordIndex) =>
        `${activeLineIndex}-${wordIndex}` !== key && !resolved[`${activeLineIndex}-${wordIndex}`],
    );
    if (waitingForAnswer && (linePending?.length ?? 0) === 0) {
      blockedLineIndexRef.current = null;
      window.setTimeout(() => {
        if (playerRef.current) playerRef.current.playbackRate = 1;
        slowReplayEndRef.current = null;
        setWaitingForAnswer(false);
        setFeedback(null);
        playerRef.current?.play().catch(() => setPlaying(false));
      }, 260);
    }
  };

  const registerWrong = () => {
    setErrors((current) => current + 1);
    setStreak(0);
    setFeedback({
      kind: "wrong",
      text: "Ainda não. A palavra continua escondida — escute o verso outra vez.",
    });
    loseEnergy();
  };

  const handleTyped = (key: string, answer: string, value: string) => {
    if (resolved[key]) return;
    const cleanValue = normalizedAnswer(value);
    const cleanAnswer = normalizedAnswer(answer);
    if (!cleanAnswer.startsWith(cleanValue)) {
      registerWrong();
      return;
    }
    setTyped((current) => ({ ...current, [key]: value }));
    if (cleanValue === cleanAnswer) resolveGap(key, "correct");
  };

  const replayLine = async (slow = false) => {
    const player = playerRef.current;
    if (!player || !activeLine) return;
    setShowHelp(false);
    player.currentTime = Math.max(0, activeLine.start - 0.15);
    previousTimeRef.current = player.currentTime;
    player.playbackRate = slow ? 0.5 : 1;
    slowReplayEndRef.current = slow ? activeLine.end : null;
    setCurrentTime(player.currentTime);
    setManualPause(false);
    setFeedback({
      kind: "info",
      text: slow ? "Verso repetido em velocidade reduzida." : "Ouvindo o verso novamente.",
    });
    setReplays((current) => current + 1);
    if (experienceMode === "challenge" && replays >= 2) loseEnergy();
    keepActiveGapFocused();
    await player.play().catch(() => setPlaying(false));
    keepActiveGapFocused();
  };

  const togglePlay = async () => {
    const player = playerRef.current;
    if (!player) return;
    if (player.paused) {
      setManualPause(false);
      if (waitingForAnswer && activeLine && player.currentTime >= activeLine.end - 0.1) {
        player.currentTime = Math.max(0, activeLine.start - 0.15);
        previousTimeRef.current = player.currentTime;
        setCurrentTime(player.currentTime);
      }
      keepActiveGapFocused();
      await player.play().catch(() => setPlaying(false));
    } else {
      setManualPause(true);
      player.pause();
    }
    keepActiveGapFocused();
  };

  const handleTime = (time: number) => {
    setCurrentTime(time);
    if (slowReplayEndRef.current != null && time >= slowReplayEndRef.current - 0.03) {
      if (playerRef.current) playerRef.current.playbackRate = 1;
      slowReplayEndRef.current = null;
    }
    const previousTime = previousTimeRef.current;
    const blockedLineIndex = blockedLineIndexRef.current;
    if (blockedLineIndex != null) {
      const blockedLine = lines[blockedLineIndex];
      const stillPending = unresolvedGaps(blockedLine, blockedLineIndex, resolved).length > 0;
      if (blockedLine && stillPending) {
        setActiveLineIndex(blockedLineIndex);
        if (time >= blockedLine.end - 0.03) {
          const player = playerRef.current;
          if (player) {
            player.pause();
            player.playbackRate = 1;
            player.currentTime = Math.max(blockedLine.start, blockedLine.end - 0.04);
          }
          slowReplayEndRef.current = null;
          setWaitingForAnswer(true);
        }
        previousTimeRef.current = time;
        return;
      }
      blockedLineIndexRef.current = null;
      setWaitingForAnswer(false);
    }

    const crossedPendingLine = findCrossedPendingLine(lines, previousTime, time, resolved);

    if (crossedPendingLine >= 0) {
      const blockedLine = lines[crossedPendingLine];
      const player = playerRef.current;
      if (player) {
        player.pause();
        player.playbackRate = 1;
        player.currentTime = Math.max(blockedLine.start, blockedLine.end - 0.04);
      }
      previousTimeRef.current = Math.max(blockedLine.start, blockedLine.end - 0.04);
      slowReplayEndRef.current = null;
      manualScrollUntilRef.current = 0;
      blockedLineIndexRef.current = crossedPendingLine;
      setBrowsingLyrics(false);
      setActiveLineIndex(crossedPendingLine);
      setWaitingForAnswer(true);
      setManualPause(false);
      setFeedback({
        kind: "info",
        text: "Complete a palavra para a música continuar.",
      });
      return;
    }

    previousTimeRef.current = time;
    const found = lineAtTime(lines, time);
    if (found >= 0 && found !== activeLineIndex) {
      setActiveLineIndex(found);
      setShowHelp(false);
      setFeedback(null);
    }
  };

  const options =
    activeAnswer && answerMode === "select"
      ? buildOptions(activeAnswer, lines, activeLineIndex + activeGapIndex)
      : [];
  const accuracy = gaps.length > 0 ? Math.round((correctCount / gaps.length) * 100) : 100;
  const firstLetter = activeAnswer.slice(0, 1);

  return (
    <div
      className={`lyrics-course ${stage === "game" ? "game-active" : ""} ${keyboardOpen ? "keyboard-active" : ""}`}
      style={
        {
          "--visual-viewport-height": visualViewportHeight ? `${visualViewportHeight}px` : "100dvh",
          "--visual-viewport-top": `${visualViewportTop}px`,
        } as CSSProperties
      }
    >
      <audio
        ref={playerRef}
        src={audio.url}
        preload="metadata"
        onLoadStart={() => setLoadingAudio(true)}
        onCanPlay={() => setLoadingAudio(false)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || audio.duration)}
        onTimeUpdate={(event) => handleTime(event.currentTarget.currentTime)}
        onPlay={() => {
          setPlaying(true);
          setLoadingAudio(false);
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoadingAudio(true)}
        onPlaying={() => setLoadingAudio(false)}
        onEnded={finishGame}
      />

      <section className="lyrics-song-head">
        {track.imageUrl ? (
          <img src={track.imageUrl} alt={`Capa de ${track.album}`} />
        ) : (
          <span aria-hidden="true">♫</span>
        )}
        <div>
          <small>APRENDER OUVINDO A MÚSICA REAL</small>
          <h1>{track.name}</h1>
          <p>{track.artist}</p>
        </div>
        {stage === "game" && (
          <button className="lyrics-exit" onClick={leaveGame}>
            Sair
          </button>
        )}
      </section>

      {stage === "setup" && (
        <section className="game-setup">
          <header>
            <small>PREPARE A ATIVIDADE</small>
            <h2>Como você quer completar esta música?</h2>
            <p>
              A música toca sem interrupção. Se um verso terminar com uma palavra pendente, ela para
              exatamente ali até você resolver.
            </p>
            <div className="vocabulary-plan-note">
              <strong>
                Rodada {vocabularyPlan.round + 1} de {vocabularyPlan.rounds}
              </strong>
              <span>
                {vocabularyPlan.vocabulary.length} palavras úteis encontradas na música. Artigos e
                preposições como “the” e “in” não entram nas lacunas de vocabulário.
              </span>
            </div>
          </header>

          {resumeSession && (
            <aside className="resume-session-card">
              <div>
                <small>{"SESS\u00c3O SALVA NESTE APARELHO"}</small>
                <strong>Continue exatamente de onde parou</strong>
                <span>
                  {formatTime(resumeSession.currentTime)} •{" "}
                  {Object.keys(resumeSession.resolved).length} palavras concluídas •{" "}
                  {difficultyConfig[resumeSession.difficulty].label}
                </span>
              </div>
              <button onClick={continueGame}>▶ Continuar de onde parei</button>
            </aside>
          )}

          <div className="setup-block">
            <strong>1. Escolha o nível</strong>
            <div className="difficulty-grid">
              {(Object.keys(difficultyConfig) as Difficulty[]).map((value) => {
                const previewLines = buildLines(
                  phrases,
                  audio,
                  value,
                  seed,
                  answerMode === "karaoke" ? "write" : answerMode,
                );
                const count = allGaps(previewLines).length;
                return (
                  <button
                    className={difficulty === value ? "selected" : ""}
                    key={value}
                    onClick={() => setDifficulty(value)}
                  >
                    <span>
                      <b>{difficultyConfig[value].label}</b>
                      <em>{count}</em>
                    </span>
                    <small>{difficultyConfig[value].detail}</small>
                    <strong>{count} palavras úteis nesta rodada</strong>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="setup-block">
            <strong>2. Escolha como responder</strong>
            <div className="answer-mode-grid">
              {[
                ["write", "⌨", "Escrever", "Digite direto dentro da lacuna"],
                ["select", "◉", "Selecionar", "Escolha entre quatro palavras"],
                ["karaoke", "♫", "Karaokê", "Letra completa, sem lacunas"],
              ].map(([value, icon, label, detail]) => (
                <button
                  className={answerMode === value ? "selected" : ""}
                  key={value}
                  onClick={() => setAnswerMode(value as AnswerMode)}
                >
                  <i>{icon}</i>
                  <span>
                    <b>{label}</b>
                    <small>{detail}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="setup-block">
            <strong>3. Escolha o ritmo</strong>
            <div className="experience-switch">
              <button
                className={experienceMode === "practice" ? "selected" : ""}
                onClick={() => setExperienceMode("practice")}
              >
                <b>Prática</b>
                <small>Sem vidas e sem pressão</small>
              </button>
              <button
                className={experienceMode === "challenge" ? "selected" : ""}
                onClick={() => setExperienceMode("challenge")}
              >
                <b>Desafio</b>
                <small>5 vidas, sequência e pontuação</small>
              </button>
            </div>
          </div>

          <button className="game-start-button" onClick={beginGame}>
            ▶ {resumeSession ? "Começar nova sessão" : "Começar com a música"}
            <small>
              {answerMode === "karaoke"
                ? "Letra completa sincronizada"
                : `${gaps.length} lacunas • ${difficultyConfig[difficulty].label}`}
            </small>
          </button>
        </section>
      )}

      {stage === "game" && (
        <section className={`lyrics-game ${keyboardOpen ? "keyboard-open" : ""}`}>
          <div className="game-statusbar">
            <span>
              <small>{difficultyConfig[difficulty].label}</small>
              <strong>
                {answerMode === "write"
                  ? "Modo escrever"
                  : answerMode === "select"
                    ? "Modo seleção"
                    : "Modo karaokê"}
              </strong>
            </span>
            <span>
              <small>Progresso</small>
              <strong>
                {completedCount}/{gaps.length || "—"}
              </strong>
            </span>
            {experienceMode === "challenge" ? (
              <span>
                <small>Energia</small>
                <strong className="energy">
                  {"♥".repeat(energy)}
                  {"♡".repeat(5 - energy)}
                </strong>
              </span>
            ) : (
              <span>
                <small>Acertos</small>
                <strong>{correctCount}</strong>
              </span>
            )}
            <span>
              <small>Pontos</small>
              <strong>{score}</strong>
            </span>
          </div>

          <div className="music-progress" aria-label="Progresso da música">
            <i style={{ width: `${Math.min(100, progress)}%` }} />
          </div>

          <div
            className={`lyrics-live-stage ${waitingForAnswer ? "waiting" : ""}`}
            ref={lyricStageRef}
            onTouchStart={noteManualLyricsBrowse}
            onWheel={noteManualLyricsBrowse}
          >
            <div className="lyrics-motion-list">
              <div
                className={`instrumental-intro motion-line ${activeLineIndex < 0 ? "active" : "past"}`}
              >
                <span>♫</span>
                <strong>A música está começando</strong>
                <small>A primeira linha aparecerá no tempo certo.</small>
              </div>
              {lines.map((line, lineIndex) => {
                const isActive = lineIndex === activeLineIndex;
                return (
                  <div
                    className={`motion-line ${isActive ? "active" : lineIndex < activeLineIndex ? "past" : "future"}`}
                    data-lyric-line={lineIndex}
                    aria-hidden={lineIndex > activeLineIndex}
                    key={line.id}
                  >
                    <p
                      className={isActive ? "active-game-line" : "neighbor-line lyric-line-words"}
                      aria-live={isActive ? "polite" : undefined}
                    >
                      {line.words.map((word, wordIndex) => {
                        const key = `${lineIndex}-${wordIndex}`;
                        const isGap = line.gapIndexes.includes(wordIndex);
                        const status = resolved[key];
                        const parts = wordParts(word);
                        if (!isGap) {
                          return <span key={key}>{word}</span>;
                        }

                        if (answerMode === "write") {
                          const isInteractive = isActive && !status && key === activeGapKey;
                          return (
                            <span
                              className={`inline-gap ${isInteractive ? "active" : ""} ${status ?? ""}`}
                              key={key}
                            >
                              {parts.before}
                              <input
                                data-gap-key={key}
                                aria-label={
                                  isInteractive
                                    ? `Palavra ausente com ${parts.clean.length} letras`
                                    : undefined
                                }
                                aria-hidden={!isActive}
                                autoCapitalize="none"
                                autoComplete="off"
                                inputMode="text"
                                maxLength={parts.clean.length}
                                size={Math.max(3, parts.clean.length + 1)}
                                spellCheck={false}
                                tabIndex={isInteractive ? 0 : -1}
                                value={isActive && !status ? (typed[key] ?? "") : parts.clean}
                                onChange={(event) =>
                                  handleTyped(key, parts.clean, event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Backspace" && !(typed[key] ?? "")) {
                                    event.preventDefault();
                                    void replayLine(false);
                                  }
                                }}
                              />
                              {parts.after}
                            </span>
                          );
                        }

                        if (!isActive || status) {
                          return (
                            <span className={status ? `filled-gap ${status}` : ""} key={key}>
                              {word}
                            </span>
                          );
                        }
                        return (
                          <button
                            className={`tap-gap ${key === activeGapKey ? "active" : ""}`}
                            disabled={key !== activeGapKey}
                            key={key}
                            onClick={() => setShowHelp(false)}
                          >
                            {"•".repeat(Math.max(2, parts.clean.length))}
                          </button>
                        );
                      })}
                    </p>

                    <p className={`line-translation ${isActive ? "active" : ""}`} lang="pt-BR">
                      {translationFor(line.text) ??
                        (translationLoading
                          ? "Traduzindo…"
                          : translationError
                            ? "Tradução indisponível agora."
                            : "Tradução indisponível agora.")}
                    </p>
                    {isActive && !line.practice && (
                      <small className="listen-only-label">
                        Introdução falada · apenas escute e acompanhe
                      </small>
                    )}
                    {isActive && feedback && (
                      <p className={`inline-feedback ${feedback.kind}`}>{feedback.text}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {answerMode === "select" && activeGapKey && (
            <div className="game-options" aria-label="Alternativas">
              {options.map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    if (normalizedAnswer(option) === normalizedAnswer(activeAnswer)) {
                      resolveGap(activeGapKey, "correct");
                    } else {
                      registerWrong();
                    }
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          <div className="game-controls-dock">
            {answerMode === "write" && (
              <input
                ref={keyboardAnchorRef}
                className="keyboard-focus-anchor"
                data-gap-key="keyboard-anchor"
                aria-hidden="true"
                autoCapitalize="none"
                autoComplete="off"
                inputMode="text"
                tabIndex={-1}
                onInput={(event) => {
                  event.currentTarget.value = "";
                }}
              />
            )}
            {showHelp && activeGapKey && (
              <div className="help-drawer">
                <div>
                  <strong>Não consegui</strong>
                  <button
                    type="button"
                    onPointerDown={preserveKeyboardPointer}
                    onClick={() => runKeepingKeyboard(() => setShowHelp(false))}
                    aria-label="Fechar ajuda"
                  >
                    ×
                  </button>
                </div>
                <button
                  type="button"
                  onPointerDown={preserveKeyboardPointer}
                  onClick={() => void replayLine(false)}
                >
                  ↻ Ouvir novamente
                </button>
                <button
                  type="button"
                  onPointerDown={preserveKeyboardPointer}
                  onClick={() => void replayLine(true)}
                >
                  ◴ Ouvir mais devagar
                </button>
                <button
                  type="button"
                  onPointerDown={preserveKeyboardPointer}
                  onClick={() =>
                    runKeepingKeyboard(() => {
                      setShowHelp(false);
                      setHinted((current) => ({ ...current, [activeGapKey]: true }));
                      setFeedback({
                        kind: "info",
                        text: `A palavra começa com “${firstLetter}”.`,
                      });
                    })
                  }
                >
                  A̲ Mostrar a primeira letra
                </button>
                <button
                  type="button"
                  onPointerDown={preserveKeyboardPointer}
                  onClick={() =>
                    runKeepingKeyboard(() => {
                      setShowHelp(false);
                      setFeedback({
                        kind: "info",
                        text: `Significado no verso: ${translationFor(activeLine?.text ?? "") ?? "a tradução ainda está carregando."}`,
                      });
                    })
                  }
                >
                  文 Mostrar o significado
                </button>
                <button
                  className="reveal-answer"
                  type="button"
                  onPointerDown={preserveKeyboardPointer}
                  onClick={() =>
                    runKeepingKeyboard(() => resolveGap(activeGapKey, "revealed"), true)
                  }
                >
                  ✦ Revelar a palavra e continuar
                </button>
                {hinted[activeGapKey] && <small>Primeira letra já mostrada nesta tentativa.</small>}
              </div>
            )}

            <div className="thumb-controls">
              <button
                type="button"
                onPointerDown={preserveKeyboardPointer}
                onClick={() => void replayLine(false)}
                disabled={!activeLine}
              >
                <span>↻</span>
                Ouvir verso novamente
              </button>
              <button
                type="button"
                onPointerDown={preserveKeyboardPointer}
                onClick={() => runKeepingKeyboard(() => setShowHelp((current) => !current))}
                disabled={!activeGapKey}
              >
                <span>?</span>
                Não consegui
              </button>
              <button
                type="button"
                onPointerDown={preserveKeyboardPointer}
                onClick={() => runKeepingKeyboard(() => scrollToActiveLine("smooth"))}
                disabled={!activeLine}
              >
                <span>⌖</span>
                {browsingLyrics ? "Voltar ao verso atual" : "Verso atual"}
              </button>
            </div>

            <div className="main-player">
              <button
                className="skip-back"
                type="button"
                onPointerDown={preserveKeyboardPointer}
                onClick={() =>
                  runKeepingKeyboard(() => {
                    const player = playerRef.current;
                    if (!player) return;
                    player.currentTime = Math.max(0, player.currentTime - 5);
                  })
                }
                aria-label="Voltar cinco segundos"
              >
                −5
              </button>
              <button
                className="play-toggle"
                type="button"
                onPointerDown={preserveKeyboardPointer}
                onClick={() => void togglePlay()}
                aria-label={playing ? "Pausar música" : "Continuar música"}
              >
                {playing ? "Ⅱ" : "▶"}
              </button>
              <div>
                <input
                  aria-label="Posição da música"
                  type="range"
                  min={0}
                  max={duration || audio.duration}
                  step={0.1}
                  value={Math.min(currentTime, duration || audio.duration)}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (playerRef.current) playerRef.current.currentTime = next;
                    previousTimeRef.current = next;
                    setCurrentTime(next);
                    blockedLineIndexRef.current = null;
                    setWaitingForAnswer(false);
                  }}
                />
                <span>
                  <small>{formatTime(currentTime)}</small>
                  <small>
                    {waitingForAnswer
                      ? "Esperando resposta"
                      : loadingAudio
                        ? "Carregando"
                        : manualPause
                          ? "Pausado por você"
                          : playing
                            ? "Tocando"
                            : formatTime(duration || audio.duration)}
                  </small>
                </span>
              </div>
              <button
                className="finish-button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={finishGame}
                aria-label="Encerrar atividade"
              >
                ✓
              </button>
            </div>
          </div>

          {energy === 0 && experienceMode === "challenge" && (
            <aside className="energy-ended">
              <strong>Fim da tentativa</strong>
              <p>Seu aprendizado foi preservado. Continue sem vidas ou tente novamente.</p>
              <button
                onClick={() => {
                  setExperienceMode("practice");
                  setEnergy(5);
                }}
              >
                Continuar no modo prática
              </button>
            </aside>
          )}
        </section>
      )}

      {stage === "result" && (
        <section className="game-result">
          <span className="result-burst">✓</span>
          <small>MÚSICA CONCLUÍDA</small>
          <h2>
            {accuracy >= 90 ? "Você dominou esta tentativa!" : "Cada verso ficou mais claro."}
          </h2>
          <p>
            Você concluiu a rodada {vocabularyPlan.round + 1} de {vocabularyPlan.rounds} e praticou
            a música real até <strong>{formatTime(currentTime)}</strong>.
          </p>
          <div className="result-metrics">
            <span>
              <strong>{accuracy}%</strong>
              <small>acertos sem ajuda</small>
            </span>
            <span>
              <strong>{correctCount}</strong>
              <small>palavras corretas</small>
            </span>
            <span>
              <strong>{errors}</strong>
              <small>erros</small>
            </span>
            <span>
              <strong>{revealedCount}</strong>
              <small>reveladas</small>
            </span>
            <span>
              <strong>{replays}</strong>
              <small>versos repetidos</small>
            </span>
            <span>
              <strong>{bestStreak}</strong>
              <small>maior sequência</small>
            </span>
          </div>
          <div className="result-actions">
            <button
              className="primary"
              onClick={() => {
                resetAttempt(seed);
                setStage("game");
                requestAnimationFrame(() =>
                  playerRef.current?.play().catch(() => setPlaying(false)),
                );
              }}
            >
              Tentar novamente
            </button>
            <button
              onClick={() => {
                resetAttempt(seed + 1);
                setStage("setup");
              }}
            >
              {vocabularyPlan.round + 1 < vocabularyPlan.rounds
                ? "Próxima rodada de palavras"
                : "Recomeçar ciclo de vocabulário"}
            </button>
            <button
              onClick={() => {
                setAnswerMode("karaoke");
                resetAttempt(seed);
                setStage("game");
                requestAnimationFrame(() =>
                  playerRef.current?.play().catch(() => setPlaying(false)),
                );
              }}
            >
              Ouvir no modo karaokê
            </button>
            <button onClick={() => setStage("setup")}>Voltar às opções</button>
          </div>
        </section>
      )}
    </div>
  );
}
