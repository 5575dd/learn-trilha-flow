import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SupabaseAttemptRepository,
  attemptSerialization,
} from "@/data/repositories/SupabaseAttemptRepository";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

const attempt: AttemptRecord = {
  attemptId: "attempt-stable",
  questionId: 42,
  timeMs: 1_250,
  clientCreatedAt: Date.parse("2026-07-25T12:00:00.000Z"),
  sessionMode: "quick",
  result: {
    status: "correct",
    studentAnswerDisplay: "student answer",
    correctAnswerDisplay: "server canonical answer",
    normalizedStudentAnswer: "student answer",
    normalizedCorrectAnswer: "server canonical answer",
    explanation: "feedback",
    diagnosticCode: "match",
    metadata: { source: "evaluator" },
  },
};

function rpcClient(data: unknown, error: unknown = null) {
  const rpc = vi.fn(async (_name: string, _payload: Record<string, unknown>) => ({
    data,
    error,
  }));
  return {
    client: { rpc } as unknown as SupabaseClient,
    rpc,
  };
}

function queryClient(rows: unknown[]) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(async () => ({ data: rows, error: null }));
  const from = vi.fn(() => builder);
  return {
    client: { from } as unknown as SupabaseClient,
    from,
    builder,
  };
}

function remoteRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "user-a",
    attempt_id: "attempt-stable",
    session_id: "session-1",
    questao_id: 42,
    resposta_aluno: "student answer",
    resposta_correta: "server canonical answer",
    feedback: "feedback",
    tempo_segundos: 1.25,
    result_status: "correct",
    client_created_at: "2026-07-25T12:00:00.000Z",
    modo_estudo: "quick",
    metadados: {
      diagnostic_code: "match",
      normalized_student_answer: "student answer",
      evaluation_metadata: { source: "evaluator" },
      tempo_ms: 1_250,
    },
    ...overrides,
  };
}

describe("SupabaseAttemptRepository", () => {
  it("serializes the stable attempt payload without sending the canonical answer", async () => {
    const { client, rpc } = rpcClient([
      { inserted: true, already_existed: false, next_review_at: null },
    ]);
    const repository = new SupabaseAttemptRepository(() => client);

    await repository.save("user-a", "session-1", attempt);

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, payload] = rpc.mock.calls[0];
    expect(name).toBe("registrar_tentativa_estudo");
    expect(payload).toMatchObject({
      p_attempt_id: "attempt-stable",
      p_session_id: "session-1",
      p_questao_id: 42,
      p_result_status: "correct",
      p_tempo_ms: 1_250,
      p_modo_estudo: "quick",
    });
    expect(payload).not.toHaveProperty("p_user_id");
    expect(payload).not.toHaveProperty("p_resposta_correta");
    expect(JSON.stringify(payload)).not.toContain("server canonical answer");
  });

  it("accepts a duplicate confirmed by the RPC as an idempotent success", async () => {
    const { client } = rpcClient([
      {
        inserted: false,
        already_existed: true,
        next_review_at: "2026-07-26T12:00:00.000Z",
      },
    ]);
    const result = await new SupabaseAttemptRepository(() => client).saveRemote(
      "user-a",
      "session-1",
      attempt,
    );
    expect(result).toEqual({
      inserted: false,
      alreadyExisted: true,
      nextReviewAt: "2026-07-26T12:00:00.000Z",
    });
  });

  it("rejects a malformed RPC response", async () => {
    const { client } = rpcClient([{ unexpected: true }]);
    await expect(
      new SupabaseAttemptRepository(() => client).save("user-a", "session-1", attempt),
    ).rejects.toMatchObject({ retryable: false });
  });

  it("reconstructs a remote attempt with server canonical data", async () => {
    const { client } = queryClient([remoteRow()]);
    const loaded = await new SupabaseAttemptRepository(() => client).load("user-a", "session-1");
    expect(loaded).toEqual([attempt]);
  });

  it("deduplicates malformed duplicate rows by attemptId", async () => {
    const { client } = queryClient([remoteRow(), remoteRow()]);
    const loaded = await new SupabaseAttemptRepository(() => client).listByUser("user-a");
    expect(loaded).toHaveLength(1);
  });

  it("rejects a row belonging to another user even if the client returns it", async () => {
    const { client } = queryClient([remoteRow({ user_id: "user-b" })]);
    await expect(
      new SupabaseAttemptRepository(() => client).load("user-a", "session-1"),
    ).rejects.toMatchObject({ retryable: false });
  });

  it("validates reconstructed data independently", () => {
    expect(
      attemptSerialization.reconstructAttempt(
        remoteRow({ questao_id: "not-a-number" }),
        "user-a",
        "session-1",
      ),
    ).toBeNull();
  });
});
