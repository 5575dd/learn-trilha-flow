import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DualReviewRepository,
  SupabaseReviewRepository,
} from "@/data/repositories/ReviewRepository";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

function queryClient(rows: unknown[]) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "lte"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.order = vi.fn(async () => ({ data: rows, error: null }));
  return {
    client: { from: vi.fn(() => builder) } as unknown as SupabaseClient,
    builder,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "user-a",
    questao_id: 1,
    acertos_seguidos: 0,
    total_tentativas: 1,
    total_acertos: 0,
    proxima_revisao_em: "2026-07-25T12:00:00.000Z",
    ultima_resposta_em: "2026-07-25T08:00:00.000Z",
    ultimo_attempt_id: "attempt-1",
    ...overrides,
  };
}

const localAttempt: AttemptRecord = {
  attemptId: "local-1",
  questionId: 1,
  clientCreatedAt: Date.parse("2026-07-25T08:00:00.000Z"),
  timeMs: 1,
  result: {
    status: "incorrect",
    studentAnswerDisplay: "",
    correctAnswerDisplay: "",
    normalizedStudentAnswer: "",
    normalizedCorrectAnswer: "",
    explanation: "",
    diagnosticCode: "",
    metadata: {},
  },
};

describe("review repositories", () => {
  it("queries and validates only the authenticated user's due rows", async () => {
    const { client, builder } = queryClient([row()]);
    const reviews = await new SupabaseReviewRepository(() => client).listDue(
      "user-a",
      Date.parse("2026-07-25T12:00:00.000Z"),
    );
    expect(reviews[0]).toMatchObject({ questionId: 1, totalAttempts: 1 });
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(builder.lte).toHaveBeenCalled();
  });

  it("rejects a row from another user", async () => {
    const { client } = queryClient([row({ user_id: "user-b" })]);
    await expect(
      new SupabaseReviewRepository(() => client).listByUser("user-a"),
    ).rejects.toMatchObject({ retryable: false });
  });

  it("falls back to a local projection when remote review loading fails", async () => {
    const repository = new DualReviewRepository(
      async () => [localAttempt],
      {
        listByUser: vi.fn(async () => {
          throw new Error("network");
        }),
      } as unknown as SupabaseReviewRepository,
      true,
      () => true,
      () => [],
    );
    const result = await repository.listDue("user-a", Date.parse("2026-07-25T12:00:00.000Z"));
    expect(result.localOnly).toBe(true);
    expect(result.reviews).toHaveLength(1);
  });
});
