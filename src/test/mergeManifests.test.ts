import { describe, expect, it } from "vitest";
import { mergeManifestSnapshots } from "@/domain/session/mergeManifests";
import type { SessionManifest } from "@/domain/session/sessionManifest";

function manifest(overrides: Partial<SessionManifest> = {}): SessionManifest {
  return {
    schemaVersion: 1,
    id: "manifest-1",
    userId: "user-a",
    source: { kind: "quick" },
    criteria: { limit: 2 },
    questionIds: Object.freeze([1, 2]),
    status: "active",
    currentIndex: 1,
    createdAt: 1,
    updatedAt: 10,
    ...overrides,
  };
}

describe("remote manifest consolidation", () => {
  it("hydrates a valid remote manifest", () => {
    const remote = manifest();
    expect(mergeManifestSnapshots({ expectedUserId: "user-a", local: null, remote })).toEqual(
      remote,
    );
  });

  it("rejects a different user", () => {
    expect(() =>
      mergeManifestSnapshots({
        expectedUserId: "user-a",
        local: null,
        remote: manifest({ userId: "user-b" }),
      }),
    ).toThrow(/combinar uma sessão/);
  });

  it("rejects conflicting questionIds", () => {
    expect(() =>
      mergeManifestSnapshots({
        expectedUserId: "user-a",
        local: manifest(),
        remote: manifest({ questionIds: Object.freeze([2, 1]), updatedAt: 20 }),
      }),
    ).toThrow(/combinar uma sessão/);
  });

  it("does not regress completed to active", () => {
    const local = manifest({ status: "completed", currentIndex: 2, updatedAt: 10 });
    const remote = manifest({ status: "active", updatedAt: 20 });
    expect(mergeManifestSnapshots({ expectedUserId: "user-a", local, remote }).status).toBe(
      "completed",
    );
  });

  it("does not let a pending local snapshot regress the remote index", () => {
    const local = manifest({ currentIndex: 1, updatedAt: 10 });
    const remote = manifest({ currentIndex: 2, updatedAt: 20 });
    expect(
      mergeManifestSnapshots({
        expectedUserId: "user-a",
        local,
        remote,
        localPending: true,
      }).currentIndex,
    ).toBe(2);
  });

  it("does not regress currentIndex just because the remote timestamp is newer", () => {
    const local = manifest({ currentIndex: 2, updatedAt: 10 });
    const remote = manifest({ currentIndex: 1, updatedAt: 20 });
    expect(mergeManifestSnapshots({ expectedUserId: "user-a", local, remote }).currentIndex).toBe(
      2,
    );
  });

  it("rejects an invalid currentIndex", () => {
    expect(() =>
      mergeManifestSnapshots({
        expectedUserId: "user-a",
        local: null,
        remote: manifest({ currentIndex: 3 }),
      }),
    ).toThrow(/combinar uma sessão/);
  });

  it("keeps abandoned terminal against a newer active snapshot", () => {
    const local = manifest({ status: "abandoned", currentIndex: 1, updatedAt: 10 });
    const remote = manifest({ status: "active", currentIndex: 2, updatedAt: 20 });
    expect(mergeManifestSnapshots({ expectedUserId: "user-a", local, remote })).toMatchObject({
      status: "abandoned",
      currentIndex: 2,
    });
  });

  it("lets completed win over abandoned with completion evidence", () => {
    const local = manifest({
      status: "completed",
      currentIndex: 2,
      completedAt: 9,
      updatedAt: 10,
    });
    const remote = manifest({ status: "abandoned", currentIndex: 1, updatedAt: 20 });
    expect(mergeManifestSnapshots({ expectedUserId: "user-a", local, remote })).toMatchObject({
      status: "completed",
      currentIndex: 2,
      completedAt: 9,
    });
  });

  it.each([{ source: { kind: "errors" as const } }, { criteria: { limit: 1 } }, { createdAt: 2 }])(
    "rejects incompatible immutable fields",
    (overrides) => {
      expect(() =>
        mergeManifestSnapshots({
          expectedUserId: "user-a",
          local: manifest(),
          remote: manifest(overrides),
        }),
      ).toThrow(/combinar uma sessão/);
    },
  );
});
