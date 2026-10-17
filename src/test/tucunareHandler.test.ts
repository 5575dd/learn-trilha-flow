import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";

const userId = "550e8400-e29b-41d4-a716-446655440001";
const requestId = "550e8400-e29b-41d4-a716-446655440000";
let handler: (request: Request) => Promise<Response>;
let quota: Record<string, unknown>;
let providerStatus: number;
let anonymous: boolean;
let questionRow: Record<string, unknown>;
const calls: { url: string; init?: RequestInit }[] = [];
const json = (value: unknown, status = 200) => Response.json(value, { status });

beforeAll(async () => {
  vi.stubGlobal("Deno", {
    env: {
      get: (key: string) =>
        ({
          SUPABASE_URL: "https://test.supabase.co",
          SUPABASE_ANON_KEY: "public-test",
          SUPABASE_SERVICE_ROLE_KEY: "server-test",
          TUCUNARE_GEMINI_API_KEY: "gemini-test",
        })[key],
    },
    serve: vi.fn(),
  });
  handler = (await import("../../supabase/functions/tucunare/index")).handler;
});
beforeEach(() => {
  calls.length = 0;
  quota = { allowed: true, remaining: 29 };
  providerStatus = 200;
  anonymous = false;
  questionRow = { id: 4, aula_id: 19, proxima_revisao_em: "2099-01-01" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/auth/v1/user")) return json({ id: userId, is_anonymous: anonymous });
      if (url.includes("rpc/tucunare_reserve")) return json(quota);
      if (url.includes("/questoes?")) return json([questionRow]);
      if (url.includes("/aulas?"))
        return json([{ id: 19, titulo: "Unit 2 - Lesson 3", dados_completos: {} }]);
      if (url.includes("/tucunare_materials?"))
        return json([
          {
            kind: "book",
            title: "Module 2 p.134",
            page: 134,
            source_url: "https://lms-wo.com/mod/url/view.php?id=11202",
            body: "Daily routines",
          },
        ]);
      if (url.includes("generativelanguage"))
        return json(
          {
            candidates: [
              {
                finishReason: "STOP",
                content: { parts: [{ text: "Use does com he, she e it." }] },
              },
            ],
            usageMetadata: { promptTokenCount: 20 },
          },
          providerStatus,
        );
      if (url.includes("/tucunare_requests?")) return new Response(null, { status: 204 });
      throw new Error("Unexpected test request");
    }),
  );
});
afterAll(() => vi.unstubAllGlobals());
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://test/functions/v1/tucunare", {
    method: "POST",
    headers: {
      Authorization: "Bearer user-token",
      "Content-Type": "application/json",
      Origin: "https://learn-trilha-flow.lovable.app",
      ...headers,
    },
    body: JSON.stringify(body),
  });
const valid = { requestId, message: "Quando uso does?" };
const aiCalls = () => calls.filter((call) => call.url.includes("generativelanguage"));

describe("Tucunare server boundaries", () => {
  it("sends the visible question only after checking access to its real identifier", async () => {
    questionRow = { id: 4, aula_id: 19, tipo: "CORRECTION", enunciado: "Correct the sentence" };
    const response = await handler(
      request({
        ...valid,
        lessonId: 19,
        questionId: 4,
        questionView: '{"frase_original":"She go to work."}',
      }),
    );
    expect(response.status).toBe(200);
    expect(aiCalls()).toHaveLength(1);
    expect(JSON.parse(String(aiCalls()[0].init?.body)).contents.at(-1).parts[0].text).toContain(
      "She go to work.",
    );
    expect(calls.find((call) => call.url.includes("/questoes?"))?.init?.headers).toMatchObject({
      Authorization: "Bearer user-token",
    });
  });
  it("does not accept a visible snapshot as permission to access a locked or mismatched question", async () => {
    expect(
      (
        await handler(
          request({ ...valid, lessonId: 19, questionId: 4, questionView: "Visible data" }),
        )
      ).status,
    ).toBe(400);
    questionRow = { id: 4, aula_id: 18 };
    expect(
      (
        await handler(
          request({ ...valid, lessonId: 19, questionId: 4, questionView: "Visible data" }),
        )
      ).status,
    ).toBe(400);
    expect(aiCalls()).toHaveLength(0);
  });
  it("checks authentication and rejects anonymous sessions before using AI", async () => {
    anonymous = true;
    expect((await handler(request(valid))).status).toBe(401);
    expect(aiCalls()).toHaveLength(0);
  });
  it("rejects foreign origins before consulting accounts", async () => {
    expect((await handler(request(valid, { Origin: "https://evil.example" }))).status).toBe(403);
    expect(calls).toHaveLength(0);
  });
  it("returns status without reserving or calling AI", async () => {
    expect((await handler(request({ action: "status" }))).status).toBe(200);
    expect(JSON.parse(String(calls.at(-1)?.init?.body))).toEqual({ p_user_id: userId });
    expect(aiCalls()).toHaveLength(0);
  });
  it("does not reveal unreleased activities or consume quota for them", async () => {
    expect((await handler(request({ ...valid, questionId: 4 }))).status).toBe(400);
    expect(calls.some((call) => call.url.includes("tucunare_reserve"))).toBe(false);
  });
  it("uses private course text and user-scoped lesson access with exactly one model call", async () => {
    const response = await handler(request({ ...valid, lessonId: 19 }));
    expect(response.status).toBe(200);
    expect(aiCalls()).toHaveLength(1);
    const model = JSON.parse(String(aiCalls()[0].init?.body));
    expect(model.contents.at(-1).parts[0].text).toContain("Daily routines");
    expect(calls.find((call) => call.url.includes("/aulas?"))?.init?.headers).toMatchObject({
      Authorization: "Bearer user-token",
    });
    expect(
      calls.find((call) => call.url.includes("tucunare_materials"))?.init?.headers,
    ).toMatchObject({ Authorization: "Bearer server-test" });
    expect(calls.at(-1)?.url).toContain(`user_id=eq.${userId}`);
  });
  it("serves a cached duplicate without another model call", async () => {
    quota = { allowed: true, cached: true, remaining: 28, response: { answer: "Cached" } };
    expect(await (await handler(request(valid))).json()).toMatchObject({ answer: "Cached" });
    expect(aiCalls()).toHaveLength(0);
  });
  it.each(["daily_limit", "minute_limit", "lesson_processing", "project_limit", "in_progress"])(
    "honors %s without AI",
    async (reason) => {
      quota = { allowed: false, reason, retry_after: 60 };
      const response = await handler(request(valid));
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("60");
      expect(aiCalls()).toHaveLength(0);
    },
  );
  it("does not retry provider quota failures and records the failed reservation", async () => {
    providerStatus = 429;
    expect((await handler(request(valid))).status).toBe(429);
    expect(aiCalls()).toHaveLength(1);
    expect(JSON.parse(String(calls.at(-1)?.init?.body))).toEqual({ status: "failed" });
  });
});
