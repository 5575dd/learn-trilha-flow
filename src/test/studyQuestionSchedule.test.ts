import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isRawQuestionReleased,
  listQuestoesComAgendamento,
  listQuestoesDisponiveis,
} from "@/data/queries";

const database = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => database }));

describe("scheduled study question cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T05:59:59-03:00"));
    database.from.mockReturnValue(database);
    database.select.mockReturnValue(database);
    database.order.mockReturnValue(database);
    database.range.mockResolvedValue({
      data: [
        { id: 1, proxima_revisao_em: "2026-10-20T06:00:00-03:00" },
        { id: 2, proxima_revisao_em: "2026-10-20T19:00:00-03:00" },
      ],
      error: null,
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("retains scheduled questions so a release does not require another database call", async () => {
    const cached = await listQuestoesComAgendamento();
    expect(cached).toHaveLength(2);
    expect(cached.filter((question) => isRawQuestionReleased(question))).toHaveLength(0);
    vi.setSystemTime(new Date("2026-10-20T06:00:00-03:00"));
    expect(
      cached.filter((question) => isRawQuestionReleased(question)).map((question) => question.id),
    ).toEqual([1]);
    vi.setSystemTime(new Date("2026-10-20T19:00:00-03:00"));
    expect(
      cached.filter((question) => isRawQuestionReleased(question)).map((question) => question.id),
    ).toEqual([1, 2]);
    expect(database.range).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing released-only API behavior", async () => {
    vi.setSystemTime(new Date("2026-10-20T06:00:00-03:00"));
    expect((await listQuestoesDisponiveis()).map((question) => question.id)).toEqual([1]);
  });

  it("does not hide database errors as an empty schedule", async () => {
    database.range.mockResolvedValue({ data: null, error: new Error("network unavailable") });
    await expect(listQuestoesComAgendamento()).rejects.toThrow("network unavailable");
  });
});
