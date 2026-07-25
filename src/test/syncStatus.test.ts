import { describe, expect, it } from "vitest";
import { deriveSyncDisplayState, SYNC_DISPLAY_LABELS } from "@/data/sync/syncStatus";
import type { SyncQueueItem } from "@/data/sync/syncQueue";

function item(status: SyncQueueItem["status"]): SyncQueueItem {
  return {
    attemptId: "attempt-1",
    sessionId: "session-1",
    questionId: 1,
    payload: {
      userId: "user-a",
      sessionId: "session-1",
      attempt: {
        attemptId: "attempt-1",
        questionId: 1,
        timeMs: 1,
        result: {
          status: "correct",
          studentAnswerDisplay: "",
          correctAnswerDisplay: "",
          normalizedStudentAnswer: "",
          normalizedCorrectAnswer: "",
          explanation: "",
          diagnosticCode: "",
          metadata: {},
        },
      },
    },
    status,
    retryCount: 0,
    createdAt: 1,
    updatedAt: 1,
    nextRetryAt: 1,
  };
}

describe("sync status", () => {
  it("uses wording that covers attempts and session manifests", () => {
    expect(SYNC_DISPLAY_LABELS).toEqual({
      local: "Salvo neste dispositivo",
      syncing: "Sincronizando",
      synced: "Sincronizado",
      failed: "Falha ao sincronizar",
      offline: "Offline — salvo neste dispositivo",
    });
  });

  it("reports device-only persistence when writes are disabled", () => {
    expect(deriveSyncDisplayState({ writesEnabled: false, online: true, items: [] })).toBe("local");
  });

  it("reports offline before claiming synchronization", () => {
    expect(deriveSyncDisplayState({ writesEnabled: true, online: false, items: [] })).toBe(
      "offline",
    );
  });

  it("reflects pending work as syncing", () => {
    expect(
      deriveSyncDisplayState({
        writesEnabled: true,
        online: true,
        items: [item("pending")],
      }),
    ).toBe("syncing");
  });

  it("reflects a failed item as a synchronization failure", () => {
    expect(
      deriveSyncDisplayState({
        writesEnabled: true,
        online: true,
        items: [item("failed")],
      }),
    ).toBe("failed");
  });

  it("reflects storage failure without exposing a technical error", () => {
    expect(
      deriveSyncDisplayState({
        writesEnabled: true,
        online: true,
        items: [],
        persistenceFailure: true,
      }),
    ).toBe("failed");
  });

  it("only reports synchronized when the active queue is empty", () => {
    expect(
      deriveSyncDisplayState({
        writesEnabled: true,
        online: true,
        items: [item("synced")],
      }),
    ).not.toBe("synced");
    expect(deriveSyncDisplayState({ writesEnabled: true, online: true, items: [] })).toBe("synced");
  });

  it("does not report synchronized while a manifest is pending or failed", () => {
    const manifestItem = {
      userId: "user-a",
      manifestId: "manifest-1",
      snapshot: {
        schemaVersion: 1 as const,
        id: "manifest-1",
        userId: "user-a",
        source: { kind: "quick" as const },
        criteria: {},
        questionIds: Object.freeze([1]),
        status: "created" as const,
        currentIndex: 0,
        createdAt: 1,
        updatedAt: 1,
      },
      operation: "upsert" as const,
      revision: 1,
      status: "pending" as const,
      retryCount: 0,
      createdAt: 1,
      updatedAt: 1,
      nextRetryAt: 1,
    };
    expect(
      deriveSyncDisplayState({
        writesEnabled: true,
        online: true,
        items: [],
        manifestItems: [manifestItem],
      }),
    ).toBe("syncing");
    expect(
      deriveSyncDisplayState({
        writesEnabled: true,
        online: true,
        items: [],
        manifestItems: [{ ...manifestItem, status: "failed" }],
      }),
    ).toBe("failed");
  });
});
