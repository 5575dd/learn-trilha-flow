export type LyricsStatus = "synced" | "plain" | "missing" | "error";

export type SpotifyTrack = {
  id: string;
  name: string;
  artist: string;
  album: string;
  durationMs: number;
  imageUrl: string | null;
  spotifyUrl: string;
  lyricsStatus: LyricsStatus;
};

export type SpotifyPlaylistResult = {
  name: string;
  snapshotId: string;
  spotifyUrl: string;
  tracks: SpotifyTrack[];
};

export type SpotifyLyrics = {
  synced: boolean;
  plain: boolean;
  syncedLyrics: string | null;
  plainLyrics: string | null;
  source?: string;
  duration?: number | null;
  confidence?: "exact" | "close" | "fallback";
};

type StoredToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

const clientId = "40c2f7b6290f465ea42fb5ea0b934689";
const playlistId = "4Sg6TXWLWHm86YWSyKQJLO";
const tokenKey = "trilha-spotify-token-v1";
const verifierKey = "trilha-spotify-verifier-v1";
const stateKey = "trilha-spotify-state-v1";
const spotifyRedirectUri =
  "https://trilha-musica-lab.vitormarcio1247.chatgpt.site/api/spotify/callback";
const superAppStatePrefix = "trilha-super-app.";

function randomString(length = 64) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => possible[value % possible.length]).join("");
}

function base64Url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function codeChallenge(verifier: string) {
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return base64Url(digest);
  }

  const response = await fetch(`/api/spotify/pkce?verifier=${encodeURIComponent(verifier)}`);
  if (!response.ok) {
    throw new Error("Não foi possível iniciar a conexão segura com o Spotify.");
  }
  const result = (await response.json()) as { challenge: string };
  return result.challenge;
}

function redirectUri() {
  return spotifyRedirectUri;
}

function readToken(): StoredToken | null {
  try {
    const stored = window.localStorage.getItem(tokenKey);
    return stored ? (JSON.parse(stored) as StoredToken) : null;
  } catch {
    window.localStorage.removeItem(tokenKey);
    return null;
  }
}

function saveToken(
  payload: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  },
  previousRefreshToken?: string,
) {
  const token: StoredToken = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? previousRefreshToken,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
  window.localStorage.setItem(tokenKey, JSON.stringify(token));
  return token;
}

async function exchangeToken(body: URLSearchParams) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error("Não foi possível concluir a autorização com o Spotify.");
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

export function hasSpotifySession() {
  return Boolean(readToken());
}

export function disconnectSpotify() {
  window.localStorage.removeItem(tokenKey);
  window.localStorage.removeItem(verifierKey);
  window.localStorage.removeItem(stateKey);
}

export async function beginSpotifyLogin() {
  const verifier = randomString();
  const state = `${superAppStatePrefix}${randomString(32)}`;
  const challenge = await codeChallenge(verifier);

  window.localStorage.setItem(verifierKey, verifier);
  window.localStorage.setItem(stateKey, state);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    scope: "playlist-read-private playlist-read-collaborative user-read-private",
  });

  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

export async function completeSpotifyLogin() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  const code = params.get("code");
  const returnedState = params.get("state");
  const expectedState = window.localStorage.getItem(stateKey);
  const verifier = window.localStorage.getItem(verifierKey);

  if (error) {
    throw new Error("A conexão com o Spotify foi cancelada.");
  }
  if (!code) return false;
  if (!verifier || !expectedState || returnedState !== expectedState) {
    throw new Error("A resposta do Spotify não pôde ser validada. Tente conectar novamente.");
  }

  const payload = await exchangeToken(
    new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  );
  saveToken(payload);
  window.localStorage.removeItem(verifierKey);
  window.localStorage.removeItem(stateKey);
  window.history.replaceState({}, "", window.location.pathname);
  return true;
}

async function accessToken() {
  const stored = readToken();
  if (!stored) throw new Error("Conecte sua conta do Spotify primeiro.");
  if (stored.expiresAt > Date.now() + 60_000) return stored.accessToken;
  if (!stored.refreshToken) {
    disconnectSpotify();
    throw new Error("Sua sessão expirou. Conecte o Spotify novamente.");
  }

  const payload = await exchangeToken(
    new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
    }),
  );
  return saveToken(payload, stored.refreshToken).accessToken;
}

async function lyricsStatus(track: {
  name: string;
  artist: string;
  album: string;
  durationMs: number;
}): Promise<LyricsStatus> {
  const params = new URLSearchParams({
    track: track.name,
    artist: track.artist,
    album: track.album,
    duration: String(Math.round(track.durationMs / 1000)),
  });

  try {
    const response = await fetch(`/api/lyrics?${params}`);
    if (response.status === 404) return "missing";
    if (!response.ok) return "error";
    const result = (await response.json()) as {
      synced: boolean;
      plain: boolean;
    };
    if (result.synced) return "synced";
    if (result.plain) return "plain";
    return "missing";
  } catch {
    return "error";
  }
}

export async function fetchTrackLyrics(
  track: SpotifyTrack,
  durationMs = track.durationMs,
  recordingHint = "",
): Promise<SpotifyLyrics> {
  const params = new URLSearchParams({
    track: track.name,
    artist: track.artist,
    album: track.album,
    duration: String(Math.round(durationMs / 1000)),
    recording: recordingHint,
  });
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  try {
    response = await fetch(`/api/lyrics?${params}`, {
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("A busca da letra demorou demais. Tente novamente.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  if (response.status === 404) {
    throw new Error("A letra desta música não foi encontrada.");
  }
  if (!response.ok) {
    throw new Error("Não foi possível preparar esta música agora.");
  }
  return (await response.json()) as SpotifyLyrics;
}

export async function fetchLearningPlaylist(previous?: {
  snapshotId: string;
  tracks: SpotifyTrack[];
}): Promise<SpotifyPlaylistResult> {
  const token = await accessToken();
  const headers = { Authorization: `Bearer ${token}` };
  const playlistResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
    headers,
  });

  if (playlistResponse.status === 401) {
    disconnectSpotify();
    throw new Error("Sua sessão do Spotify expirou. Conecte novamente.");
  }
  if (playlistResponse.status === 403) {
    throw new Error("O Spotify não liberou esta playlist. Confirme que ela pertence à sua conta.");
  }
  if (!playlistResponse.ok) {
    throw new Error("Não foi possível ler sua playlist agora.");
  }

  const playlist = (await playlistResponse.json()) as {
    name: string;
    snapshot_id: string;
    external_urls?: { spotify?: string };
  };
  const spotifyUrl =
    playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlistId}`;

  if (
    previous?.snapshotId &&
    previous.snapshotId === playlist.snapshot_id &&
    previous.tracks.length > 0
  ) {
    return {
      name: playlist.name,
      snapshotId: playlist.snapshot_id,
      spotifyUrl,
      tracks: previous.tracks,
    };
  }

  const itemsResponse = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/items?market=BR&limit=50`,
    { headers },
  );
  if (itemsResponse.status === 401) {
    disconnectSpotify();
    throw new Error("Sua sessão do Spotify expirou. Conecte novamente.");
  }
  if (itemsResponse.status === 403) {
    throw new Error(
      "O Spotify não liberou as músicas. Confirme que a playlist pertence à sua conta.",
    );
  }
  if (!itemsResponse.ok) {
    throw new Error("Não foi possível ler as músicas da playlist agora.");
  }

  const items = (await itemsResponse.json()) as {
    items?: Array<{
      item?: {
        id?: string;
        name?: string;
        duration_ms?: number;
        artists?: Array<{ name?: string }>;
        album?: {
          name?: string;
          images?: Array<{ url?: string }>;
        };
        external_urls?: { spotify?: string };
      };
      track?: {
        id?: string;
        name?: string;
        duration_ms?: number;
        artists?: Array<{ name?: string }>;
        album?: {
          name?: string;
          images?: Array<{ url?: string }>;
        };
        external_urls?: { spotify?: string };
      };
    }>;
  };

  const basicTracks = (items.items ?? [])
    .map((entry) => entry.item ?? entry.track)
    .filter((track): track is NonNullable<typeof track> => Boolean(track?.id && track.name))
    .map((track) => ({
      id: track.id as string,
      name: track.name as string,
      artist:
        track.artists
          ?.map((artist) => artist.name)
          .filter(Boolean)
          .join(", ") || "Artista não informado",
      album: track.album?.name || "Álbum não informado",
      durationMs: track.duration_ms ?? 0,
      imageUrl: track.album?.images?.[0]?.url ?? null,
      spotifyUrl: track.external_urls?.spotify ?? `https://open.spotify.com/track/${track.id}`,
    }));

  const tracks: SpotifyTrack[] = [];
  for (const track of basicTracks) {
    const cached = previous?.tracks.find((item) => item.id === track.id);
    tracks.push({
      ...track,
      lyricsStatus: cached?.lyricsStatus ?? (await lyricsStatus(track)),
    });
    if (cached) continue;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  return {
    name: playlist.name,
    snapshotId: playlist.snapshot_id,
    spotifyUrl,
    tracks,
  };
}
