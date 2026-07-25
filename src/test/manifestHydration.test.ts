import { beforeEach, describe, expect, it, vi } from "vitest";
import { DualManifestStore, LocalManifestStore } from "@/data/manifestStore";
import type { SupabaseManifestRepository } from "@/data/repositories/SupabaseManifestRepository";
import { PersistentManifestSyncQueue } from "@/data/sync/manifestSyncQueue";
import type { SessionManifest } from "@/domain/session/sessionManifest";

function remoteManifest(overrides: Partial<SessionManifest> = {}): SessionManifest {
  return {
    schemaVersion: 1,
    id: "remote-1",
    userId: "user-a",
    source: { kind: "dueReview" },
    criteria: {},
    questionIds: Object.freeze([1, 2]),
    status: "active",
    currentIndex: 1,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function remote(repository: Partial<SupabaseManifestRepository>): SupabaseManifestRepository {
  return repository as SupabaseManifestRepository;
}

describe("manifest hydration", () => {
  beforeEach(() => localStorage.clear());

  it("hydrates a recoverable remote manifest into local storage", async () => {
    const local = new LocalManifestStore();
    const repository = remote({
      listRecoverable: vi.fn(async () => [remoteManifest()]),
    });
    const dual = new DualManifestStore(local, repository, true, new PersistentManifestSyncQueue());
    const result = await dual.hydrate("user-a");
    expect(result.localOnly).toBe(false);
    expect(local.get("user-a", "remote-1")).toEqual(remoteManifest());
    expect(dual.findRecoverable("user-a")?.id).toBe("remote-1");
  });

  it("updates local readers immediately after hydration", async () => {
    const local = new LocalManifestStore();
    const listener = vi.fn();
    local.subscribe("user-a", listener);
    const dual = new DualManifestStore(
      local,
      remote({ listRecoverable: vi.fn(async () => [remoteManifest()]) }),
      true,
      new PersistentManifestSyncQueue(),
    );
    await dual.hydrate("user-a");
    expect(listener).toHaveBeenCalled();
  });

  it("keeps local operation available when the remote query fails", async () => {
    const local = new LocalManifestStore({ createId: () => "local-1" });
    local.create({ userId: "user-a", source: { kind: "quick" }, questionIds: [1] });
    const dual = new DualManifestStore(
      local,
      remote({
        listRecoverable: vi.fn(async () => {
          throw new Error("network");
        }),
      }),
      true,
      new PersistentManifestSyncQueue(),
    );
    const result = await dual.hydrate("user-a");
    expect(result.localOnly).toBe(true);
    expect(result.error).toMatch(/dados locais/);
    expect(dual.findRecoverable("user-a")?.id).toBe("local-1");
  });
});
