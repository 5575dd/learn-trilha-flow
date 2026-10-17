import { beforeEach, describe, expect, it, vi } from "vitest";
import { askTucunare } from "@/features/tucunare/tucunareClient";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ functions: { invoke: mocks.invoke } }) }));
beforeEach(() =>
  mocks.invoke
    .mockReset()
    .mockResolvedValue({ data: { answer: "Hint", remaining: 29, sources: [] } }),
);

describe("Tucunare request size", () => {
  it("keeps the current exercise while trimming oversized multilingual history", async () => {
    const questionView = JSON.stringify({ enunciado: "Current exercise" });
    await askTucunare({
      action: "chat",
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      message: "Explain this",
      questionId: 4,
      questionView,
      history: Array.from({ length: 6 }, () => ({ role: "assistant", text: "漢".repeat(9000) })),
    });
    const body = mocks.invoke.mock.calls[0][1].body;
    expect(body.questionView).toBe(questionView);
    expect(body.questionId).toBe(4);
    expect(new TextEncoder().encode(JSON.stringify(body)).length).toBeLessThanOrEqual(16_000);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});
