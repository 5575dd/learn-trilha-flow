import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryAttemptRepository,
  type AttemptEntry,
} from "@/data/repositories/AttemptRepository";
import { ConsolidatedAttemptReadService } from "@/data/repositories/ConsolidatedAttemptRepository";
import type { SupabaseAttemptRepository } from "@/data/repositories/SupabaseAttemptRepository";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

const attempt: AttemptRecord = {
  attemptId: "attempt-1",
  questionId: 1,
  timeMs: 100,
  clientCreatedAt: 1,
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

function entry(): AttemptEntry {
  return { userId: "user-a", sessionId: "session-1", attempt };
}

function remote(overrides: Partial<SupabaseAttemptRepository>): SupabaseAttemptRepository {
  return overrides as SupabaseAttemptRepository;
}

describe("consolidated attempt read service", () => {
  beforeEach(() => localStorage.clear());

  it("loads a remote result on another device", async () => {
    const service = new ConsolidatedAttemptReadService(
      new InMemoryAttemptRepository(),
      remote({ loadEntries: vi.fn(async () => [entry()]) }),
      true,
      () => true,
    );
    const result = await service.loadSession("user-a", "session-1");
    expect(result.localOnly).toBe(false);
    expect(result.attempts).toEqual([attempt]);
  });

  it("combines local and remote without duplicate statistics", async () => {
    const local = new InMemoryAttemptRepository();
    await local.save("user-a", "session-1", attempt);
    const service = new ConsolidatedAttemptReadService(
      local,
      remote({ loadEntries: vi.fn(async () => [entry()]) }),
      true,
      () => true,
    );
    expect((await service.loadSession("user-a", "session-1")).attempts).toHaveLength(1);
  });

  it("falls back to local attempts after a remote failure", async () => {
    const local = new InMemoryAttemptRepository();
    await local.save("user-a", "session-1", attempt);
    const service = new ConsolidatedAttemptReadService(
      local,
      remote({
        loadEntries: vi.fn(async () => {
          throw new Error("offline");
        }),
      }),
      true,
      () => true,
    );
    const result = await service.loadSession("user-a", "session-1");
    expect(result.localOnly).toBe(true);
    expect(result.attempts).toEqual([attempt]);
  });

  it("does not make a remote read when the feature flag is disabled", async () => {
    const loadEntries = vi.fn(async () => [entry()]);
    const service = new ConsolidatedAttemptReadService(
      new InMemoryAttemptRepository(),
      remote({ loadEntries }),
      false,
      () => true,
    );
    await service.loadSession("user-a", "session-1");
    expect(loadEntries).not.toHaveBeenCalled();
  });
});
