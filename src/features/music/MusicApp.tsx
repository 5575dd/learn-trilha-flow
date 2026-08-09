"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  beginSpotifyLogin,
  completeSpotifyLogin,
  disconnectSpotify,
  fetchLearningPlaylist,
  fetchTrackLyrics,
  hasSpotifySession,
  type SpotifyTrack,
} from "./spotify";
import {
  getLocalAudio,
  listLocalAudio,
  saveLocalAudio,
  saveLocalAudioLyrics,
  type LocalAudioMeta,
} from "./local-audio";
import { LyricsGameCourse } from "./LyricsGameCourse";
import {
  alignAudioToLyrics,
  countReliableLearningWords,
  type AlignedWordTiming,
  type AlignmentProgress,
} from "./audio-alignment";

const CURRENT_LYRICS_VERSION = 20;
const CURRENT_ALIGNMENT_VERSION = 4;

type View =
  | "home"
  | "library"
  | "song"
  | "listen"
  | "lesson"
  | "practice"
  | "result"
  | "spotify-course";
type Mode = "commute" | "home";
type SongStatus = "ready" | "waiting";

type Song = {
  id: string;
  title: string;
  artist: string;
  album: string;
  level: string;
  minutes: number;
  progress: number;
  status: SongStatus;
  theme: string;
  focus: string[];
  cover: string;
  licensed: boolean;
};

type LyricLine = {
  start: number;
  end: number;
  text: string;
  translation: string;
  verse: number;
};

type LessonPart = {
  line: string;
  translation: string;
  explanation: string;
  vocabulary: { word: string; meaning: string }[];
  start: number;
  end: number;
};

type Question = {
  type: "Complete a letra" | "Reconheça a palavra" | "Entenda o sentido";
  prompt: string;
  translation: string;
  hint: string;
  options: string[];
  answer: string;
  explanation: string;
  audioStart?: number;
  audioEnd?: number;
};

type CoursePhrase = {
  start: number;
  text: string;
  section?: string;
  words?: AlignedWordTiming[];
};

type CourseAudio = {
  url: string;
  duration: number;
  fileName: string;
  syncRatio: number;
  syncLead: number;
};

type CoursePracticeQuestion = {
  kind: "recognize" | "write" | "order";
  label: string;
  instruction: string;
  prompt: string;
  answer: string;
  options: string[];
  chunks: string[];
  start: number;
  end: number;
  hint: string;
};

type LessonInsight = {
  translation: string;
  explanation: string;
  keywords: string[];
  expression?: string;
};

type ReviewItem = {
  questionIndex: number;
  kind: CoursePracticeQuestion["kind"];
  prompt: string;
  answer: string;
};

type AudioImportResult = {
  imported: number;
  unmatched: string[];
  failures: string[];
};

const audioSources = {
  mp3: "https://upload.wikimedia.org/wikipedia/commons/transcoded/2/21/Amazing_Grace_US_Marine_Band.ogg/Amazing_Grace_US_Marine_Band.ogg.mp3",
  ogg: "https://upload.wikimedia.org/wikipedia/commons/2/21/Amazing_Grace_US_Marine_Band.ogg",
};

const songs: Song[] = [
  {
    id: "amazing-grace",
    title: "Amazing Grace",
    artist: "U.S. Marine Band • Sara Sheffield",
    album: "Gravação em domínio público",
    level: "Iniciante",
    minutes: 10,
    progress: 24,
    status: "ready",
    theme: "Mudança, esperança e gratidão",
    focus: ["passado", "contraste", "pronúncia", "listening"],
    cover: "cover-purple",
    licensed: true,
  },
  {
    id: "count-on-me",
    title: "Count on Me",
    artist: "Bruno Mars",
    album: "Aguardando fonte licenciada",
    level: "Iniciante",
    minutes: 12,
    progress: 0,
    status: "waiting",
    theme: "Apoio e amizade",
    focus: ["amizade", "phrasal verbs", "pronúncia"],
    cover: "cover-orange",
    licensed: false,
  },
  {
    id: "perfect",
    title: "Perfect",
    artist: "Ed Sheeran",
    album: "Aguardando fonte licenciada",
    level: "Intermediário",
    minutes: 14,
    progress: 0,
    status: "waiting",
    theme: "Memórias e sentimentos",
    focus: ["passado", "descrições", "listening"],
    cover: "cover-blue",
    licensed: false,
  },
];

const lyrics: LyricLine[] = [
  {
    start: 29.46,
    end: 39.439,
    text: "Amazing grace, how sweet the sound",
    translation: "Graça maravilhosa, que doce é o som",
    verse: 1,
  },
  {
    start: 39.54,
    end: 50.405,
    text: "That saved a wretch like me",
    translation: "Que salvou uma pessoa perdida como eu",
    verse: 1,
  },
  {
    start: 50.413,
    end: 60.928,
    text: "I once was lost, but now am found",
    translation: "Eu antes estava perdido, mas agora fui encontrado",
    verse: 1,
  },
  {
    start: 61.536,
    end: 71.52,
    text: "Was blind, but now I see",
    translation: "Era cego, mas agora eu vejo",
    verse: 1,
  },
  {
    start: 94.225,
    end: 103.252,
    text: "T'was grace that taught my heart to fear",
    translation: "Foi a graça que ensinou meu coração a temer",
    verse: 2,
  },
  {
    start: 103.308,
    end: 112.022,
    text: "And grace my fears relieved",
    translation: "E a graça aliviou os meus medos",
    verse: 2,
  },
  {
    start: 112.237,
    end: 121.728,
    text: "How precious did that grace appear",
    translation: "Quão preciosa aquela graça pareceu",
    verse: 2,
  },
  {
    start: 121.829,
    end: 132.963,
    text: "The hour I first believed",
    translation: "Na hora em que acreditei pela primeira vez",
    verse: 2,
  },
  {
    start: 151.503,
    end: 160.867,
    text: "Through many dangers, toils and snares",
    translation: "Através de muitos perigos, dificuldades e armadilhas",
    verse: 3,
  },
  {
    start: 160.867,
    end: 173.384,
    text: "I have already come",
    translation: "Eu já cheguei até aqui",
    verse: 3,
  },
  {
    start: 173.715,
    end: 184.066,
    text: "T'is grace that brought me safe thus far",
    translation: "Foi a graça que me trouxe em segurança até aqui",
    verse: 3,
  },
  {
    start: 184.199,
    end: 196.295,
    text: "And grace will lead me home",
    translation: "E a graça vai me conduzir para casa",
    verse: 3,
  },
  {
    start: 200.018,
    end: 219.865,
    text: "And grace will lead me home",
    translation: "E a graça vai me conduzir para casa",
    verse: 3,
  },
];

const lessonParts: LessonPart[] = [
  {
    line: "Amazing grace, how sweet the sound",
    translation: "Graça maravilhosa, que doce é o som",
    explanation:
      "Em inglês, o adjetivo normalmente vem antes do substantivo. Por isso “amazing” aparece antes de “grace”.",
    vocabulary: [
      { word: "amazing", meaning: "incrível, maravilhosa" },
      { word: "grace", meaning: "graça" },
    ],
    start: 29.46,
    end: 39.439,
  },
  {
    line: "That saved a wretch like me",
    translation: "Que salvou uma pessoa perdida como eu",
    explanation:
      "“Wretch” é uma palavra antiga e forte. Na música, descreve alguém que se sentia perdido e foi transformado.",
    vocabulary: [
      { word: "saved", meaning: "salvou" },
      { word: "wretch", meaning: "pessoa infeliz ou perdida" },
    ],
    start: 39.54,
    end: 50.405,
  },
  {
    line: "I once was lost, but now am found",
    translation: "Eu antes estava perdido, mas agora fui encontrado",
    explanation:
      "A frase contrasta passado e presente. “Once” indica uma situação anterior; “but now” mostra a mudança.",
    vocabulary: [
      { word: "once", meaning: "antes, certa vez" },
      { word: "lost", meaning: "perdido" },
      { word: "found", meaning: "encontrado" },
    ],
    start: 50.413,
    end: 60.928,
  },
  {
    line: "Was blind, but now I see",
    translation: "Era cego, mas agora eu vejo",
    explanation:
      "Além do sentido literal, “see” pode significar compreender. A ideia é sair da confusão e passar a entender.",
    vocabulary: [
      { word: "blind", meaning: "cego" },
      { word: "see", meaning: "ver, compreender" },
    ],
    start: 61.536,
    end: 71.52,
  },
];

const questions: Question[] = [
  {
    type: "Complete a letra",
    prompt: "Ouça e complete: “Amazing grace, how ___ the sound”.",
    translation: "Listen and complete: “Amazing grace, how ___ the sound”.",
    hint: "A palavra significa “doce” e descreve um som agradável.",
    options: ["sweet", "soft", "clear"],
    answer: "sweet",
    explanation: "Isso! A frase completa é “Amazing grace, how sweet the sound”.",
    audioStart: 29.46,
    audioEnd: 39.439,
  },
  {
    type: "Reconheça a palavra",
    prompt: "Ouça e identifique a palavra final: “I once was lost, but now am ___”.",
    translation: "Listen and identify the final word: “I once was lost, but now am ___”.",
    hint: "Ela contrasta com “lost” e começa com o som de F.",
    options: ["found", "fine", "free"],
    answer: "found",
    explanation: "Certo! “Lost” e “found” criam o contraste central da frase.",
    audioStart: 50.413,
    audioEnd: 60.928,
  },
  {
    type: "Entenda o sentido",
    prompt: "O que “I once was lost, but now am found” comunica?",
    translation: "What does “I once was lost, but now am found” communicate?",
    hint: "Observe o contraste entre “antes” e “agora”.",
    options: [
      "Uma transformação: antes perdido, agora encontrado",
      "Uma pessoa procurando um objeto",
      "Alguém que continua perdido",
    ],
    answer: "Uma transformação: antes perdido, agora encontrado",
    explanation: "Perfeito. A frase usa passado e presente para mostrar uma mudança completa.",
  },
];

function parseSyncedLyrics(raw: string, wordTimings: AlignedWordTiming[] = []): CoursePhrase[] {
  const cleanLyricText = (text: string) =>
    text
      .replace(/\bUrself\b/gi, "yourself")
      .replace(/\bUr\b/gi, "your")
      .replace(/\bU\b/g, "you")
      .replace(/([,;:!?])(?=[A-Za-zÀ-ÿ])/g, "$1 ")
      .replace(/dream until yourself dreams? come true\.?/i, "Dream until your dreams come true.")
      .replace(/\s+/g, " ")
      .trim();

  let section = "";
  let phraseIndex = 0;
  const parsed: CoursePhrase[] = [];
  raw.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.+)$/);
    if (!match) return;
    const text = cleanLyricText(match[3]);
    const sectionMatch = text.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      return;
    }
    if (!text) return;
    parsed.push({
      start: Number(match[1]) * 60 + Number(match[2]),
      text,
      section,
      words: wordTimings.filter((word) => word.lineIndex === phraseIndex),
    });
    phraseIndex += 1;
  });
  return parsed;
}

function groupCoursePhrases(lines: CoursePhrase[]) {
  const grouped: CoursePhrase[] = [];
  let current: CoursePhrase | null = null;

  for (const line of lines) {
    const words = line.text.split(/\s+/).filter(Boolean);
    if (!current) {
      current = { ...line };
      continue;
    }

    const currentWords = current.text.split(/\s+/).filter(Boolean);
    const completesThought = /[.!?]$/.test(current.text);
    const isLongEnough = currentWords.length >= 7;
    const wouldBeTooLong = currentWords.length + words.length > 15;

    if (completesThought || isLongEnough || wouldBeTooLong) {
      grouped.push(current);
      current = { ...line };
    } else {
      current.text = `${current.text} ${line.text}`;
    }
  }

  if (current) grouped.push(current);
  return grouped.filter((line) => line.text.split(/\s+/).length >= 4);
}

const lessonInsights: Array<{
  matches: string[];
  insight: LessonInsight;
}> = [
  {
    matches: ["mirror"],
    insight: {
      translation: "Toda vez que eu me olho no espelho.",
      explanation:
        "“Look in the mirror” significa olhar para o próprio reflexo. Aqui, o narrador observa a passagem do tempo em si mesmo.",
      keywords: ["olho", "espelho", "reflexo"],
    },
  },
  {
    matches: ["lines", "face"],
    insight: {
      translation: "As marcas no meu rosto ficam mais evidentes.",
      explanation:
        "“Lines on my face” são as linhas e marcas que aparecem com a idade. A frase não está falando de linhas desenhadas.",
      keywords: ["marcas", "rosto", "idade", "linhas"],
    },
  },
  {
    matches: ["past", "gone"],
    insight: {
      translation: "O passado já se foi.",
      explanation:
        "“Gone” reforça que o passado terminou e não pode ser recuperado. É uma ideia de passagem do tempo, não de movimento físico.",
      keywords: ["passado", "foi", "acabou", "tempo"],
    },
  },
  {
    matches: ["dusk", "dawn"],
    insight: {
      translation: "Do anoitecer até o amanhecer.",
      explanation:
        "“Dusk” é o começo da noite; “dawn” é o amanhecer. Juntas, as palavras indicam um ciclo completo.",
      keywords: ["anoitecer", "amanhecer", "noite", "dia"],
    },
  },
  {
    matches: ["dues"],
    insight: {
      translation: "Todo mundo tem um preço ou uma obrigação a cumprir na vida.",
      explanation:
        "“Pay your dues” é uma expressão: enfrentar esforço, dificuldades ou consequências para conquistar algo. Não se limita a pagar uma conta.",
      keywords: ["preço", "obrigação", "dificuldade", "consequência", "esforço"],
      expression: "pay your dues",
    },
  },
  {
    matches: ["books", "pages"],
    insight: {
      translation: "Parte da minha vida foi registrada em páginas escritas.",
      explanation:
        "A imagem de livros e páginas representa experiências e lembranças acumuladas, não apenas livros físicos.",
      keywords: ["vida", "páginas", "experiências", "lembranças"],
    },
  },
  {
    matches: ["fools", "sages"],
    insight: {
      translation: "Você aprende tanto com os tolos quanto com os sábios.",
      explanation:
        "O contraste entre “fools” e “sages” mostra que lições podem vir de pessoas consideradas erradas ou sábias.",
      keywords: ["aprender", "tolos", "sábios", "lições"],
    },
  },
  {
    matches: ["laughter", "tear"],
    insight: {
      translation: "Cante pelos momentos de riso e também pelos de lágrima.",
      explanation:
        "A frase coloca alegria e tristeza lado a lado para representar a experiência completa da vida.",
      keywords: ["riso", "lágrima", "alegria", "tristeza"],
    },
  },
  {
    matches: ["dream", "true"],
    insight: {
      translation: "Continue sonhando até que seus sonhos se tornem realidade.",
      explanation:
        "“Dream on” aqui funciona como incentivo para persistir. Não é apenas o ato literal de sonhar enquanto dorme.",
      keywords: ["sonhar", "sonhos", "realidade", "persistir", "continuar"],
      expression: "dream on",
    },
  },
  {
    matches: ["sing", "year"],
    insight: {
      translation: "Cante comigo e viva intensamente este momento.",
      explanation:
        "A repetição de “sing” transforma a frase em um convite coletivo e reforça a urgência de aproveitar o tempo.",
      keywords: ["cantar", "comigo", "momento", "tempo"],
    },
  },
];

function insightForPhrase(text: string): LessonInsight {
  const clean = normalized(text);
  const found = lessonInsights.find(({ matches }) =>
    matches.every((word) => clean.split(" ").includes(word)),
  );
  if (found) return found.insight;
  return {
    translation:
      "A ideia completa deste trecho será ampliada quando o pacote inteligente desta música for preparado.",
    explanation:
      "Nesta prova, concentre-se nas palavras que reconhece e na relação entre elas. O feedback completo será gerado uma única vez e salvo no aparelho.",
    keywords: [],
  };
}

function evaluateMeaning(attempt: string, insight: LessonInsight) {
  const cleanAttempt = normalized(attempt);
  if (!cleanAttempt || cleanAttempt === "nao sei") {
    return {
      status: "review" as const,
      title: "Tudo bem — agora vamos construir o sentido",
      message: "Leia o significado e depois escute o trecho novamente.",
    };
  }
  const matches = insight.keywords.filter((keyword) =>
    cleanAttempt.includes(normalized(keyword)),
  ).length;
  if (insight.keywords.length === 0) {
    return {
      status: "partial" as const,
      title: "Sua interpretação foi registrada",
      message: "Compare sua ideia com o apoio disponível e escute novamente antes de avançar.",
    };
  }
  if (matches >= Math.min(2, insight.keywords.length)) {
    return {
      status: "good" as const,
      title: "Você captou a ideia principal",
      message:
        "Sua resposta encontrou os elementos centrais. Veja abaixo a nuance que a música acrescenta.",
    };
  }
  if (matches === 1) {
    return {
      status: "partial" as const,
      title: "Você chegou perto",
      message: "Você reconheceu parte do sentido, mas uma nuance importante ainda ficou de fora.",
    };
  }
  return {
    status: "review" as const,
    title: "A frase quer dizer algo diferente",
    message:
      "Não é um problema: letras usam imagens e expressões que não funcionam em tradução palavra por palavra.",
  };
}

function wordKind(word: string) {
  const clean = normalized(word);
  const verbs = new Set([
    "be",
    "come",
    "do",
    "dream",
    "go",
    "have",
    "know",
    "learn",
    "look",
    "lose",
    "make",
    "pay",
    "sing",
    "take",
    "win",
  ]);
  const connectors = new Set([
    "and",
    "but",
    "for",
    "from",
    "if",
    "in",
    "of",
    "on",
    "the",
    "to",
    "when",
    "with",
  ]);
  if (verbs.has(clean) || clean.endsWith("ing") || clean.endsWith("ed")) return "verb";
  if (connectors.has(clean)) return "connector";
  if (clean.endsWith("ly")) return "adverb";
  if (clean.endsWith("ous") || clean.endsWith("ful") || clean.endsWith("ive")) {
    return "adjective";
  }
  return "noun";
}

function buildDistractors(answer: string, pool: string[], phraseText: string) {
  const answerKind = wordKind(answer);
  const phraseWords = new Set(normalized(phraseText).split(" ").filter(Boolean));
  const banks: Record<string, string[]> = {
    verb: ["see", "watch", "find", "feel", "remember", "follow"],
    connector: ["before", "after", "because", "while", "through", "without"],
    adverb: ["slowly", "clearly", "nearly", "always", "never", "away"],
    adjective: ["young", "clear", "real", "different", "strong", "quiet"],
    noun: ["story", "voice", "road", "heart", "night", "memory"],
  };
  return Array.from(
    new Set([
      ...pool.filter(
        (word) =>
          wordKind(word) === answerKind &&
          normalized(word) !== normalized(answer) &&
          !phraseWords.has(normalized(word)),
      ),
      ...(banks[answerKind] ?? banks.noun),
    ]),
  ).slice(0, 3);
}

function phraseChunks(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  const size = words.length >= 10 ? 3 : 2;
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += size) {
    chunks.push(words.slice(index, index + size).join(" "));
  }
  return chunks;
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.(mp3|m4a|mp4|wav|ogg|aac|flac)$/i, "")
    .replace(/\b(official|audio|video|lyrics?|remaster(?:ed)?|hd)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function similarity(source: string, target: string) {
  const sourceWords = new Set(normalized(source).split(" ").filter(Boolean));
  const targetWords = new Set(normalized(target).split(" ").filter(Boolean));
  if (sourceWords.size === 0 || targetWords.size === 0) return 0;
  let matches = 0;
  sourceWords.forEach((word) => {
    if (targetWords.has(word)) matches += 1;
  });
  return matches / Math.max(sourceWords.size, targetWords.size);
}

function durationFromUrl(url: string, label: string, timeoutMs = 12_000) {
  return new Promise<number>((resolve, reject) => {
    const audio = new Audio();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      audio.removeAttribute("src");
      callback();
    };
    const timeout = window.setTimeout(() => {
      finish(() =>
        reject(new Error(`O arquivo ${label} demorou demais para abrir ou não é compatível.`)),
      );
    }, timeoutMs);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      finish(() => {
        if (Number.isFinite(duration)) resolve(duration);
        else reject(new Error(`Não foi possível ler ${label}.`));
      });
    };
    audio.onerror = () => {
      finish(() => reject(new Error(`O arquivo ${label} não é um áudio compatível.`)));
    };
    audio.src = url;
    audio.load();
  });
}

async function decodedAudioDuration(file: File) {
  const AudioContextClass = window.AudioContext;
  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (!Number.isFinite(buffer.duration)) {
      throw new Error(`Não foi possível ler ${file.name}.`);
    }
    return buffer.duration;
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function audioDuration(file: File) {
  const url = URL.createObjectURL(file);
  try {
    return await durationFromUrl(url, file.name, 9_000);
  } catch {
    return decodedAudioDuration(file);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function findTrackForFile(
  file: File,
  duration: number,
  tracks: SpotifyTrack[],
  unavailable: Set<string>,
) {
  const candidates = tracks
    .filter((track) => track.lyricsStatus === "synced" && !unavailable.has(track.id))
    .map((track) => {
      const durationDifference = Math.abs(duration - track.durationMs / 1000);
      const titleScore = similarity(file.name, track.name);
      const artistScore = similarity(file.name, track.artist);
      const exactTitle = normalized(file.name).includes(normalized(track.name));
      const score =
        (exactTitle ? 1.2 : titleScore) +
        artistScore * 0.35 +
        (durationDifference <= 2.5 ? 1 : durationDifference <= 4.5 ? 0.45 : -2);
      return { track, score, durationDifference };
    })
    .sort((left, right) => right.score - left.score);

  const durationMatches = candidates.filter((candidate) => candidate.durationDifference <= 4.5);
  if (durationMatches.length === 1) return durationMatches[0].track;

  const best = candidates[0];
  if (!best) return null;
  const exactTitle = normalized(file.name).includes(normalized(best.track.name));
  if (exactTitle && best.durationDifference <= 30) return best.track;
  if (best.durationDifference > 6 || best.score < 1.05) return null;
  return best.track;
}

async function fetchLyricsForLocalAudio(track: SpotifyTrack, duration: number, recordingHint = "") {
  // A duração do arquivo identifica a gravação exata (álbum, clipe, remaster
  // ou versão com introdução). Isso impede uma letra rápida, porém errada, de
  // ser aceita apenas porque o título coincide.
  const lyrics = await fetchTrackLyrics(track, duration * 1000, recordingHint);
  const referenceDuration = lyrics.duration ?? duration;
  const durationDifference = Math.abs(duration - referenceDuration);
  return {
    lyrics,
    syncRatio:
      durationDifference > 0.12 && durationDifference <= 9 ? duration / referenceDuration : 1,
    syncLead: 0,
  };
}

const progressStorageKey = "trilha-music-lab-completed-v2";
const spotifyCacheKey = "trilha-spotify-playlist-cache-v1";
const importResultStorageKey = "trilha-local-audio-last-result-v1";

const immersiveViews = new Set<View>(["listen", "lesson", "practice", "result", "spotify-course"]);

export function MusicApp({
  onImmersiveChange,
}: {
  onImmersiveChange?: (immersive: boolean) => void;
}) {
  const [view, setView] = useState<View>("home");
  const [selectedSong, setSelectedSong] = useState(songs[0]);
  const [mode, setMode] = useState<Mode>("commute");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState("Hoje");
  const [completed, setCompleted] = useState<string[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [score, setScore] = useState(0);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotifyTracks, setSpotifyTracks] = useState<SpotifyTrack[]>([]);
  const [playlistName, setPlaylistName] = useState("Inglês — Trilha Música");
  const [playlistUrl, setPlaylistUrl] = useState(
    "https://open.spotify.com/playlist/4Sg6TXWLWHm86YWSyKQJLO",
  );
  const [playlistSnapshot, setPlaylistSnapshot] = useState("");
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [courseTrack, setCourseTrack] = useState<SpotifyTrack | null>(null);
  const [coursePhrases, setCoursePhrases] = useState<CoursePhrase[]>([]);
  const [courseLoading, setCourseLoading] = useState(false);
  const [courseProgress, setCourseProgress] = useState("Preparando a sincronização segura…");
  const [courseError, setCourseError] = useState<string | null>(null);
  const [localAudio, setLocalAudio] = useState<Record<string, LocalAudioMeta>>({});
  const [courseAudio, setCourseAudio] = useState<CourseAudio | null>(null);
  const courseAudioUrl = useRef<string | null>(null);
  const courseOpeningTrack = useRef<string | null>(null);
  const lyricsPreparation = useRef(
    new Map<string, Promise<Awaited<ReturnType<typeof fetchLyricsForLocalAudio>>>>(),
  );

  useEffect(() => {
    onImmersiveChange?.(immersiveViews.has(view));
  }, [onImmersiveChange, view]);

  useEffect(() => () => onImmersiveChange?.(false), [onImmersiveChange]);

  const prepareTrackLyrics = (track: SpotifyTrack, duration: number, recordingHint = "") => {
    const requestKey = `${track.id}:${Math.round(duration)}:${normalized(recordingHint)}`;
    const pending = lyricsPreparation.current.get(requestKey);
    if (pending) return pending;
    const request = fetchLyricsForLocalAudio(track, duration, recordingHint).finally(() => {
      lyricsPreparation.current.delete(requestKey);
    });
    lyricsPreparation.current.set(requestKey, request);
    return request;
  };

  const syncPlaylist = async (
    previousTracks = spotifyTracks,
    previousSnapshot = playlistSnapshot,
  ) => {
    setSyncing(true);
    setSpotifyError(null);
    try {
      const result = await fetchLearningPlaylist({
        tracks: previousTracks,
        snapshotId: previousSnapshot,
      });
      setSpotifyTracks(result.tracks);
      setPlaylistName(result.name);
      setPlaylistUrl(result.spotifyUrl);
      setPlaylistSnapshot(result.snapshotId);
      setSpotifyConnected(true);
      setLastSync("Agora");
      window.localStorage.setItem(
        spotifyCacheKey,
        JSON.stringify({
          tracks: result.tracks,
          name: result.name,
          url: result.spotifyUrl,
          snapshotId: result.snapshotId,
        }),
      );
    } catch (error) {
      setSpotifyError(error instanceof Error ? error.message : "Não foi possível sincronizar.");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const saved = window.localStorage.getItem(progressStorageKey);
    if (saved) {
      try {
        const restored = JSON.parse(saved) as string[];
        window.queueMicrotask(() => setCompleted(restored));
      } catch {
        window.localStorage.removeItem(progressStorageKey);
      }
    }
  }, []);

  useEffect(() => {
    void listLocalAudio()
      .then((records) => {
        const restored = Object.fromEntries(records.map((record) => [record.trackId, record]));
        setLocalAudio(restored);
      })
      .catch(() => {
        setSpotifyError("Não foi possível abrir os áudios guardados neste aparelho.");
      });
  }, []);

  useEffect(
    () => () => {
      if (courseAudioUrl.current) URL.revokeObjectURL(courseAudioUrl.current);
    },
    [],
  );

  useEffect(() => {
    const restoreSpotify = async () => {
      try {
        const cached = window.localStorage.getItem(spotifyCacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as {
            tracks?: SpotifyTrack[];
            name?: string;
            url?: string;
            snapshotId?: string;
          };
          const restoredTracks = parsed.tracks ?? [];
          const restoredSnapshot = parsed.snapshotId ?? "";
          setSpotifyTracks(restoredTracks);
          setPlaylistSnapshot(restoredSnapshot);
          if (parsed.name) setPlaylistName(parsed.name);
          if (parsed.url) setPlaylistUrl(parsed.url);

          if (hasSpotifySession()) {
            setSpotifyConnected(true);
            await syncPlaylist(restoredTracks, restoredSnapshot);
            return;
          }
        }

        const callback = new URLSearchParams(window.location.search).has("spotify_callback");
        if (callback) {
          await completeSpotifyLogin();
          setSpotifyConnected(true);
          await syncPlaylist();
          return;
        }
        const connected = hasSpotifySession();
        setSpotifyConnected(connected);
        if (connected) await syncPlaylist([], "");
      } catch (error) {
        setSpotifyError(
          error instanceof Error ? error.message : "Não foi possível conectar ao Spotify.",
        );
      }
    };

    void restoreSpotify();
    // O retorno do OAuth deve ser tratado somente uma vez ao montar a página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.localStorage.setItem(progressStorageKey, JSON.stringify(completed));
  }, [completed]);

  const totalProgress = useMemo(() => {
    const total = songs.reduce(
      (sum, song) => sum + (completed.includes(song.id) ? 100 : song.progress),
      0,
    );
    return Math.round(total / songs.length);
  }, [completed]);

  const goTo = (nextView: View) => {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openSong = (song: Song) => {
    if (song.status !== "ready") return;
    setSelectedSong(song);
    goTo("song");
  };

  const openSpotifyCourse = async (track: SpotifyTrack) => {
    if (track.lyricsStatus !== "synced" || !localAudio[track.id]) return;
    if (courseOpeningTrack.current === track.id) return;
    courseOpeningTrack.current = track.id;
    setCourseTrack(track);
    setCoursePhrases([]);
    setCourseAudio(null);
    setCourseError(null);
    setCourseLoading(true);
    setCourseProgress("Abrindo o áudio salvo neste aparelho…");
    goTo("spotify-course");
    try {
      const storedAudio = await getLocalAudio(track.id);
      if (!storedAudio) {
        throw new Error("O áudio desta música não está mais disponível no aparelho.");
      }
      if (courseAudioUrl.current) URL.revokeObjectURL(courseAudioUrl.current);
      const url = URL.createObjectURL(storedAudio.blob);
      courseAudioUrl.current = url;
      const measuredDuration = await durationFromUrl(url, storedAudio.fileName, 10_000).catch(
        () => storedAudio.duration,
      );
      const actualDuration = Number.isFinite(measuredDuration)
        ? measuredDuration
        : storedAudio.duration;
      let syncedLyrics = storedAudio.syncedLyrics;
      let wordTimings = storedAudio.wordTimings ?? [];
      if (
        !syncedLyrics ||
        storedAudio.lyricsVersion !== CURRENT_LYRICS_VERSION ||
        storedAudio.alignmentVersion !== CURRENT_ALIGNMENT_VERSION ||
        wordTimings.length === 0 ||
        countReliableLearningWords(wordTimings) < 6
      ) {
        setCourseProgress("Localizando a letra da gravação…");
        const result = await prepareTrackLyrics(track, actualDuration, storedAudio.fileName);
        syncedLyrics = result.lyrics.syncedLyrics ?? undefined;
        if (!syncedLyrics) {
          throw new Error("A sincronização desta letra não está disponível.");
        }
        const alignment = await alignAudioToLyrics(
          storedAudio.blob,
          syncedLyrics,
          (progress: AlignmentProgress) => setCourseProgress(progress.message),
        );
        syncedLyrics = alignment.syncedLyrics;
        wordTimings = alignment.wordTimings;
        await saveLocalAudioLyrics(
          track.id,
          syncedLyrics,
          1,
          0,
          CURRENT_LYRICS_VERSION,
          actualDuration,
          {
            version: CURRENT_ALIGNMENT_VERSION,
            confidence: alignment.confidence,
            wordTimings: alignment.wordTimings,
          },
        );
        setLocalAudio((current) => ({
          ...current,
          [track.id]: {
            ...(current[track.id] ?? storedAudio),
            duration: actualDuration,
            syncedLyrics,
            syncRatio: 1,
            syncLead: 0,
            lyricsVersion: CURRENT_LYRICS_VERSION,
            alignmentVersion: CURRENT_ALIGNMENT_VERSION,
            alignmentConfidence: alignment.confidence,
            wordTimings: alignment.wordTimings,
          },
        }));
      }
      const phrases = parseSyncedLyrics(syncedLyrics, wordTimings);
      if (phrases.length < 3) {
        throw new Error("A letra encontrada ainda não permite montar uma aula segura.");
      }
      setCourseAudio({
        url,
        duration: actualDuration,
        fileName: storedAudio.fileName,
        syncRatio: 1,
        syncLead: 0,
      });
      setCoursePhrases(phrases);
      setCourseProgress("Áudio conferido. A atividade está pronta.");
    } catch (error) {
      setCourseError(error instanceof Error ? error.message : "Não foi possível preparar a aula.");
    } finally {
      setCourseLoading(false);
      courseOpeningTrack.current = null;
    }
  };

  const importAudioFiles = async (
    files: FileList | File[],
    onProgress?: (current: number, total: number, fileName: string) => void,
    forcedTrack?: SpotifyTrack,
  ): Promise<AudioImportResult> => {
    const imported: LocalAudioMeta[] = [];
    const unmatched: string[] = [];
    const failures: string[] = [];
    const unavailable = new Set<string>();

    if (navigator.storage?.persist) {
      await navigator.storage.persist().catch(() => false);
    }

    const selectedFiles = Array.from(files);
    for (const [index, file] of selectedFiles.entries()) {
      onProgress?.(index + 1, selectedFiles.length, file.name);
      try {
        let duration: number;
        try {
          duration = await audioDuration(file);
        } catch (error) {
          if (!forcedTrack) throw error;
          // Alguns navegadores móveis não conseguem ler os metadados antes de
          // guardar o arquivo. Como a faixa foi escolhida manualmente, usamos a
          // duração conhecida da playlist e deixamos o player abrir o áudio.
          duration = forcedTrack.durationMs / 1000;
        }
        const track = forcedTrack ?? findTrackForFile(file, duration, spotifyTracks, unavailable);
        if (!track) {
          unmatched.push(file.name);
          continue;
        }

        onProgress?.(index + 1, selectedFiles.length, `${file.name} · localizando a letra`);
        const { lyrics } = await fetchLyricsForLocalAudio(track, duration, file.name);
        if (!lyrics.syncedLyrics) {
          unmatched.push(file.name);
          continue;
        }
        const alignment = await alignAudioToLyrics(file, lyrics.syncedLyrics, (progress) =>
          onProgress?.(index + 1, selectedFiles.length, `${file.name} · ${progress.message}`),
        );
        const meta = await saveLocalAudio(track.id, file, duration, {
          syncedLyrics: alignment.syncedLyrics,
          syncRatio: 1,
          syncLead: 0,
          lyricsVersion: CURRENT_LYRICS_VERSION,
          alignmentVersion: CURRENT_ALIGNMENT_VERSION,
          alignmentConfidence: alignment.confidence,
          wordTimings: alignment.wordTimings,
        });
        imported.push(meta);
        unavailable.add(track.id);
      } catch (error) {
        unmatched.push(file.name);
        failures.push(
          error instanceof Error ? error.message : `Não foi possível guardar ${file.name}.`,
        );
      }
    }

    if (imported.length > 0) {
      setLocalAudio((current) => ({
        ...current,
        ...Object.fromEntries(imported.map((record) => [record.trackId, record])),
      }));
    }
    return { imported: imported.length, unmatched, failures };
  };

  const startPractice = () => {
    setQuestionIndex(0);
    setSelectedAnswer(null);
    setChecked(false);
    setShowTranslation(false);
    setShowHint(false);
    setScore(0);
    goTo("practice");
  };

  const back = () => {
    if (view === "spotify-course") goTo("home");
    if (view === "song") goTo("library");
    else if (view === "listen") goTo("song");
    else if (view === "lesson") goTo("listen");
    else if (view === "practice") goTo("lesson");
    else if (view === "result") goTo("song");
  };

  return (
    <div className="music-embedded app-shell">
      <header className="topbar">
        <div className="topbar-content">
          {["song", "listen", "lesson", "practice", "result", "spotify-course"].includes(view) ? (
            <button className="icon-button" onClick={back} aria-label="Voltar">
              ←
            </button>
          ) : (
            <span className="brand-icon" aria-hidden="true">
              ♫
            </span>
          )}
          <span className="brand-copy">
            <strong>Aprender com músicas</strong>
            <small>Ouça, complete e entenda</small>
          </span>
          <span className="lab-badge">MÚSICAS</span>
        </div>
      </header>

      <main className="page">
        {view === "home" && (
          <HomeView
            totalProgress={totalProgress}
            syncing={syncing}
            lastSync={lastSync}
            spotifyConnected={spotifyConnected}
            spotifyTracks={spotifyTracks}
            localAudio={localAudio}
            playlistName={playlistName}
            playlistUrl={playlistUrl}
            spotifyError={spotifyError}
            onConnect={() => void beginSpotifyLogin()}
            onDisconnect={() => {
              disconnectSpotify();
              setSpotifyConnected(false);
              setSpotifyTracks([]);
              setPlaylistSnapshot("");
              setSpotifyError(null);
              window.localStorage.removeItem(spotifyCacheKey);
            }}
            onSync={syncPlaylist}
            onLearnTrack={(track) => void openSpotifyCourse(track)}
            onImportAudio={importAudioFiles}
            onImportAudioForTrack={(track, file, onProgress) =>
              importAudioFiles([file], onProgress, track)
            }
            onOpenSong={() => openSong(songs[0])}
            onLibrary={() => goTo("library")}
          />
        )}

        {view === "library" && (
          <LibraryView songs={songs} completed={completed} onOpenSong={openSong} />
        )}

        {view === "song" && (
          <SongView
            song={selectedSong}
            mode={mode}
            completed={completed.includes(selectedSong.id)}
            onMode={setMode}
            onListen={() => goTo("listen")}
          />
        )}

        {view === "listen" && (
          <ListeningView song={selectedSong} onContinue={() => goTo("lesson")} />
        )}

        {view === "lesson" && (
          <LessonView song={selectedSong} mode={mode} onStart={startPractice} />
        )}

        {view === "practice" && (
          <PracticeView
            song={selectedSong}
            mode={mode}
            index={questionIndex}
            selected={selectedAnswer}
            checked={checked}
            showTranslation={showTranslation}
            showHint={showHint}
            onSelect={setSelectedAnswer}
            onToggleTranslation={() => setShowTranslation((current) => !current)}
            onToggleHint={() => setShowHint((current) => !current)}
            onVerify={() => {
              if (!selectedAnswer) return;
              setChecked(true);
              if (selectedAnswer === questions[questionIndex].answer) {
                setScore((current) => current + 1);
              }
            }}
            onContinue={() => {
              if (selectedAnswer !== questions[questionIndex].answer) {
                setSelectedAnswer(null);
                setChecked(false);
                setShowHint(true);
                return;
              }
              if (questionIndex === questions.length - 1) {
                goTo("result");
                return;
              }
              setQuestionIndex((current) => current + 1);
              setSelectedAnswer(null);
              setChecked(false);
              setShowTranslation(false);
              setShowHint(false);
            }}
          />
        )}

        {view === "result" && (
          <ResultView
            score={score}
            onSave={() => {
              setCompleted((current) =>
                current.includes(selectedSong.id) ? current : [...current, selectedSong.id],
              );
              goTo("song");
            }}
          />
        )}

        {view === "spotify-course" && courseTrack && (
          <LyricsGameCourse
            track={courseTrack}
            phrases={coursePhrases}
            audio={courseAudio}
            loading={courseLoading}
            loadingMessage={courseProgress}
            error={courseError}
            onRetry={() => void openSpotifyCourse(courseTrack)}
          />
        )}
      </main>
    </div>
  );
}

function HomeView({
  totalProgress,
  syncing,
  lastSync,
  spotifyConnected,
  spotifyTracks,
  localAudio,
  playlistName,
  playlistUrl,
  spotifyError,
  onConnect,
  onDisconnect,
  onSync,
  onLearnTrack,
  onImportAudio,
  onImportAudioForTrack,
  onOpenSong,
  onLibrary,
}: {
  totalProgress: number;
  syncing: boolean;
  lastSync: string;
  spotifyConnected: boolean;
  spotifyTracks: SpotifyTrack[];
  localAudio: Record<string, LocalAudioMeta>;
  playlistName: string;
  playlistUrl: string;
  spotifyError: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => Promise<void>;
  onLearnTrack: (track: SpotifyTrack) => void;
  onImportAudio: (
    files: FileList | File[],
    onProgress?: (current: number, total: number, fileName: string) => void,
  ) => Promise<AudioImportResult>;
  onImportAudioForTrack: (
    track: SpotifyTrack,
    file: File,
    onProgress?: (current: number, total: number, fileName: string) => void,
  ) => Promise<AudioImportResult>;
  onOpenSong: () => void;
  onLibrary: () => void;
}) {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const trackAudioInputRef = useRef<HTMLInputElement>(null);
  const [importingAudio, setImportingAudio] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [uploadTrack, setUploadTrack] = useState<SpotifyTrack | null>(null);
  const syncedLyrics = spotifyTracks.filter((track) => track.lyricsStatus === "synced").length;
  const readyAudio = spotifyTracks.filter(
    (track) => localAudio[track.id]?.alignmentVersion === CURRENT_ALIGNMENT_VERSION,
  ).length;

  useEffect(() => {
    const savedResult = window.localStorage.getItem(importResultStorageKey);
    if (savedResult) setImportResult(savedResult);
  }, []);

  const showImportResult = (message: string) => {
    setImportResult(message);
    window.localStorage.setItem(importResultStorageKey, message);
  };

  const importFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImportingAudio(true);
    setImportResult(null);
    setImportProgress(null);
    window.localStorage.removeItem(importResultStorageKey);
    try {
      const result = await onImportAudio(files, (current, total, fileName) =>
        setImportProgress(`${current} de ${total} • ${fileName}`),
      );
      if (result.imported > 0 && result.unmatched.length === 0) {
        showImportResult(
          `${result.imported} ${result.imported === 1 ? "música ficou pronta" : "músicas ficaram prontas"} para aprender.`,
        );
      } else if (result.imported > 0) {
        showImportResult(
          `${result.imported} pronta(s). ${result.unmatched.length} não reconhecida(s): ${result.unmatched.slice(0, 2).join(", ")}.`,
        );
      } else {
        showImportResult(
          `Arquivo não reconhecido: ${result.unmatched.slice(0, 2).join(", ")}. Confirme se é a mesma gravação que aparece na playlist.`,
        );
      }
    } catch {
      showImportResult("Não foi possível guardar os áudios neste aparelho.");
    } finally {
      setImportingAudio(false);
      setImportProgress(null);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  };

  const importFileForTrack = async (file: File | undefined) => {
    if (!file || !uploadTrack) return;
    const track = uploadTrack;
    setImportingAudio(true);
    setImportResult(null);
    setImportProgress(null);
    try {
      const result = await onImportAudioForTrack(track, file, (current, total, fileName) =>
        setImportProgress(`${current} de ${total} • ${fileName}`),
      );
      if (result.imported > 0) {
        showImportResult(`${track.name} ficou pronta para aprender.`);
      } else {
        showImportResult(
          result.failures[0] ?? `Não foi possível guardar o áudio de ${track.name} neste aparelho.`,
        );
      }
    } catch {
      showImportResult(`Não foi possível guardar o áudio de ${track.name}.`);
    } finally {
      setImportingAudio(false);
      setImportProgress(null);
      setUploadTrack(null);
      if (trackAudioInputRef.current) trackAudioInputRef.current.value = "";
    }
  };

  return (
    <div className="stack">
      <section className="hero">
        <span className="hero-kicker">✦ AGORA COM MÚSICA DE VERDADE</span>
        <h1>Ouça, acompanhe e entenda cada palavra.</h1>
        <p>
          Primeiro você escuta a música com a letra sincronizada. Depois o app explica frases
          completas e transforma tudo em prática.
        </p>
        <button className="button button-light" onClick={onOpenSong}>
          ▶ Testar experiência completa
        </button>
        <span className="hero-orb orb-a" />
        <span className="hero-orb orb-b" />
      </section>

      <section className="stats-grid" aria-label="Resumo">
        <article className="stat-card">
          <span className="stat-icon purple">♫</span>
          <span>
            <strong>{spotifyConnected ? spotifyTracks.length : 1}</strong>
            <small>{spotifyConnected ? "músicas importadas" : "gravação liberada"}</small>
          </span>
        </article>
        <article className="stat-card">
          <span className="stat-icon orange">♥</span>
          <span>
            <strong>{totalProgress}%</strong>
            <small>progresso musical</small>
          </span>
        </article>
      </section>

      <section className="card spotify-card">
        <div className="spotify-heading">
          <span className="spotify-icon">♫</span>
          <span>
            <strong>{spotifyConnected ? playlistName : "Conectar sua playlist"}</strong>
            <small>
              {spotifyConnected
                ? `${syncedLyrics} com letra sincronizada encontrada`
                : "Importe automaticamente as músicas salvas no Spotify"}
            </small>
          </span>
          <i
            className={spotifyConnected ? "" : "offline"}
            aria-label={spotifyConnected ? "Spotify conectado" : "Spotify desconectado"}
          />
        </div>
        {spotifyError && <p className="spotify-error">{spotifyError}</p>}
        {spotifyConnected ? (
          <>
            <div className="sync-row">
              <small>Última verificação: {lastSync}</small>
              <button onClick={() => void onSync()} disabled={syncing}>
                <span className={syncing ? "spin" : ""}>↻</span>
                {syncing ? "Buscando músicas e letras" : "Sincronizar playlist"}
              </button>
            </div>
            <div className="spotify-links">
              <a href={playlistUrl} target="_blank" rel="noreferrer">
                Abrir no Spotify ↗
              </a>
              <button onClick={onDisconnect}>Desconectar</button>
            </div>
          </>
        ) : (
          <button className="spotify-connect" onClick={onConnect}>
            Conectar ao Spotify
          </button>
        )}
      </section>

      {spotifyConnected && spotifyTracks.length > 0 && (
        <>
          <section className="local-import-card">
            <div className="local-import-icon" aria-hidden="true">
              ⇧
            </div>
            <div className="local-import-copy">
              <small>ÁUDIOS NESTE APARELHO</small>
              <h2>Adicione várias músicas de uma vez</h2>
              <p>
                O laboratório ouve cada gravação neste aparelho e só libera a aula quando reconhece
                palavras suficientes para alinhar áudio e letra.
              </p>
              <span>
                <strong>{readyAudio}</strong> de {syncedLyrics} com sincronização completa
              </span>
            </div>
            <input
              ref={audioInputRef}
              className="visually-hidden"
              type="file"
              accept="audio/*,.mp3,.m4a,.mp4,.wav,.ogg,.aac,.flac"
              multiple
              onChange={(event) => void importFiles(event.currentTarget.files)}
            />
            <input
              ref={trackAudioInputRef}
              className="visually-hidden"
              type="file"
              accept="audio/*,.mp3,.m4a,.mp4,.wav,.ogg,.aac,.flac"
              onChange={(event) => void importFileForTrack(event.currentTarget.files?.[0])}
            />
            <button
              className="local-import-button"
              disabled={importingAudio}
              onClick={() => audioInputRef.current?.click()}
            >
              {importingAudio ? "Analisando…" : "Selecionar vários áudios"}
            </button>
            {importingAudio && importProgress && (
              <p className="local-import-progress">
                <span className="spin">↻</span>
                {importProgress}
              </p>
            )}
            {importResult && <p className="local-import-result">{importResult}</p>}
            <small className="local-privacy">
              O áudio e a análise ficam somente neste aparelho. Na primeira vez, o reconhecedor de
              voz é baixado pela internet. A validação costuma levar de 3 a 15 minutos no celular e
              agora mostra o avanço real.
            </small>
          </section>

          <section className="spotify-imports">
            <div className="section-heading">
              <span>
                <small>IMPORTADAS DA SUA PLAYLIST</small>
                <h2>Sua biblioteca de aprendizado</h2>
              </span>
            </div>
            <div className="spotify-track-list">
              {spotifyTracks.map((track) => (
                <article
                  className={`spotify-track ${localAudio[track.id] ? "audio-ready" : ""}`}
                  key={track.id}
                >
                  {track.imageUrl ? (
                    // A capa é exibida intacta e vinculada à faixa no Spotify.
                    <img src={track.imageUrl} alt={`Capa de ${track.album}`} />
                  ) : (
                    <span className="spotify-track-placeholder" aria-hidden="true">
                      ♫
                    </span>
                  )}
                  <span>
                    <strong>{track.name}</strong>
                    <small>{track.artist}</small>
                    <em
                      className={`lyrics-status ${
                        localAudio[track.id]?.alignmentVersion === CURRENT_ALIGNMENT_VERSION
                          ? "local-ready"
                          : track.lyricsStatus
                      }`}
                    >
                      {localAudio[track.id]?.alignmentVersion === CURRENT_ALIGNMENT_VERSION &&
                        "Áudio conferido e pronto"}
                      {localAudio[track.id] &&
                        localAudio[track.id]?.alignmentVersion !== CURRENT_ALIGNMENT_VERSION &&
                        "Áudio salvo • precisa validar novamente"}
                      {!localAudio[track.id] &&
                        track.lyricsStatus === "synced" &&
                        "Letra pronta • falta adicionar o áudio"}
                      {track.lyricsStatus === "plain" &&
                        !localAudio[track.id] &&
                        "Letra encontrada, sem sincronização"}
                      {track.lyricsStatus === "missing" &&
                        !localAudio[track.id] &&
                        "Letra não encontrada"}
                      {track.lyricsStatus === "error" &&
                        !localAudio[track.id] &&
                        "Não foi possível verificar agora"}
                    </em>
                  </span>
                  <span className="track-actions">
                    {track.lyricsStatus === "synced" && localAudio[track.id] && (
                      <button onClick={() => onLearnTrack(track)}>Aprender →</button>
                    )}
                    {track.lyricsStatus === "synced" && localAudio[track.id] && (
                      <button
                        className="replace-audio-button"
                        disabled={importingAudio}
                        onClick={() => {
                          setUploadTrack(track);
                          window.setTimeout(() => trackAudioInputRef.current?.click(), 0);
                        }}
                      >
                        Trocar áudio
                      </button>
                    )}
                    {track.lyricsStatus === "synced" && !localAudio[track.id] && (
                      <button
                        disabled={importingAudio}
                        onClick={() => {
                          setUploadTrack(track);
                          window.setTimeout(() => trackAudioInputRef.current?.click(), 0);
                        }}
                      >
                        Adicionar áudio
                      </button>
                    )}
                    <a href={track.spotifyUrl} target="_blank" rel="noreferrer">
                      Ouvir ↗
                    </a>
                  </span>
                </article>
              ))}
            </div>
            <p className="experimental-note">
              Nome e duração ajudam a localizar a faixa; a atividade só é liberada quando a voz do
              próprio arquivo confirma que áudio e letra pertencem à mesma música.
            </p>
          </section>
        </>
      )}

      <section>
        <div className="section-heading">
          <span>
            <small>EXPERIÊNCIA DISPONÍVEL</small>
            <h2>Ouvir com letra sincronizada</h2>
          </span>
          <button onClick={onLibrary}>Ver músicas</button>
        </div>
        <SongCard song={songs[0]} onOpen={onOpenSong} />
      </section>

      <aside className="safety-note">
        <span aria-hidden="true">ⓘ</span>
        <p>
          <strong>Áudio humano real:</strong> esta gravação e sua letra estão em domínio público.
          Músicas comerciais só entrarão quando houver uma fonte licenciada.
        </p>
      </aside>
    </div>
  );
}

function SongCard({ song, onOpen }: { song: Song; onOpen: () => void }) {
  return (
    <button className="song-card" onClick={onOpen}>
      <span className={`album-cover ${song.cover}`} aria-hidden="true">
        ♫
      </span>
      <span className="song-copy">
        <strong>{song.title}</strong>
        <small>{song.artist}</small>
        <small>
          {song.level} • {song.minutes} min
        </small>
        <span className="mini-progress">
          <i style={{ width: `${song.progress}%` }} />
        </span>
      </span>
      <span className="chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function LibraryView({
  songs: librarySongs,
  completed,
  onOpenSong,
}: {
  songs: Song[];
  completed: string[];
  onOpenSong: (song: Song) => void;
}) {
  return (
    <div className="stack">
      <section className="page-intro">
        <small>SUA PLAYLIST</small>
        <h1>Músicas para aprender</h1>
        <p>
          A faixa liberada já usa áudio humano. As músicas comerciais aparecem bloqueadas até
          conectarmos uma fonte de letras licenciada.
        </p>
      </section>
      <div className="filters" aria-label="Filtros demonstrativos">
        <button className="active">Todas</button>
        <button>Prontas</button>
        <button>Aguardando licença</button>
      </div>
      <section className="library-list">
        {librarySongs.map((song) => (
          <button
            className="library-song"
            key={song.id}
            onClick={() => onOpenSong(song)}
            disabled={song.status !== "ready"}
          >
            <span className={`album-cover small ${song.cover}`} aria-hidden="true">
              {completed.includes(song.id) ? "✓" : song.status === "ready" ? "♫" : "⌛"}
            </span>
            <span className="song-copy">
              <strong>{song.title}</strong>
              <small>{song.artist}</small>
              <em className={`status ${song.status}`}>
                {song.status === "ready" ? "Pronta com áudio real" : "Aguardando licença"}
              </em>
            </span>
            <span className="chevron" aria-hidden="true">
              {song.status === "ready" ? "›" : "🔒"}
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}

function SongView({
  song,
  mode,
  completed,
  onMode,
  onListen,
}: {
  song: Song;
  mode: Mode;
  completed: boolean;
  onMode: (mode: Mode) => void;
  onListen: () => void;
}) {
  const stages = [
    ["◖", "Escutar a música", "Gravação humana real"],
    ["◉", "Acompanhar a letra", "Destaque palavra por palavra"],
    ["▣", "Entender as frases", "Tradução, contexto e vocabulário"],
    ["✦", "Fixar com atividades", "Escuta e compreensão"],
  ];

  return (
    <div className="stack">
      <section className="song-hero">
        <span className={`album-cover large ${song.cover}`} aria-hidden="true">
          ♫
        </span>
        <span>
          <small>MÚSICA EM ESTUDO</small>
          <h1>{song.title}</h1>
          <p>{song.artist}</p>
          <em className="public-domain-chip">✓ áudio e letra liberados</em>
        </span>
      </section>

      <section>
        <div className="section-heading left">
          <span>
            <h2>Como você vai estudar agora?</h2>
            <p>O conteúdo se adapta ao momento.</p>
          </span>
        </div>
        <div className="mode-grid">
          <button
            className={mode === "commute" ? "selected" : ""}
            onClick={() => onMode("commute")}
          >
            <b aria-hidden="true">▰</b>
            <strong>No trajeto</strong>
            <small>Fone, toques rápidos e sem microfone</small>
            {mode === "commute" && <i>✓</i>}
          </button>
          <button className={mode === "home" ? "selected" : ""} onClick={() => onMode("home")}>
            <b aria-hidden="true">⌂</b>
            <strong>Em casa</strong>
            <small>Prática mais longa e repetição guiada</small>
            {mode === "home" && <i>✓</i>}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="route-heading">
          <span>
            <small>NOVO FLUXO</small>
            <h2>Da música ao aprendizado</h2>
          </span>
          <em>◷ {song.minutes} min</em>
        </div>
        <ol className="stage-list">
          {stages.map(([icon, title, subtitle], index) => (
            <li key={title}>
              <span className="stage-icon" aria-hidden="true">
                {icon}
              </span>
              <span>
                <small>ETAPA {index + 1}</small>
                <strong>{title}</strong>
                <p>{subtitle}</p>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="focus-card">
        <small>FOCO DESTA MÚSICA</small>
        <h2>{song.theme}</h2>
        <div>
          {song.focus.map((focus) => (
            <span key={focus}>{focus}</span>
          ))}
        </div>
      </section>

      <button className="button full music-cta" onClick={onListen}>
        <span aria-hidden="true">▶</span>
        {completed ? "Ouvir novamente com a letra" : "Ouvir música com a letra"}
      </button>
    </div>
  );
}

function ListeningView({ song, onContinue }: { song: Song; onContinue: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(234);
  const [playing, setPlaying] = useState(false);
  const [showTranslation, setShowTranslation] = useState(true);

  const activeIndex = lyrics.findIndex(
    (line) => currentTime >= line.start && currentTime <= line.end,
  );
  const activeLine = activeIndex >= 0 ? lyrics[activeIndex] : null;

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
    }
  };

  const seek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const currentVerse = activeLine?.verse;
  const previousLine = activeIndex > 0 ? lyrics[activeIndex - 1] : null;
  const nextLine =
    activeIndex >= 0 && activeIndex < lyrics.length - 1 ? lyrics[activeIndex + 1] : null;

  return (
    <div className="listening-screen">
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 234)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      >
        <source src={audioSources.mp3} type="audio/mpeg" />
        <source src={audioSources.ogg} type="audio/ogg" />
      </audio>

      <section className="listen-heading">
        <span className={`album-cover listen-cover ${song.cover}`} aria-hidden="true">
          ♫
        </span>
        <div>
          <small>PRIMEIRO: SÓ ESCUTE E ACOMPANHE</small>
          <h1>{song.title}</h1>
          <p>Voz humana real • letra sincronizada</p>
        </div>
      </section>

      <section className="karaoke-card" aria-live="polite">
        <div className="karaoke-topline">
          <span>
            {currentVerse
              ? `VERSO ${currentVerse}`
              : currentTime < 29.46
                ? "INTRODU\u00c7\u00c3O"
                : "INTERLÚDIO"}
          </span>
          <button onClick={() => setShowTranslation((current) => !current)}>
            {showTranslation ? "Ocultar tradução" : "Ver tradução"}
          </button>
        </div>

        <div className="lyric-stage">
          {activeLine ? (
            <>
              {previousLine && previousLine.verse === activeLine.verse && (
                <p className="lyric-neighbor">{previousLine.text}</p>
              )}
              <p className="active-lyric">{activeLine.text}</p>
              {showTranslation && <p className="lyric-translation">{activeLine.translation}</p>}
              {nextLine && nextLine.verse === activeLine.verse && (
                <p className="lyric-neighbor next">{nextLine.text}</p>
              )}
            </>
          ) : (
            <div className="instrumental-space" aria-hidden="true">
              <span aria-hidden="true">♫</span>
            </div>
          )}
        </div>

        <div className="player">
          <button
            className="play-button"
            onClick={togglePlay}
            aria-label={playing ? "Pausar" : "Tocar"}
          >
            {playing ? "Ⅱ" : "▶"}
          </button>
          <div className="player-timeline">
            <input
              aria-label="Posição da música"
              type="range"
              min={0}
              max={duration || 234}
              step={0.1}
              value={Math.min(currentTime, duration || 234)}
              onChange={(event) => seek(Number(event.target.value))}
            />
            <span>
              <small>{formatTime(currentTime)}</small>
              <small>{formatTime(duration || 234)}</small>
            </span>
          </div>
        </div>
      </section>

      <aside className="source-note">
        <span aria-hidden="true">✓</span>
        <p>
          Gravação da U.S. Marine Band e letra de John Newton, ambas em domínio público. O destaque
          por palavra é aproximado a partir das marcações oficiais.
        </p>
      </aside>

      <button className="button full" onClick={onContinue}>
        Agora quero entender cada frase →
      </button>
    </div>
  );
}

function LessonView({ song, mode, onStart }: { song: Song; mode: Mode; onStart: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [activePart, setActivePart] = useState(0);
  const [playingPart, setPlayingPart] = useState<number | null>(null);
  const [clipEnd, setClipEnd] = useState<number | null>(null);

  const playPart = async (index: number, start: number, end: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playingPart === index && !audio.paused) {
      audio.pause();
      return;
    }

    audio.currentTime = start;
    setClipEnd(end);
    setPlayingPart(index);
    try {
      await audio.play();
    } catch {
      setPlayingPart(null);
    }
  };

  return (
    <div className="stack">
      <audio
        ref={audioRef}
        onTimeUpdate={(event) => {
          if (clipEnd !== null && event.currentTarget.currentTime >= clipEnd) {
            event.currentTarget.pause();
          }
        }}
        onPause={() => setPlayingPart(null)}
        onEnded={() => setPlayingPart(null)}
      >
        <source src={audioSources.mp3} type="audio/mpeg" />
        <source src={audioSources.ogg} type="audio/ogg" />
      </audio>

      <section className="page-intro lesson-intro">
        <small>SEGUNDO: FRASES DA MÚSICA</small>
        <h1>Entenda uma ideia completa de cada vez</h1>
        <p>
          A divisão respeita o sentido da frase — nada de cortar a letra de duas em duas palavras.
          Ouça, entenda e avance no seu ritmo.
        </p>
        <span className="mode-pill">
          {mode === "commute" ? "▰ Modo trajeto" : "⌂ Modo casa"} • {song.title}
        </span>
      </section>

      <section className="lesson-parts">
        <article className="lesson-part open">
          <div className="lesson-part-heading">
            <span>
              <small>
                FRASE {activePart + 1} DE {lessonParts.length}
              </small>
              <strong>{lessonParts[activePart].line}</strong>
              <em>{lessonParts[activePart].translation}</em>
            </span>
          </div>
          <div className="lesson-part-body">
            <p>{lessonParts[activePart].explanation}</p>
            <div className="vocabulary-grid">
              {lessonParts[activePart].vocabulary.map((item) => (
                <span key={item.word}>
                  <strong>{item.word}</strong>
                  <small>{item.meaning}</small>
                </span>
              ))}
            </div>
            <button
              className="clip-button"
              onClick={() =>
                playPart(activePart, lessonParts[activePart].start, lessonParts[activePart].end)
              }
            >
              {playingPart === activePart ? "Ⅱ Pausar frase" : "▶ Ouvir frase"}
            </button>
          </div>
        </article>
        <div className="lesson-nav" aria-label="Navegar entre frases">
          <button
            disabled={activePart === 0}
            onClick={() => {
              audioRef.current?.pause();
              setActivePart((current) => current - 1);
            }}
          >
            ← Anterior
          </button>
          <span>
            {lessonParts.map((part, index) => (
              <i className={index === activePart ? "active" : ""} key={part.line} />
            ))}
          </span>
          <button
            disabled={activePart === lessonParts.length - 1}
            onClick={() => {
              audioRef.current?.pause();
              setActivePart((current) => current + 1);
            }}
          >
            Próxima →
          </button>
        </div>
      </section>

      <aside className="learning-recap">
        <small>O QUE VOCÊ JÁ FEZ</small>
        <div>
          <span>✓ ouviu a música real</span>
          <span>✓ acompanhou palavra por palavra</span>
          <span>✓ entendeu quatro frases completas</span>
        </div>
      </aside>

      <button className="button full" onClick={onStart}>
        Fixar com atividades →
      </button>
    </div>
  );
}

function PracticeView({
  song,
  mode,
  index,
  selected,
  checked,
  showTranslation,
  showHint,
  onSelect,
  onToggleTranslation,
  onToggleHint,
  onVerify,
  onContinue,
}: {
  song: Song;
  mode: Mode;
  index: number;
  selected: string | null;
  checked: boolean;
  showTranslation: boolean;
  showHint: boolean;
  onSelect: (answer: string) => void;
  onToggleTranslation: () => void;
  onToggleHint: () => void;
  onVerify: () => void;
  onContinue: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingClip, setPlayingClip] = useState(false);
  const question = questions[index];
  const isCorrect = selected === question.answer;
  const progress = Math.round(((index + 1) / questions.length) * 100);

  const playOriginalClip = async () => {
    const audio = audioRef.current;
    if (!audio || question.audioStart === undefined) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    audio.currentTime = question.audioStart;
    setPlayingClip(true);
    try {
      await audio.play();
    } catch {
      setPlayingClip(false);
    }
  };

  return (
    <div className="practice">
      <audio
        ref={audioRef}
        onTimeUpdate={(event) => {
          if (
            question.audioEnd !== undefined &&
            event.currentTarget.currentTime >= question.audioEnd
          ) {
            event.currentTarget.pause();
            setPlayingClip(false);
          }
        }}
        onPause={() => setPlayingClip(false)}
      >
        <source src={audioSources.mp3} type="audio/mpeg" />
        <source src={audioSources.ogg} type="audio/ogg" />
      </audio>

      <section className="practice-head">
        <div>
          <strong>{song.title}</strong>
          <em>{mode === "commute" ? "▰ Modo trajeto" : "⌂ Modo casa"}</em>
        </div>
        <p>
          <span>
            {index + 1} de {questions.length}
          </span>
          <span>{question.type}</span>
        </p>
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <i style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="question">
        <small>PRÁTICA {index + 1}</small>
        <h1>{question.prompt}</h1>

        {question.audioStart !== undefined && (
          <button className="listen-button" onClick={playOriginalClip}>
            <span aria-hidden="true">{playingClip ? "Ⅱ" : "▶"}</span>
            {playingClip ? "Pausar áudio" : "Ouvir frase na música"}
          </button>
        )}

        <div className="help-buttons">
          <button onClick={onToggleTranslation}>
            {showTranslation ? "Ocultar tradução" : "Ver tradução"}
          </button>
          <button onClick={onToggleHint}>
            {showHint ? "Ocultar dica" : "Preciso de uma dica"}
          </button>
        </div>

        {showTranslation && <p className="translation">{question.translation}</p>}
        {showHint && <p className="hint">✦ {question.hint}</p>}

        <div className="options" role="radiogroup" aria-label="Alternativas">
          {question.options.map((option) => {
            const optionSelected = selected === option;
            let className = optionSelected ? "selected" : "";
            if (checked && optionSelected && option === question.answer) className = "correct";
            if (checked && optionSelected && option !== question.answer) className = "incorrect";

            return (
              <button
                key={option}
                className={className}
                onClick={() => !checked && onSelect(option)}
                role="radio"
                aria-checked={optionSelected}
              >
                <i>{optionSelected ? "●" : ""}</i>
                <span>{option}</span>
                {checked && optionSelected && option === question.answer && <b>✓</b>}
              </button>
            );
          })}
        </div>

        {!checked ? (
          <button className="button full" onClick={onVerify} disabled={!selected}>
            Verificar
          </button>
        ) : (
          <div className={`feedback ${isCorrect ? "success" : "review"}`}>
            <strong>{isCorrect ? "Muito bem!" : "Ainda não. Escute e tente outra vez."}</strong>
            <p>
              {isCorrect
                ? question.explanation
                : "A resposta correta continua escondida. Use o áudio e a dica para descobrir por conta própria."}
            </p>
            <button className="button full" onClick={onContinue}>
              {isCorrect
                ? index === questions.length - 1
                  ? "Ver resultado"
                  : "Continuar"
                : "Tentar novamente"}{" "}
              →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function LocalKaraokePlayer({
  track,
  phrases,
  audio,
}: {
  track: SpotifyTrack;
  phrases: CoursePhrase[];
  audio: CourseAudio;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(audio.duration);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const alignedPhrases = useMemo(
    () =>
      phrases.map((phrase) => ({
        ...phrase,
        start: phrase.start * audio.syncRatio,
      })),
    [audio.syncRatio, phrases],
  );
  const lyricTime = currentTime + audio.syncLead;

  const activeIndex = useMemo(() => {
    let found = -1;
    for (let index = 0; index < alignedPhrases.length; index += 1) {
      if (lyricTime >= alignedPhrases[index].start) found = index;
      else break;
    }
    return found;
  }, [alignedPhrases, lyricTime]);

  const activePhrase = activeIndex >= 0 ? alignedPhrases[activeIndex] : null;
  const previousPhrase = activeIndex > 0 ? alignedPhrases[activeIndex - 1] : null;
  const nextPhrase =
    activeIndex >= 0 && activeIndex < alignedPhrases.length - 1
      ? alignedPhrases[activeIndex + 1]
      : null;

  const togglePlay = async () => {
    const player = audioRef.current;
    if (!player) return;
    if (player.paused) {
      try {
        await player.play();
      } catch {
        setPlaying(false);
      }
    } else {
      player.pause();
    }
  };

  const seek = (time: number) => {
    const player = audioRef.current;
    if (!player) return;
    player.currentTime = time;
    setCurrentTime(time);
  };

  const replayCurrentPhrase = async () => {
    const player = audioRef.current;
    if (!player || !activePhrase) return;
    player.currentTime = Math.max(0, activePhrase.start - 0.15);
    setCurrentTime(player.currentTime);
    await player.play().catch(() => setPlaying(false));
  };

  const cyclePlaybackRate = () => {
    const nextRate = playbackRate === 1 ? 0.85 : playbackRate === 0.85 ? 0.7 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) audioRef.current.playbackRate = nextRate;
  };

  return (
    <section className="local-karaoke" aria-label={`Letra sincronizada de ${track.name}`}>
      <audio
        ref={audioRef}
        src={audio.url}
        preload="metadata"
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || audio.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <div className="local-karaoke-top">
        <span>
          <small>OUÇA E ACOMPANHE</small>
          <strong>Sincronização automática</strong>
        </span>
        <em>Letra antecipada automaticamente</em>
      </div>
      <div className="local-lyric-stage" aria-live="polite">
        {activePhrase ? (
          <>
            {previousPhrase && <p className="local-lyric-neighbor">{previousPhrase.text}</p>}
            <p className="local-active-lyric">{activePhrase.text}</p>
            {nextPhrase && <p className="local-lyric-neighbor">{nextPhrase.text}</p>}
          </>
        ) : (
          <p className="local-intro-message">A música vai começar…</p>
        )}
      </div>
      <div className="local-player-controls">
        <button onClick={togglePlay} aria-label={playing ? "Pausar" : "Reproduzir"}>
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
            onChange={(event) => seek(Number(event.target.value))}
          />
          <span>
            <small>{formatTime(currentTime)}</small>
            <small>{formatTime(duration || audio.duration)}</small>
          </span>
        </div>
        <div className="karaoke-learning-controls">
          <button disabled={!activePhrase} onClick={replayCurrentPhrase}>
            ↻ Repetir verso
          </button>
          <button onClick={cyclePlaybackRate}>{playbackRate}× velocidade</button>
        </div>
      </div>
    </section>
  );
}

function SegmentPlayer({
  audio,
  start,
  end,
  label = "Ouvir trecho",
}: {
  audio: CourseAudio;
  start: number;
  end: number;
  label?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const alignedStart = Math.max(0, start * audio.syncRatio - audio.syncLead);
  const alignedEnd = Math.min(
    audio.duration,
    Math.max(alignedStart + 1.2, end * audio.syncRatio - audio.syncLead),
  );

  const toggleSegment = async () => {
    const player = audioRef.current;
    if (!player) return;
    if (!player.paused) {
      player.pause();
      return;
    }
    if (player.currentTime < alignedStart || player.currentTime >= alignedEnd - 0.1) {
      player.currentTime = alignedStart;
    }
    await player.play().catch(() => setPlaying(false));
  };

  return (
    <div className="segment-player">
      <audio
        ref={audioRef}
        src={audio.url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => {
          if (event.currentTarget.currentTime >= alignedEnd) {
            event.currentTarget.pause();
            event.currentTarget.currentTime = alignedStart;
          }
        }}
      />
      <button onClick={toggleSegment}>
        <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
        {playing ? "Pausar trecho" : label}
      </button>
      <small>
        {formatTime(alignedStart)}–{formatTime(alignedEnd)}
      </small>
    </div>
  );
}

function SpotifyCourseView({
  track,
  phrases,
  audio,
  loading,
  error,
}: {
  track: SpotifyTrack;
  phrases: CoursePhrase[];
  audio: CourseAudio | null;
  loading: boolean;
  error: string | null;
}) {
  const [stage, setStage] = useState<
    "prepare" | "phrases" | "practice" | "review" | "mastery" | "done"
  >("prepare");
  const [listened, setListened] = useState(false);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [phraseRevealed, setPhraseRevealed] = useState(false);
  const [showExerciseHint, setShowExerciseHint] = useState(false);
  const [meaningAttempt, setMeaningAttempt] = useState("");
  const [meaningChecked, setMeaningChecked] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [availableChunks, setAvailableChunks] = useState<string[]>([]);
  const [orderedChunks, setOrderedChunks] = useState<string[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [masteryRepetitions, setMasteryRepetitions] = useState(0);
  const [packSaved, setPackSaved] = useState(false);

  useEffect(() => {
    setStage("prepare");
    setListened(false);
    setPhraseIndex(0);
    setQuestionIndex(0);
    setSelected(null);
    setChecked(false);
    setScore(0);
    setPhraseRevealed(false);
    setShowExerciseHint(false);
    setMeaningAttempt("");
    setMeaningChecked(false);
    setTypedAnswer("");
    setAvailableChunks([]);
    setOrderedChunks([]);
    setReviewItems([]);
    setMasteryRepetitions(0);
    setPackSaved(false);
  }, [track.id]);

  const groupedPhrases = useMemo(() => groupCoursePhrases(phrases), [phrases]);
  const studyPhrases = useMemo(() => groupedPhrases.slice(0, 12), [groupedPhrases]);
  useEffect(() => {
    setPhraseRevealed(false);
    setMeaningAttempt("");
    setMeaningChecked(false);
  }, [phraseIndex]);

  const questions = useMemo<CoursePracticeQuestion[]>(() => {
    const usable = groupedPhrases
      .map((phrase, phrasePosition) => ({ phrase, phrasePosition }))
      .filter(({ phrase }) => phrase.text.split(/\s+/).length >= 5)
      .slice(0, 12);
    const wordPool = Array.from(
      new Set(
        groupedPhrases.flatMap((phrase) =>
          phrase.text
            .split(/\s+/)
            .map((word) => word.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, ""))
            .filter((word) => word.length >= 4),
        ),
      ),
    );

    return usable.map(({ phrase, phrasePosition }, index) => {
      const originalWords = phrase.text.split(/\s+/);
      const targetIndex = Math.min(
        originalWords.length - 2,
        Math.max(1, Math.floor(originalWords.length / 2)),
      );
      const original = originalWords[targetIndex];
      const answer = original.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, "");
      const wordsWithGap = [...originalWords];
      wordsWithGap[targetIndex] = original.replace(answer, "_____");
      const end =
        groupedPhrases[phrasePosition + 1]?.start ??
        Math.min(audio?.duration ?? phrase.start + 8, phrase.start + 8);

      if (index % 3 === 1) {
        return {
          kind: "write",
          label: "ESCREVER O QUE OUVIU",
          instruction: "Digite a palavra que está faltando",
          prompt: wordsWithGap.join(" "),
          answer,
          options: [],
          chunks: [],
          start: phrase.start,
          end,
          hint: `A palavra tem ${answer.length} letras e começa com “${answer[0]}”.`,
        };
      }

      if (index % 3 === 2) {
        const chunks = phraseChunks(phrase.text);
        const shift = (index % Math.max(1, chunks.length - 1)) + 1;
        const shuffled = [...chunks.slice(shift), ...chunks.slice(0, shift)];
        return {
          kind: "order",
          label: "REMONTAR A FRASE",
          instruction: "Toque nos blocos na ordem em que foram cantados",
          prompt: "Escute o trecho e reconstrua a frase completa.",
          answer: phrase.text,
          options: [],
          chunks: shuffled,
          start: phrase.start,
          end,
          hint: "Comece pelo bloco que soa como o início de uma frase completa.",
        };
      }

      const distractors = buildDistractors(answer, wordPool, phrase.text);
      const options = [answer, ...distractors];
      const rotation = index % options.length;
      return {
        kind: "recognize",
        label: "RECONHECER PELO SOM",
        instruction: "Qual palavra completa a frase cantada?",
        prompt: wordsWithGap.join(" "),
        answer,
        options: [...options.slice(rotation), ...options.slice(0, rotation)],
        chunks: [],
        start: phrase.start,
        end,
        hint: `A palavra ausente é da mesma classe de “${answer}” e começa com “${answer[0]}”.`,
      };
    });
  }, [audio?.duration, groupedPhrases]);

  useEffect(() => {
    if (studyPhrases.length === 0) return;
    const lessonPack = {
      version: 1,
      trackId: track.id,
      preparedAt: Date.now(),
      phrases: studyPhrases.map((phrase) => ({
        ...phrase,
        insight: insightForPhrase(phrase.text),
      })),
    };
    window.localStorage.setItem(`trilha-music-lesson-pack-${track.id}`, JSON.stringify(lessonPack));
    setPackSaved(true);
  }, [studyPhrases, track.id]);

  useEffect(() => {
    const question = questions[questionIndex];
    setSelected(null);
    setChecked(false);
    setTypedAnswer("");
    setOrderedChunks([]);
    setAvailableChunks(question?.chunks ?? []);
    setShowExerciseHint(false);
  }, [questionIndex, questions]);

  const vocabulary: Record<string, string> = {
    dream: "sonho / sonhar",
    life: "vida",
    learn: "aprender",
    sing: "cantar",
    years: "anos",
    lose: "perder",
    win: "vencer",
    past: "passado",
    today: "hoje",
    tomorrow: "amanhã",
    fear: "medo",
    love: "amor / amar",
    time: "tempo",
    everybody: "todo mundo",
    dues: "o que é devido / preço a pagar",
    knows: "sabe / conhece",
    nobody: "ninguém",
    comes: "vem",
    goes: "vai",
    laughter: "risadas",
    tears: "lágrimas",
    pages: "páginas",
    written: "escrito",
    fools: "tolos",
    sages: "sábios",
    true: "verdadeiro",
  };

  if (loading) {
    return (
      <section className="course-loading">
        <span className="spin">↻</span>
        <h1>Preparando sua primeira aula…</h1>
        <p>Organizando as frases e montando as atividades.</p>
      </section>
    );
  }

  if (error || phrases.length === 0 || !audio) {
    return (
      <section className="course-error">
        <span>!</span>
        <h1>A aula ainda não ficou pronta</h1>
        <p>
          {error ?? "Não encontramos áudio e frases sincronizadas suficientes para esta música."}
        </p>
      </section>
    );
  }

  const currentPhrase = studyPhrases[phraseIndex];
  const phraseVocabulary = Array.from(
    new Set(
      currentPhrase?.text
        .toLowerCase()
        .split(/[^a-z']+/)
        .filter((word) => vocabulary[word]) ?? [],
    ),
  );
  const currentInsight = currentPhrase ? insightForPhrase(currentPhrase.text) : null;
  const meaningResult =
    currentInsight && meaningChecked ? evaluateMeaning(meaningAttempt, currentInsight) : null;
  const currentQuestion = questions[questionIndex];
  const submittedAnswer =
    currentQuestion?.kind === "write"
      ? typedAnswer
      : currentQuestion?.kind === "order"
        ? orderedChunks.join(" ")
        : (selected ?? "");
  const isCorrect =
    Boolean(currentQuestion) && normalized(submittedAnswer) === normalized(currentQuestion.answer);
  const canVerify =
    currentQuestion?.kind === "write"
      ? Boolean(typedAnswer.trim())
      : currentQuestion?.kind === "order"
        ? availableChunks.length === 0 && orderedChunks.length > 0
        : Boolean(selected);
  const stageOrder = ["prepare", "phrases", "practice", "review", "mastery", "done"];
  const currentStagePosition = stageOrder.indexOf(stage);

  return (
    <div className="course-shell">
      <section className="course-hero">
        {track.imageUrl ? (
          // A capa permanece intacta e leva para a faixa original no Spotify.
          <img src={track.imageUrl} alt={`Capa de ${track.album}`} />
        ) : (
          <span aria-hidden="true">♫</span>
        )}
        <div>
          <small>CURSO CONSTRUÍDO A PARTIR DA SUA MÚSICA</small>
          <h1>{track.name}</h1>
          <p>{track.artist}</p>
          <em>Ouvir → entender → praticar → revisar → dominar</em>
        </div>
      </section>

      <aside className="offline-pack-status">
        <span aria-hidden="true">↓</span>
        <div>
          <strong>
            {packSaved ? "Pacote de estudo salvo neste aparelho" : "Preparando pacote econômico"}
          </strong>
          <small>
            O áudio é local e o conteúdo é reutilizado. Durante a sessão não há chamadas ao Gemini
            nem transmissão da música.
          </small>
        </div>
        <b>{packSaved ? "MODO ECONÔMICO" : "PREPARANDO"}</b>
      </aside>

      <nav className="course-progress" aria-label="Etapas da aula">
        {[
          ["prepare", "1", "Ouvir"],
          ["phrases", "2", "Entender"],
          ["practice", "3", "Praticar"],
          ["review", "4", "Revisar"],
          ["mastery", "5", "Dominar"],
        ].map(([value, number, label]) => (
          <span
            className={stageOrder.indexOf(value) <= currentStagePosition ? "active" : ""}
            key={value}
          >
            <b>{number}</b>
            {label}
          </span>
        ))}
      </nav>

      <LocalKaraokePlayer track={track} phrases={phrases} audio={audio} />

      {stage === "prepare" && (
        <section className="course-card course-start">
          <small>ETAPA 1 • ESCUTA COM PROPÓSITO</small>
          <h2>Faça uma primeira escuta sem interrupções</h2>
          <p>
            Acompanhe a letra, mas não tente traduzir palavra por palavra. Seu objetivo é reconhecer
            o som, perceber onde uma frase termina e identificar palavras que você já conhece.
          </p>
          <div className="learning-method">
            <span>
              <b>1</b> Ouça a música inteira
            </span>
            <span>
              <b>2</b> Marque mentalmente o que reconheceu
            </span>
            <span>
              <b>3</b> Depois treine pequenos trechos
            </span>
          </div>
          <button
            className={`listened-check ${listened ? "checked" : ""}`}
            onClick={() => setListened((current) => !current)}
          >
            <i>{listened ? "✓" : ""}</i>
            Já ouvi a música uma vez
          </button>
          <aside>
            <strong>Não precisa entender tudo agora</strong>
            <p>
              Aprender por música funciona melhor quando você volta ao mesmo trecho várias vezes. A
              compreensão aparece por camadas, não em uma única escuta.
            </p>
          </aside>
          <button className="button full" disabled={!listened} onClick={() => setStage("phrases")}>
            Treinar os trechos →
          </button>
        </section>
      )}

      {stage === "phrases" && currentPhrase && (
        <section className="course-card phrase-study">
          <div className="course-card-top">
            <span>
              <small>ETAPA 2 • ENTENDER DE VERDADE</small>
              <strong>
                {phraseIndex + 1} de {studyPhrases.length}
              </strong>
            </span>
            <em>Feedback salvo no aparelho</em>
          </div>
          <div className="phrase-training-steps">
            <span className="active">1. Escute</span>
            <span className={phraseRevealed ? "active" : ""}>2. Leia</span>
            <span className={meaningChecked ? "active" : ""}>3. Explique</span>
            <span className={meaningChecked ? "active" : ""}>4. Confira</span>
          </div>
          <SegmentPlayer
            audio={audio}
            start={currentPhrase.start}
            end={
              studyPhrases[phraseIndex + 1]?.start ??
              Math.min(audio.duration, currentPhrase.start + 9)
            }
            label="Ouvir este trecho"
          />
          {phraseRevealed ? (
            <blockquote>{currentPhrase.text}</blockquote>
          ) : (
            <button className="reveal-phrase" onClick={() => setPhraseRevealed(true)}>
              Já escutei • mostrar a letra
            </button>
          )}

          {phraseRevealed && !meaningChecked && (
            <div className="meaning-attempt">
              <label htmlFor={`meaning-${phraseIndex}`}>
                Com suas palavras, o que você acha que esse trecho quer dizer?
              </label>
              <textarea
                id={`meaning-${phraseIndex}`}
                placeholder="Não precisa traduzir perfeitamente. Escreva a ideia que você entendeu…"
                value={meaningAttempt}
                onChange={(event) => setMeaningAttempt(event.target.value)}
              />
              <div>
                <button
                  className="secondary"
                  onClick={() => {
                    setMeaningAttempt("não sei");
                    setMeaningChecked(true);
                  }}
                >
                  Ainda não sei
                </button>
                <button
                  className="primary"
                  disabled={!meaningAttempt.trim()}
                  onClick={() => setMeaningChecked(true)}
                >
                  Comparar meu entendimento
                </button>
              </div>
            </div>
          )}

          {meaningChecked && currentInsight && meaningResult && (
            <div className={`meaning-feedback ${meaningResult.status}`}>
              <div className="meaning-feedback-title">
                <span>
                  {meaningResult.status === "good"
                    ? "✓"
                    : meaningResult.status === "partial"
                      ? "≈"
                      : "↻"}
                </span>
                <div>
                  <strong>{meaningResult.title}</strong>
                  <p>{meaningResult.message}</p>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Sentido natural</dt>
                  <dd>{currentInsight.translation}</dd>
                </div>
                <div>
                  <dt>Por que significa isso?</dt>
                  <dd>{currentInsight.explanation}</dd>
                </div>
                {currentInsight.expression && (
                  <div>
                    <dt>Expressão para guardar</dt>
                    <dd>{currentInsight.expression}</dd>
                  </div>
                )}
              </dl>
              {phraseVocabulary.length > 0 && (
                <div className="course-vocabulary">
                  {phraseVocabulary.map((word) => (
                    <span key={word}>
                      <strong>{word}</strong>
                      <small>{vocabulary[word]}</small>
                    </span>
                  ))}
                </div>
              )}
              <p className="listen-again-note">
                Agora escute o trecho novamente: o cérebro já sabe qual sentido procurar no som.
              </p>
            </div>
          )}
          <div className="phrase-navigation">
            <button
              disabled={phraseIndex === 0}
              onClick={() => setPhraseIndex((current) => current - 1)}
            >
              ← Anterior
            </button>
            {phraseIndex === studyPhrases.length - 1 ? (
              <button
                className="primary"
                disabled={!meaningChecked}
                onClick={() => setStage("practice")}
              >
                Praticar o que aprendi →
              </button>
            ) : (
              <button
                className="primary"
                disabled={!meaningChecked}
                onClick={() => setPhraseIndex((current) => current + 1)}
              >
                Próximo trecho →
              </button>
            )}
          </div>
        </section>
      )}

      {stage === "practice" && currentQuestion && (
        <section className="course-card course-practice">
          <div className="course-card-top">
            <span>
              <small>ETAPA 3 • {currentQuestion.label}</small>
              <strong>
                {questionIndex + 1} de {questions.length}
              </strong>
            </span>
            <em>{currentQuestion.kind === "order" ? "Ordem e ritmo" : "Escuta ativa"}</em>
          </div>
          <div className="course-bar">
            <i style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} />
          </div>
          <h2>{currentQuestion.instruction}</h2>
          <SegmentPlayer
            audio={audio}
            start={currentQuestion.start}
            end={currentQuestion.end}
            label="Ouvir antes de responder"
          />
          <blockquote>{currentQuestion.prompt}</blockquote>
          {!checked && (
            <button
              className="exercise-hint-button"
              onClick={() => setShowExerciseHint((current) => !current)}
            >
              {showExerciseHint ? "Ocultar dica" : "Preciso de uma dica"}
            </button>
          )}
          {showExerciseHint && !checked && <p className="exercise-hint">{currentQuestion.hint}</p>}

          {currentQuestion.kind === "recognize" && (
            <div className="course-options">
              {currentQuestion.options.map((option) => {
                const optionSelected = selected === option;
                const className = checked
                  ? optionSelected
                    ? isCorrect
                      ? "correct"
                      : "incorrect"
                    : ""
                  : optionSelected
                    ? "selected"
                    : "";
                return (
                  <button
                    className={className}
                    disabled={checked}
                    key={option}
                    onClick={() => setSelected(option)}
                  >
                    <i>{optionSelected ? "●" : ""}</i>
                    {option}
                    {checked && optionSelected && isCorrect && <b>✓</b>}
                  </button>
                );
              })}
            </div>
          )}

          {currentQuestion.kind === "write" && (
            <div className={`write-answer ${checked ? (isCorrect ? "correct" : "incorrect") : ""}`}>
              <label htmlFor={`write-${questionIndex}`}>Escreva somente a palavra ausente</label>
              <input
                id={`write-${questionIndex}`}
                autoCapitalize="none"
                autoComplete="off"
                disabled={checked}
                placeholder="Digite o que você ouviu"
                spellCheck={false}
                value={typedAnswer}
                onChange={(event) => setTypedAnswer(event.target.value)}
              />
            </div>
          )}

          {currentQuestion.kind === "order" && (
            <div className="order-builder">
              <div className="order-answer-zone">
                {orderedChunks.length === 0 ? (
                  <span>Monte a frase aqui</span>
                ) : (
                  orderedChunks.map((chunk, index) => (
                    <button
                      disabled={checked}
                      key={`${chunk}-built-${index}`}
                      onClick={() => {
                        setOrderedChunks((current) =>
                          current.filter((_, position) => position !== index),
                        );
                        setAvailableChunks((current) => [...current, chunk]);
                      }}
                    >
                      {chunk}
                    </button>
                  ))
                )}
              </div>
              <div className="order-chunk-bank">
                {availableChunks.map((chunk, index) => (
                  <button
                    disabled={checked}
                    key={`${chunk}-available-${index}`}
                    onClick={() => {
                      setAvailableChunks((current) =>
                        current.filter((_, position) => position !== index),
                      );
                      setOrderedChunks((current) => [...current, chunk]);
                    }}
                  >
                    {chunk}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!checked ? (
            <button
              className="button full"
              disabled={!canVerify}
              onClick={() => {
                setChecked(true);
                if (isCorrect) {
                  setScore((current) => current + 1);
                } else {
                  setReviewItems((current) =>
                    current.some((item) => item.questionIndex === questionIndex)
                      ? current
                      : [
                          ...current,
                          {
                            questionIndex,
                            kind: currentQuestion.kind,
                            prompt: currentQuestion.prompt,
                            answer: currentQuestion.answer,
                          },
                        ],
                  );
                }
              }}
            >
              Verificar
            </button>
          ) : (
            <div className={`course-feedback ${isCorrect ? "success" : "retry"}`}>
              <strong>
                {isCorrect
                  ? "Muito bem! O som e a forma começaram a se conectar."
                  : "Ainda não — este item entrou na sua revisão."}
              </strong>
              <p>
                {isCorrect
                  ? `Resposta: “${currentQuestion.answer}”. Ouça mais uma vez para fixar o som.`
                  : "A resposta continua escondida por enquanto. Repita o áudio, use a dica e tente novamente."}
              </p>
              <button
                onClick={() => {
                  if (!isCorrect) {
                    setSelected(null);
                    setChecked(false);
                    setTypedAnswer("");
                    setOrderedChunks([]);
                    setAvailableChunks(currentQuestion.chunks);
                    setShowExerciseHint(true);
                    return;
                  }
                  if (questionIndex === questions.length - 1) {
                    const finalScore = score + 1;
                    window.localStorage.setItem(
                      `trilha-course-${track.id}`,
                      JSON.stringify({
                        block: 1,
                        score: finalScore,
                        completedAt: Date.now(),
                      }),
                    );
                    window.localStorage.setItem(
                      `trilha-music-review-${track.id}`,
                      JSON.stringify(reviewItems),
                    );
                    setStage("review");
                    return;
                  }
                  setQuestionIndex((current) => current + 1);
                  setSelected(null);
                  setChecked(false);
                  setShowExerciseHint(false);
                }}
              >
                {isCorrect
                  ? questionIndex === questions.length - 1
                    ? "Concluir bloco"
                    : "Próxima atividade"
                  : "Tentar novamente"}{" "}
                →
              </button>
            </div>
          )}
        </section>
      )}

      {stage === "review" && (
        <section className="course-card review-stage">
          <small>{"ETAPA 4 • REPETI\u00c7\u00c3O ESPAÇADA"}</small>
          <h2>
            {reviewItems.length > 0
              ? `${reviewItems.length} ponto${reviewItems.length > 1 ? "s" : ""} para fortalecer`
              : "Você concluiu sem erros nesta rodada"}
          </h2>
          <p>
            Estes itens ficam salvos no aparelho e voltarão em sessões futuras. Assim uma música não
            vira uma atividade isolada que você esquece depois.
          </p>
          {reviewItems.length > 0 && (
            <div className="review-list">
              {reviewItems.map((item) => (
                <article key={`${item.questionIndex}-${item.kind}`}>
                  <span>
                    {item.kind === "recognize"
                      ? "Ouvir"
                      : item.kind === "write"
                        ? "Escrever"
                        : "Ordem"}
                  </span>
                  <div>
                    <strong>{item.prompt}</strong>
                    <small>Resposta para revisar: {item.answer}</small>
                  </div>
                </article>
              ))}
            </div>
          )}
          <aside>
            <strong>Como a revisão funcionará no aplicativo completo</strong>
            <p>
              Amanhã, em três dias e depois em uma semana, os pontos difíceis voltam misturados com
              trechos de outras músicas.
            </p>
          </aside>
          <button className="button full" onClick={() => setStage("mastery")}>
            Ir para o desafio de domínio →
          </button>
        </section>
      )}

      {stage === "mastery" && (
        <section className="course-card mastery-stage">
          <small>ETAPA 5 • KARAOKÊ DE DOMÍNIO</small>
          <h2>Agora prove que a música começou a fazer parte do seu inglês</h2>
          <p>
            Use o player acima e faça shadowing: acompanhe o cantor em voz alta. Repita a música
            cinco vezes em momentos diferentes, tentando depender cada vez menos da leitura.
          </p>
          <div className="mastery-counter" aria-label="Repetições de domínio">
            {[0, 1, 2, 3, 4].map((position) => (
              <span className={position < masteryRepetitions ? "complete" : ""} key={position}>
                {position < masteryRepetitions ? "✓" : position + 1}
              </span>
            ))}
          </div>
          <button
            className="shadowing-button"
            disabled={masteryRepetitions >= 5}
            onClick={() => setMasteryRepetitions((current) => Math.min(5, current + 1))}
          >
            {masteryRepetitions >= 5
              ? "Cinco repetições concluídas"
              : "Concluí uma repetição acompanhando o cantor"}
          </button>
          <button
            className="button full"
            disabled={masteryRepetitions < 5}
            onClick={() => {
              window.localStorage.setItem(
                `trilha-music-mastery-${track.id}`,
                JSON.stringify({
                  repetitions: masteryRepetitions,
                  completedAt: Date.now(),
                }),
              );
              setStage("done");
            }}
          >
            Concluir jornada da música
          </button>
        </section>
      )}

      {stage === "done" && (
        <section className="course-complete">
          <span>✓</span>
          <small>{"MÚSICA CONCLUÍDA • REVIS\u00c3O PROGRAMADA"}</small>
          <h1>Você não apenas ouviu: entendeu, escreveu e produziu o inglês.</h1>
          <p>
            Resultado:{" "}
            <strong>
              {score} de {questions.length}
            </strong>
            . Os pontos que deram trabalho ficaram salvos para reaparecer nas próximas sessões.
          </p>
          <button className="button full" onClick={() => setStage("prepare")}>
            Ouvir e estudar novamente
          </button>
        </section>
      )}
    </div>
  );
}

function ResultView({ score, onSave }: { score: number; onSave: () => void }) {
  return (
    <section className="result-card">
      <span className="result-icon" aria-hidden="true">
        ✦
      </span>
      <small>{"SESS\u00c3O CONCLUÍDA"}</small>
      <h1>Você transformou música em aprendizado!</h1>
      <p>
        Você acertou{" "}
        <strong>
          {score} de {questions.length}
        </strong>{" "}
        atividades depois de ouvir e estudar frases completas.
      </p>
      <div className="result-list">
        <span>◖ Gravação humana ouvida</span>
        <span>◉ Letra acompanhada no tempo</span>
        <span>▣ Frases compreendidas</span>
      </div>
      <button className="button full" onClick={onSave}>
        Salvar progresso ✓
      </button>
    </section>
  );
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${rest}`;
}
