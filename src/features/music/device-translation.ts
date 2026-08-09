type DeviceTranslationReply = {
  quotaFinished?: boolean;
  responseData?: { translatedText?: string };
  responseStatus?: number;
};

type GoogleTranslationReply = Array<Array<Array<string | null> | null> | string | null>;

type DeviceTranslationOptions = {
  concurrency?: number;
  fetcher?: typeof fetch;
  onTranslation?: (line: string, translation: string) => void;
};

function decodeTranslation(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function isUsefulTranslation(source: string, translated?: string | null) {
  if (!translated?.trim()) return false;
  const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
  return normalize(source) !== normalize(translated);
}

async function fetchWithTimeout(fetcher: typeof fetch, url: string, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function translateWithMyMemory(line: string, fetcher: typeof fetch) {
  const params = new URLSearchParams({ q: line, langpair: "en|pt-BR" });
  try {
    const response = await fetchWithTimeout(
      fetcher,
      `https://api.mymemory.translated.net/get?${params}`,
    );
    if (!response.ok) return null;
    const result = (await response.json()) as DeviceTranslationReply;
    if (result.quotaFinished || (result.responseStatus && result.responseStatus !== 200)) {
      return null;
    }
    const translated = decodeTranslation(result.responseData?.translatedText?.trim() ?? "");
    return isUsefulTranslation(line, translated) ? translated : null;
  } catch {
    return null;
  }
}

async function translateWithGoogle(line: string, fetcher: typeof fetch) {
  const params = new URLSearchParams({
    client: "gtx",
    sl: "auto",
    tl: "pt-BR",
    dt: "t",
    q: line,
  });
  try {
    const response = await fetchWithTimeout(
      fetcher,
      `https://translate.googleapis.com/translate_a/single?${params}`,
    );
    if (!response.ok || response.redirected) return null;
    const result = (await response.json()) as GoogleTranslationReply;
    const segments = Array.isArray(result[0]) ? result[0] : [];
    const translated = segments
      .map((segment) => (Array.isArray(segment) ? segment[0] : ""))
      .filter((segment): segment is string => typeof segment === "string")
      .join("")
      .trim();
    return isUsefulTranslation(line, translated) ? translated : null;
  } catch {
    return null;
  }
}

export async function translateLineOnDevice(line: string, fetcher: typeof fetch = fetch) {
  return (await translateWithMyMemory(line, fetcher)) ?? (await translateWithGoogle(line, fetcher));
}

export async function translateLinesOnDevice(
  lines: string[],
  options: DeviceTranslationOptions = {},
) {
  const uniqueLines = Array.from(new Set(lines.map((line) => line.trim()))).filter(Boolean);
  const translations: Record<string, string> = {};
  const fetcher = options.fetcher ?? fetch;
  const workerCount = Math.max(1, Math.min(options.concurrency ?? 2, uniqueLines.length));
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < uniqueLines.length) {
      const line = uniqueLines[nextIndex];
      nextIndex += 1;
      const translation = await translateLineOnDevice(line, fetcher);
      if (!translation) continue;
      translations[line] = translation;
      options.onTranslation?.(line, translation);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return translations;
}
