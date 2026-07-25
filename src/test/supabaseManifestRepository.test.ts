import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DualManifestStore, LocalManifestStore } from "@/data/manifestStore";
import { SupabaseManifestRepository } from "@/data/repositories/SupabaseManifestRepository";
import { PersistentManifestSyncQueue } from "@/data/sync/manifestSyncQueue";
import type { SessionManifest } from "@/domain/session/sessionManifest";

const baseTime = Date.parse("2026-07-25T12:00:00.000Z");

const manifest: SessionManifest = {
  schemaVersion: 1,
  id: "manifest-1",
  userId: "user-a",
  source: { kind: "quick" },
  criteria: { limit: 10 },
  questionIds: Object.freeze([3, 1, 2]),
  status: "created",
  currentIndex: 0,
  createdAt: baseTime,
  updatedAt: baseTime,
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

interface QueryResult {
  data: unknown;
  error: unknown;
}

function casClient({
  reads = [],
  updates = [],
  inserts = [],
}: {
  reads?: QueryResult[];
  updates?: QueryResult[];
  inserts?: QueryResult[];
}) {
  let readIndex = 0;
  let updateIndex = 0;
  let insertIndex = 0;
  const updatePayloads: Record<string, unknown>[] = [];
  const insertPayloads: Record<string, unknown>[] = [];
  const equalityChecks: Array<[string, unknown]> = [];

  const from = vi.fn(() => {
    let operation: "read" | "update" | "insert" = "read";
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((column: string, value: unknown) => {
      equalityChecks.push([column, value]);
      return builder;
    });
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      operation = "update";
      updatePayloads.push(payload);
      return builder;
    });
    builder.insert = vi.fn((payload: Record<string, unknown>) => {
      operation = "insert";
      insertPayloads.push(payload);
      return builder;
    });
    builder.maybeSingle = vi.fn(async () => {
      if (operation === "update") {
        return updates[updateIndex++] ?? { data: null, error: null };
      }
      if (operation === "insert") {
        return inserts[insertIndex++] ?? { data: null, error: null };
      }
      return reads[readIndex++] ?? { data: null, error: null };
    });
    return builder;
  });

  return {
    client: { from } as unknown as SupabaseClient,
    from,
    updatePayloads,
    insertPayloads,
    equalityChecks,
  };
}

function repository(
  client: SupabaseClient,
  options: { maxSyncAttempts?: number; now?: () => number } = {},
) {
  return new SupabaseManifestRepository(() => client, options);
}

describe("SupabaseManifestRepository", () => {
  beforeEach(() => localStorage.clear());

  it("inserts only when the remote manifest does not exist", async () => {
    const fake = casClient({
      reads: [{ data: null, error: null }],
      inserts: [{ data: row(), error: null }],
    });
    const saved = await repository(fake.client).synchronize(manifest);
    expect(saved.questionIds).toEqual([3, 1, 2]);
    expect(Object.isFrozen(saved.questionIds)).toBe(true);
    expect(fake.insertPayloads).toEqual([
      expect.objectContaining({
        id: "manifest-1",
        user_id: "user-a",
        question_ids: [3, 1, 2],
      }),
    ]);
  });

  it("keeps a remote completed manifest when a pending local snapshot is active", async () => {
    const completedRow = row({
      status: "completed",
      current_index: 3,
      updated_at: "2026-07-25T12:05:00.000Z",
      completed_at: "2026-07-25T12:04:00.000Z",
    });
    const fake = casClient({ reads: [{ data: completedRow, error: null }] });
    const saved = await repository(fake.client).synchronize({
      ...manifest,
      status: "active",
      currentIndex: 1,
      updatedAt: baseTime + 10 * 60_000,
    });
    expect(saved).toMatchObject({ status: "completed", currentIndex: 3 });
    expect(fake.updatePayloads).toEqual([]);
  });

  it("does not regress a larger remote currentIndex", async () => {
    const fake = casClient({
      reads: [
        {
          data: row({ status: "active", current_index: 2 }),
          error: null,
        },
      ],
    });
    const saved = await repository(fake.client).synchronize({
      ...manifest,
      status: "active",
      currentIndex: 1,
      updatedAt: baseTime + 10_000,
    });
    expect(saved.currentIndex).toBe(2);
    expect(fake.updatePayloads).toEqual([]);
  });

  it("promotes a remote active manifest when the local session is completed", async () => {
    const rawToken = "2026-07-25T12:00:00.123456+00:00";
    const completedAt = baseTime + 2_000;
    const fake = casClient({
      reads: [
        { data: row({ status: "active", current_index: 1, updated_at: rawToken }), error: null },
      ],
      updates: [
        {
          data: row({
            status: "completed",
            current_index: 3,
            updated_at: "2026-07-25T12:00:02.001Z",
            completed_at: "2026-07-25T12:00:02.000Z",
          }),
          error: null,
        },
      ],
    });
    const saved = await repository(fake.client, { now: () => completedAt + 1 }).synchronize({
      ...manifest,
      status: "completed",
      currentIndex: 3,
      updatedAt: completedAt,
      completedAt,
    });
    expect(saved).toMatchObject({ status: "completed", currentIndex: 3 });
    expect(fake.updatePayloads[0]).toMatchObject({
      status: "completed",
      current_index: 3,
    });
    expect(fake.equalityChecks).toContainEqual(["updated_at", rawToken]);
  });

  it("rejects conflicting questionIds as a permanent error", async () => {
    const fake = casClient({
      reads: [{ data: row({ question_ids: [2, 1, 3] }), error: null }],
    });
    await expect(repository(fake.client).synchronize(manifest)).rejects.toMatchObject({
      retryable: false,
    });
    expect(fake.updatePayloads).toEqual([]);
  });

  it.each([
    ["source", { source: { kind: "errors" } }],
    ["criteria", { criteria: { limit: 5 } }],
  ])("rejects conflicting %s as a permanent error", async (_field, overrides) => {
    const fake = casClient({ reads: [{ data: row(overrides), error: null }] });
    await expect(repository(fake.client).synchronize(manifest)).rejects.toMatchObject({
      retryable: false,
    });
  });

  it("re-reads and retries after a concurrent compare-and-swap miss", async () => {
    const firstToken = "2026-07-25T12:00:00.000001+00:00";
    const secondToken = "2026-07-25T12:00:01.000002+00:00";
    const fake = casClient({
      reads: [
        { data: row({ status: "active", current_index: 0, updated_at: firstToken }), error: null },
        { data: row({ status: "active", current_index: 1, updated_at: secondToken }), error: null },
      ],
      updates: [
        { data: null, error: null },
        {
          data: row({
            status: "active",
            current_index: 2,
            updated_at: "2026-07-25T12:00:03.000Z",
          }),
          error: null,
        },
      ],
    });
    const saved = await repository(fake.client, { now: () => baseTime + 3_000 }).synchronize({
      ...manifest,
      status: "active",
      currentIndex: 2,
      updatedAt: baseTime + 2_000,
    });
    expect(saved.currentIndex).toBe(2);
    expect(fake.updatePayloads).toHaveLength(2);
    expect(fake.equalityChecks).toContainEqual(["updated_at", firstToken]);
    expect(fake.equalityChecks).toContainEqual(["updated_at", secondToken]);
  });

  it("returns a retryable error after the explicit CAS retry limit", async () => {
    const reads = [0, 1, 2].map((index) => ({
      data: row({
        status: "active",
        updated_at: `2026-07-25T12:00:0${index}.00000${index}+00:00`,
      }),
      error: null,
    }));
    const fake = casClient({
      reads,
      updates: reads.map(() => ({ data: null, error: null })),
    });
    await expect(
      repository(fake.client, { maxSyncAttempts: 3 }).synchronize({
        ...manifest,
        status: "active",
        currentIndex: 1,
      }),
    ).rejects.toMatchObject({ retryable: true });
    expect(fake.updatePayloads).toHaveLength(3);
    expect(fake.from).toHaveBeenCalledTimes(6);
  });

  it("rejects a manifest returned for another user", async () => {
    const fake = casClient({
      reads: [{ data: row({ user_id: "user-b" }), error: null }],
    });
    await expect(repository(fake.client).get("user-a", "manifest-1")).rejects.toMatchObject({
      retryable: false,
    });
  });

  it("updates currentIndex through the same safe synchronization path", async () => {
    const rawToken = "2026-07-25T12:00:00.123456+00:00";
    const fake = casClient({
      reads: [
        { data: row({ status: "active", updated_at: rawToken }), error: null },
        { data: row({ status: "active", updated_at: rawToken }), error: null },
      ],
      updates: [
        {
          data: row({
            status: "active",
            current_index: 2,
            updated_at: "2026-07-25T12:00:01.000Z",
          }),
          error: null,
        },
      ],
    });
    const updated = await repository(fake.client, {
      now: () => baseTime + 1_000,
    }).updateCurrentIndex("user-a", "manifest-1", 2);
    expect(updated?.currentIndex).toBe(2);
    expect(fake.equalityChecks).toContainEqual(["updated_at", rawToken]);
  });

  it("keeps the local manifest as the immediate dual response", () => {
    const local = new LocalManifestStore({
      createId: () => "manifest-1",
      now: () => manifest.createdAt,
    });
    const remote = {
      synchronize: vi.fn(async () => manifest),
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
    expect(remote.synchronize).toHaveBeenCalledWith(created);
  });

  it("keeps the queue until safe confirmation and adopts the confirmed remote state", async () => {
    const local = new LocalManifestStore({
      createId: () => "manifest-1",
      now: () => baseTime,
    });
    local.create({
      userId: "user-a",
      source: { kind: "quick" },
      criteria: { limit: 10 },
      questionIds: [3, 1, 2],
    });
    const active = local.markActive("user-a", "manifest-1")!;
    const queue = new PersistentManifestSyncQueue();
    queue.enqueue("user-a", active);
    let confirm!: (value: SessionManifest) => void;
    const synchronize = vi.fn(
      () =>
        new Promise<SessionManifest>((resolve) => {
          confirm = resolve;
        }),
    );
    const dual = new DualManifestStore(
      local,
      { synchronize } as unknown as SupabaseManifestRepository,
      true,
      queue,
    );
    const flushing = dual.flush("user-a", true);
    await vi.waitFor(() => expect(synchronize).toHaveBeenCalledOnce());
    expect(queue.list("user-a")[0]?.status).toBe("syncing");
    expect(local.get("user-a", "manifest-1")?.status).toBe("active");
    confirm({
      ...active,
      status: "completed",
      currentIndex: 3,
      completedAt: baseTime + 100,
      updatedAt: baseTime + 100,
    });
    await flushing;
    expect(queue.list("user-a")).toEqual([]);
    expect(local.get("user-a", "manifest-1")).toMatchObject({
      status: "completed",
      currentIndex: 3,
    });
  });

  it("does not call the remote manifest repository when writes are disabled", () => {
    const local = new LocalManifestStore({ createId: () => "manifest-1" });
    const remote = {
      synchronize: vi.fn(),
    } as unknown as SupabaseManifestRepository;
    const dual = new DualManifestStore(local, remote, false);
    dual.create({
      userId: "user-a",
      source: { kind: "quick" },
      questionIds: [1],
    });
    expect(remote.synchronize).not.toHaveBeenCalled();
  });

  it("never exposes another user's local manifest through the dual layer", () => {
    const dual = new DualManifestStore(
      new LocalManifestStore({ createId: () => "manifest-1" }),
      { synchronize: vi.fn() } as unknown as SupabaseManifestRepository,
      false,
    );
    dual.create({ userId: "user-a", source: { kind: "quick" }, questionIds: [1] });
    expect(dual.get("user-b", "manifest-1")).toBeNull();
  });
});
