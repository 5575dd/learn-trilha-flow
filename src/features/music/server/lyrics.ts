type TimedLyric = {
  text?: string;
  start_time?: number;
};

type LyricsResult = {
  synced: boolean;
  plain: boolean;
  syncedLyrics: string | null;
  plainLyrics: string | null;
  source: string;
  duration: number | null;
  confidence: "exact" | "close" | "fallback";
};

type LrcLibRecord = {
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
};

function firstLyricStart(syncedLyrics: string | null | undefined) {
  if (!syncedLyrics) return 0;
  for (const line of syncedLyrics.split(/\r?\n/)) {
    const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*\S/);
    if (match) return Number(match[1]) * 60 + Number(match[2]);
  }
  return 0;
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function lrcTimestamp(milliseconds: number) {
  const safeMilliseconds = Math.max(0, milliseconds);
  const minutes = Math.floor(safeMilliseconds / 60_000);
  const seconds = Math.floor((safeMilliseconds % 60_000) / 1000);
  const hundredths = Math.floor((safeMilliseconds % 1000) / 10);
  return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}]`;
}

async function fetchFallbackLyrics(track: string, artist: string) {
  const params = new URLSearchParams({
    artist,
    song: track,
    timestamps: "true",
    fast: "true",
  });
  const response = await fetchWithTimeout(`https://wilooper-lyrica.hf.space/lyrics/?${params}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TrilhaMusicaLab/0.17 (https://trilha-musica-lab.vitormarcio1247.chatgpt.site)",
    },
  });
  if (!response.ok) return null;

  const result = (await response.json()) as {
    status?: string;
    data?: {
      lyrics?: string;
      plain_lyrics?: string;
      timed_lyrics?: TimedLyric[];
    };
  };
  if (result.status !== "success" || !result.data) return null;

  const timedLines = (result.data.timed_lyrics ?? [])
    .filter(
      (line): line is Required<Pick<TimedLyric, "text" | "start_time">> =>
        Boolean(line.text?.trim()) && Number.isFinite(line.start_time),
    )
    .map((line) => `${lrcTimestamp(line.start_time)}${line.text.trim()}`);
  const syncedLyrics = timedLines.length >= 3 ? timedLines.join("\n") : null;
  const plainLyrics =
    result.data.plain_lyrics?.trim() ||
    result.data.lyrics?.trim() ||
    timedLines.map((line) => line.replace(/^\[[^\]]+\]/, "")).join("\n") ||
    null;

  return {
    synced: Boolean(syncedLyrics),
    plain: Boolean(plainLyrics),
    syncedLyrics,
    plainLyrics,
    source: "fallback",
    duration: null,
    confidence: "fallback" as const,
  };
}

async function fetchPrimaryLyrics(
  track: string,
  artist: string,
  album: string,
  duration: string,
): Promise<LyricsResult | null> {
  const params = new URLSearchParams({
    track_name: track,
    artist_name: artist,
    album_name: album,
    duration,
  });
  const response = await fetchWithTimeout(`https://lrclib.net/api/get?${params}`, {
    headers: {
      "Lrclib-Client":
        "TrilhaMusicaLab/0.17 (https://trilha-musica-lab.vitormarcio1247.chatgpt.site)",
    },
  });
  if (!response.ok) return null;
  const lyrics = (await response.json()) as LrcLibRecord;
  return {
    synced: Boolean(lyrics.syncedLyrics?.trim()),
    plain: Boolean(lyrics.plainLyrics?.trim()),
    syncedLyrics: lyrics.syncedLyrics?.trim() || null,
    plainLyrics: lyrics.plainLyrics?.trim() || null,
    source: "primary",
    duration: Number.isFinite(lyrics.duration) ? lyrics.duration! : Number(duration),
    confidence: "exact",
  };
}

function comparable(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*(remaster|live|version|edit|mix)[^)]*\)/g, " ")
    .replace(/\b(feat|ft)\.?\s+.*$/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSimilarity(left: string | undefined, right: string) {
  const a = new Set(comparable(left).split(/\s+/).filter(Boolean));
  const b = new Set(comparable(right).split(/\s+/).filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / Math.max(a.size, b.size);
}

async function fetchSearchedLyrics(
  track: string,
  artist: string,
  album: string,
  duration: number,
  recording: string,
): Promise<LyricsResult | null> {
  const params = new URLSearchParams({
    track_name: track,
    artist_name: artist,
    album_name: album,
  });
  const response = await fetchWithTimeout(`https://lrclib.net/api/search?${params}`, {
    headers: {
      "Lrclib-Client":
        "TrilhaMusicaLab/0.17 (https://trilha-musica-lab.vitormarcio1247.chatgpt.site)",
    },
  });
  if (!response.ok) return null;
  const records = (await response.json()) as LrcLibRecord[];
  const normalizedRecording = comparable(recording);
  const audioOnlyRecording = /\b(official audio|audio only|topic)\b/.test(normalizedRecording);
  const videoRecording =
    !audioOnlyRecording &&
    /\b(official video|music video|video clip|videoclipe|vevo|youtube)\b/.test(normalizedRecording);
  const candidates = records
    .filter((record) => record.syncedLyrics?.trim())
    .map((record) => {
      const titleMatch = tokenSimilarity(record.trackName, track);
      const artistMatch = tokenSimilarity(record.artistName, artist);
      const albumMatch = tokenSimilarity(record.albumName, album);
      const durationDifference = Number.isFinite(record.duration)
        ? Math.abs(record.duration! - duration)
        : 99;
      const introStart = firstLyricStart(record.syncedLyrics);
      const score =
        titleMatch * 9 +
        artistMatch * 7 +
        albumMatch * 1.5 +
        (durationDifference <= 1.5
          ? 9
          : durationDifference <= 3.5
            ? 6
            : durationDifference <= 7
              ? 2
              : -10) +
        (videoRecording ? Math.min(45, introStart) * 0.5 : 0);
      return {
        record,
        titleMatch,
        artistMatch,
        durationDifference,
        introStart,
        score,
      };
    })
    .filter(
      (candidate) =>
        candidate.titleMatch >= 0.72 &&
        candidate.artistMatch >= 0.55 &&
        candidate.durationDifference <= 9,
    )
    .sort((left, right) => right.score - left.score);
  const selected = candidates[0];
  if (!selected) return null;
  return {
    synced: true,
    plain: Boolean(selected.record.plainLyrics?.trim()),
    syncedLyrics: selected.record.syncedLyrics?.trim() || null,
    plainLyrics: selected.record.plainLyrics?.trim() || null,
    source: "search",
    duration: selected.record.duration ?? null,
    confidence: selected.durationDifference <= 2 ? "exact" : "close",
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const track = url.searchParams.get("track");
  const artist = url.searchParams.get("artist");
  const album = url.searchParams.get("album");
  const duration = url.searchParams.get("duration");
  const recording = url.searchParams.get("recording") ?? "";

  if (!track || !artist || !album || !duration) {
    return Response.json({ error: "Dados incompletos." }, { status: 400 });
  }

  // A ordem é intencional: uma resposta alternativa rápida nunca pode vencer
  // a letra correspondente à gravação exata.
  const requestedDuration = Number(duration);
  // A busca compara todas as gravações disponíveis. Isso é essencial para
  // arquivos de videoclipe, que podem ter uma introdução diferente da faixa
  // do álbum mesmo quando título e artista são idênticos.
  const searched = await fetchSearchedLyrics(
    track,
    artist,
    album,
    requestedDuration,
    recording,
  ).catch(() => null);
  const primary = searched?.synced
    ? null
    : await fetchPrimaryLyrics(track, artist, album, duration).catch(() => null);
  const fallback =
    primary?.synced || searched?.synced
      ? null
      : await fetchFallbackLyrics(track, artist).catch(() => null);
  const result = searched?.synced ? searched : primary?.synced ? primary : fallback;
  if (result) {
    return Response.json(result, {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  }

  return Response.json(
    { error: "Os serviços de letra sincronizada estão temporariamente indisponíveis." },
    { status: 502 },
  );
}
