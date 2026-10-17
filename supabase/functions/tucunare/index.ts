import {
  MAX_BODY_BYTES,
  MODEL,
  RequestError,
  cleanText,
  geminiBody,
  lessonContext,
  materialKeyForTitle,
  withMaterials,
  parseChat,
  parseGemini,
  readBoundedBody,
  type ChatRequest,
  type LessonContext,
} from "./core.ts";

type Runtime = {
  env: { get: (key: string) => string | undefined };
  serve: (handler: (request: Request) => Promise<Response>) => unknown;
};
declare const Deno: Runtime;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const PUBLIC_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_KEY = Deno.env.get("TUCUNARE_GEMINI_API_KEY") ?? "";
const ALLOWED_ORIGINS = new Set([
  "https://learn-trilha-flow.lovable.app",
  "http://localhost:5188",
  "http://127.0.0.1:5188",
]);

const adminHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function database(path: string, init?: RequestInit) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders, ...init?.headers },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new RequestError(
      503,
      "database_unavailable",
      "A Tucunare esta indisponivel por alguns instantes.",
    );
  return response.status === 204 ? null : response.json();
}

async function contextFor(input: ChatRequest, jwt: string): Promise<LessonContext> {
  const headers = { apikey: PUBLIC_KEY, Authorization: jwt };
  let lessonId = input.lessonId;
  let question: unknown;
  if (input.questionId) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/questoes?${new URLSearchParams({
        select: "id,aula_id,enunciado,opcoes,metadados,proxima_revisao_em",
        id: `eq.${input.questionId}`,
        limit: "1",
      })}`,
      { headers, signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok)
      throw new RequestError(
        503,
        "context_unavailable",
        "Nao consegui consultar a atividade agora.",
      );
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (
      !row ||
      (row.proxima_revisao_em && Date.parse(row.proxima_revisao_em) > Date.now()) ||
      (lessonId && row.aula_id !== lessonId)
    ) {
      throw new RequestError(
        400,
        "context_unavailable",
        "Esta atividade nao esta disponivel para consulta.",
      );
    }
    question = row;
    lessonId = row.aula_id;
  }
  const appendMaterials = async (context: LessonContext, key?: string) => {
    if (!key) return context;
    const materials = await database(
      `tucunare_materials?${new URLSearchParams({
        select: "kind,title,source_url,page,body",
        material_key: `eq.${key}`,
        order: "page.asc.nullslast,id.asc",
        limit: "50",
      })}`,
    );
    return withMaterials(context, materials, input.message);
  };
  if (!lessonId)
    return appendMaterials(
      { text: "Nenhuma aula selecionada. Responda a duvida geral de ingles.", sources: [] },
      input.materialKey,
    );
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/aulas?${new URLSearchParams({
      select: "id,titulo,tema,dados_completos",
      id: `eq.${lessonId}`,
      limit: "1",
    })}`,
    { headers, signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok)
    throw new RequestError(503, "context_unavailable", "Nao consegui consultar a aula agora.");
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows[0])
    throw new RequestError(404, "context_unavailable", "Aula nao encontrada.");
  return appendMaterials(
    lessonContext(rows[0], question),
    input.materialKey ?? materialKeyForTitle(rows[0].titulo),
  );
}

const quotaMessages: Record<string, string> = {
  daily_limit:
    "Voce chegou as 30 perguntas de hoje. A cota renova diariamente pelo horario do Pacifico.",
  project_limit:
    "A capacidade gratuita da Tucunare foi usada por hoje. Suas atividades continuam disponiveis.",
  minute_limit: "Vamos dar uma pausa de um minuto antes da proxima pergunta.",
  lesson_processing:
    "Uma nova aula esta sendo analisada. A Tucunare vai aguardar para preservar a cota gratuita.",
  request_conflict: "Esta pergunta foi modificada. Envie uma nova mensagem.",
  in_progress: "Esta pergunta ainda esta sendo respondida. Aguarde alguns instantes.",
  previous_failed: "Esta tentativa nao terminou. Envie uma nova pergunta para tentar novamente.",
};

export async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get("Origin");
  const cors: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) cors["Access-Control-Allow-Origin"] = origin;
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    Response.json(body, { status, headers: { ...cors, ...extra } });
  if (origin && !ALLOWED_ORIGINS.has(origin))
    return json({ code: "origin_denied", message: "Origem nao autorizada." }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST")
    return json({ code: "method_not_allowed", message: "Metodo nao permitido." }, 405);
  let reservation: { userId: string; requestId: string } | undefined;
  let remaining: number | undefined;
  try {
    if (!SUPABASE_URL || !PUBLIC_KEY || !SERVICE_KEY || !GEMINI_KEY) {
      throw new RequestError(
        503,
        "not_configured",
        "A Tucunare ainda esta sendo preparada. Suas aulas continuam disponiveis.",
      );
    }
    const authorization = request.headers.get("Authorization") ?? "";
    if (!/^Bearer [^\s]+$/.test(authorization)) {
      throw new RequestError(
        401,
        "unauthorized",
        "Entre na sua conta para conversar com a Tucunare.",
      );
    }
    const auth = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: PUBLIC_KEY, Authorization: authorization },
      signal: AbortSignal.timeout(8000),
    });
    const user = auth.ok ? await auth.json() : null;
    if (!user?.id || user.is_anonymous)
      throw new RequestError(401, "unauthorized", "Sua sessao expirou. Entre novamente.");
    if (!request.headers.get("Content-Type")?.includes("application/json")) {
      throw new RequestError(415, "invalid_content_type", "Formato de mensagem invalido.");
    }
    if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BODY_BYTES) {
      throw new RequestError(413, "message_too_large", "A mensagem ficou grande demais.");
    }
    const raw = await readBoundedBody(request);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new RequestError(400, "invalid_json", "Mensagem invalida.");
    }
    if (body?.action === "status") {
      const quota = await database("rpc/tucunare_reserve", {
        method: "POST",
        body: JSON.stringify({ p_user_id: user.id }),
      });
      return json({ ...quota, model: MODEL, configured: true });
    }
    const input = parseChat(body);
    const context = await contextFor(input, authorization);
    const fingerprint = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(input))),
      ),
    )
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    const quota = await database("rpc/tucunare_reserve", {
      method: "POST",
      body: JSON.stringify({
        p_user_id: user.id,
        p_request_id: input.requestId,
        p_fingerprint: fingerprint,
      }),
    });
    if (!quota.allowed)
      return json(
        {
          code: quota.reason,
          message: quotaMessages[quota.reason] ?? "Aguarde antes de tentar novamente.",
          remaining: quota.remaining,
          retryAfter: quota.retry_after,
        },
        429,
        { "Retry-After": String(quota.retry_after ?? 60) },
      );
    if (quota.cached) return json({ ...quota.response, remaining: quota.remaining });
    reservation = { userId: user.id, requestId: input.requestId };
    remaining = quota.remaining;
    // No tools, paid fallback, web grounding or automatic retry: one bounded model call.
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
        body: JSON.stringify(geminiBody(input, context)),
        signal: AbortSignal.timeout(45_000),
      },
    );
    if (!aiResponse.ok) {
      if (aiResponse.status === 429)
        throw new RequestError(
          429,
          "provider_limit",
          "O Google pediu uma pausa na cota gratuita. Tente novamente mais tarde.",
        );
      throw new RequestError(
        503,
        "provider_unavailable",
        "Nao consegui responder agora. Suas atividades continuam disponiveis.",
      );
    }
    const result = parseGemini(await aiResponse.json());
    const response = {
      answer: result.answer,
      sources: context.sources,
      remaining: quota.remaining,
      model: MODEL,
    };
    await database(
      `tucunare_requests?${new URLSearchParams({ user_id: `eq.${user.id}`, request_id: `eq.${input.requestId}` })}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "completed",
          response,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
        }),
      },
    );
    return json(response);
  } catch (error) {
    if (reservation) {
      try {
        await database(
          `tucunare_requests?${new URLSearchParams({ user_id: `eq.${reservation.userId}`, request_id: `eq.${reservation.requestId}` })}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ status: "failed" }),
          },
        );
      } catch {
        /* A reservation remains counted if the database is unavailable. */
      }
    }
    const failure =
      error instanceof RequestError
        ? error
        : new RequestError(
            503,
            "temporarily_unavailable",
            "A conexao nao respondeu a tempo. Tente novamente mais tarde.",
          );
    console.error("tucunare_request_failed", failure.code);
    return json(
      {
        code: failure.code,
        message: cleanText(failure.message, 300),
        remaining,
        ...(failure.status === 429 ? { retryAfter: 60 } : {}),
      },
      failure.status,
      failure.status === 429 ? { "Retry-After": "60" } : {},
    );
  }
}

Deno.serve(handler);
