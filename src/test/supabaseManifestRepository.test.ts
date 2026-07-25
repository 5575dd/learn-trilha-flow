import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DualManifestStore, LocalManifestStore } from "@/data/manifestStore";
import { SupabaseManifestRepository } from "@/data/repositories/SupabaseManifestRepository";
import type { SessionManifest } from "@/domain/session/sessionManifest";

const manifest: SessionManifest = {
  schemaVersion: 1,
  id: "manifest-1",
  userId: "user-a",
  source: { kind: "quick" },
  criteria: { limit: 10 },
  questionIds: Object.freeze([3, 1, 2]),
  status: "created",
  currentIndex: 0,
  createdAt: Date.parse("2026-07-25T12:00:00.000Z"),
  updatedAt: Date.parse("2026-07-25T12:00:00.000Z"),
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "manifest-1",
    user_id: "user-a",
    schema_version: 1,
    source: { kind: "quick" },
    criteria: { limit: 10 },
    question_ids: [3, 1, 2],
    status: "created",
    current_index: 0,
    created_at: "2026-07-25T12:00:00.000Z",
    updated_at: "2026-07-25T12:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

function clientForTerminal(method: "single" | "maybeSingle", data: unknown) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["upsert", "update", "select", "eq"]) {
    builder[name] = vi.fn(() => builder);
  }
  builder[method] = vi.fn(async () => ({ data, error: null }));
  const from = vi.fn(() => builder);
  return {
    client: { from } as unknown as SupabaseClient,
    builder,
    from,
  };
}

describe("SupabaseManifestRepository", () => {
  beforeEach(() => localStorage.clear());

  it("upserts an authenticated manifest while preserving frozen question IDs", async () => {
    const { client, builder } = clientForTerminal("single", row());
    const saved = await new SupabaseManifestRepository(() => client).upsert(manifest);
    expect(saved.questionIds).toEqual([3, 1, 2]);
    expect(Object.isFrozen(saved.questionIds)).toBe(true);
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "manifest-1",
        user_id: "user-a",
        question_ids: [3, 1, 2],
      }),
      { onConflict: "id" },
    );
  });

  it("rejects a manifest returned for another user", async () => {
    const { client } = clientForTerminal("maybeSingle", row({ user_id: "user-b" }));
    await expect(
      new SupabaseManifestRepository(() => client).get("user-a", "manifest-1"),
    ).rejects.toMatchObject({ retryable: false });
  });

  it("updates currentIndex only for the requested user and manifest", async () => {
    const { client, builder } = clientForTerminal("maybeSingle", row({ current_index: 2 }));
    const updated = await new SupabaseManifestRepository(() => client).updateCurrentIndex(
      "user-a",
      "manifest-1",
      2,
    );
    expect(updated?.currentIndex).toBe(2);
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ current_index: 2 }));
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-a");
  });

  it("keeps the local manifest as the immediate dual response", () => {
    const local = new LocalManifestStore({
      createId: () => "manifest-1",
      now: () => manifest.createdAt,
    });
    const remote = {
      upsert: vi.fn(async () => manifest),
    } as unknown as SupabaseManifestRepository;
    const dual = new DualManifestStore(local, remote, true);
    const created = dual.create({
      userId: "user-a",
      source: { kind: "quick" },
      criteria: { limit: 10 },
      questionIds: [3, 1, 2],
    });
    expect(created.id).toBe("manifest-1");
    expect(local.get("user-a", "manifest-1")).toEqual(created);
    expect(remote.upsert).toHaveBeenCalledWith(created);
  });

  it("does not call the remote manifest repository when writes are disabled", () => {
    const local = new LocalManifestStore({ createId: () => "manifest-1" });
    const remote = {
      upsert: vi.fn(),
    } as unknown as SupabaseManifestRepository;
    const dual = new DualManifestStore(local, remote, false);
    dual.create({
      userId: "user-a",
      source: { kind: "quick" },
      questionIds: [1],
    });
    expect(remote.upsert).not.toHaveBeenCalled();
  });

  it("never exposes another user's local manifest through the dual layer", () => {
    const dual = new DualManifestStore(
      new LocalManifestStore({ createId: () => "manifest-1" }),
      { upsert: vi.fn() } as unknown as SupabaseManifestRepository,
      false,
    );
    dual.create({ userId: "user-a", source: { kind: "quick" }, questionIds: [1] });
    expect(dual.get("user-b", "manifest-1")).toBeNull();
  });
});
