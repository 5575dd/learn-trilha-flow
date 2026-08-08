type TranslationReply = {
  responseData?: { translatedText?: string };
  responseStatus?: number;
};

type GoogleTranslationReply = Array<Array<Array<string | null> | null> | string | null>;

const memoryCache = new Map<string, string>();

async function fetchWithTimeout(url: string, timeoutMs = 4_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function discardResponse(response: Response) {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch {
    // A resposta já pode ter sido encerrada pelo provedor.
  }
}

async function translateWithGoogle(line: string) {
  const googleParams = new URLSearchParams({
    client: "gtx",
    sl: "auto",
    tl: "pt-BR",
    dt: "t",
    q: line,
  });
  try {
    const googleResponse = await fetchWithTimeout(
      `https://translate.googleapis.com/translate_a/single?${googleParams}`,
    );
    if (!googleResponse.ok) {
      await discardResponse(googleResponse);
      return null;
    }
    const result = (await googleResponse.json()) as GoogleTranslationReply;
    const segments = Array.isArray(result[0]) ? result[0] : [];
    return (
      segments
        .map((segment) => (Array.isArray(segment) ? segment[0] : ""))
        .filter((segment): segment is string => typeof segment === "string")
        .join("")
        .trim() || null
    );
  } catch {
    // A fonte de apoio abaixo recebe uma tentativa nova e independente.
  }
  return null;
}

async function translateWithMyMemory(line: string) {
  const fallbackParams = new URLSearchParams({
    q: line,
    langpair: "en|pt-BR",
  });
  try {
    const fallbackResponse = await fetchWithTimeout(
      `https://api.mymemory.translated.net/get?${fallbackParams}`,
    );
    if (!fallbackResponse.ok) {
      await discardResponse(fallbackResponse);
      return null;
    }
    const fallback = (await fallbackResponse.json()) as TranslationReply;
    return fallback.responseData?.translatedText?.trim() ?? null;
  } catch {
    return null;
  }
}

async function translateLine(line: string) {
  const cached = memoryCache.get(line);
  if (cached) return cached;
  const translated = (await translateWithGoogle(line)) ?? (await translateWithMyMemory(line));
  if (!translated || translated.toLowerCase() === line.toLowerCase()) return null;
  memoryCache.set(line, translated);
  return translated;
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    lines?: unknown;
  } | null;
  const lines = Array.isArray(payload?.lines)
    ? Array.from(
        new Set(
          payload.lines
            .filter((line): line is string => typeof line === "string")
            .map((line) => line.trim())
            .filter(Boolean),
        ),
      ).slice(0, 4)
    : [];
  if (lines.length === 0) {
    return Response.json({ error: "Nenhum verso recebido." }, { status: 400 });
  }

  const translations: Record<string, string> = {};
  // Cloudflare limita respostas externas simultâneas. A fila sequencial evita
  // que uma música abra vários corpos de resposta ao mesmo tempo e bloqueie o
  // Worker antes que eles sejam consumidos ou cancelados.
  for (const line of lines) {
    const translation = await translateLine(line);
    if (translation) translations[line] = translation;
  }

  const failedLines = lines.filter((line) => !translations[line]);
  return Response.json(
    { translations, failedLines, retryable: failedLines.length > 0 },
    {
      status: Object.keys(translations).length === 0 ? 503 : 200,
      headers: {
        "Cache-Control": failedLines.length === 0 ? "public, max-age=86400" : "no-store",
      },
    },
  );
}
