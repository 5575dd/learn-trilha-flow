import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryAttemptRepository,
  type AttemptEntry,
} from "@/data/repositories/AttemptRepository";
import {
  LocalDataBootstrap,
  type InitialSyncStateStore,
  type LocalDataBootstrapDependencies,
} from "@/data/sync/bootstrapLocalData";
import { PersistentSyncQueue } from "@/data/sync/syncQueue";
import { PersistentManifestSyncQueue } from "@/data/sync/manifestSyncQueue";
import { LocalManifestStore } from "@/data/manifestStore";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

const attempt: AttemptRecord = {
  attemptId: "attempt-local",
  questionId: 7,
  timeMs: 500,
  result: {
    status: "incorrect",
    studentAnswerDisplay: "B",
    correctAnswerDisplay: "A",
    normalizedStudentAnswer: "b",
    normalizedCorrectAnswer: "a",
    explanation: "Revise o conteúdo.",
    diagnosticCode: "mismatch",
    metadata: {},
  },
};

function memoryState(): InitialSyncStateStore {
  const prepared = new Set<string>();
  return {
    isPrepared: (userId) => prepared.has(userId),
    markPrepared: (userId) => {
      prepared.add(userId);
    },
  };
}

async function setup({
  writesEnabled = true,
  online = true,
  existingRemoteIds = new Set<string>(),
  remoteFailure = false,
}: {
  writesEnabled?: boolean;
  online?: boolean;
  existingRemoteIds?: Set<string>;
  remoteFailure?: boolean;
} = {}) {
  const localAttempts = new InMemoryAttemptRepository();
  await localAttempts.save("user-a", "session-1", attempt);
  const localManifests = new LocalManifestStore({
    createId: () => "manifest-local",
    now: () => 100,
  });
  localManifests.create({
    userId: "user-a",
    source: { kind: "quick" },
    questionIds: [7],
  });
  const attemptQueue = new PersistentSyncQueue();
  const manifestQueue = new PersistentManifestSyncQueue();
  const listAttemptIdsByUser = remoteFailure
    ? vi.fn(async () => {
        throw new Error("private remote detail");
      })
    : vi.fn(async () => existingRemoteIds);
  const flushAttempts = vi.fn(async () => undefined);
  const flushManifests = vi.fn(async () => undefined);
  const bootstrap = new LocalDataBootstrap({
    writesEnabled,
    isOnline: () => online,
    localAttempts,
    remoteAttempts: { listAttemptIdsByUser },
    attemptQueue,
    localManifests,
    manifestQueue,
    state: memoryState(),
    flushAttempts,
    flushManifests,
  });
  return {
    bootstrap,
    localAttempts,
    localManifests,
    attemptQueue,
    manifestQueue,
    listAttemptIdsByUser,
    flushAttempts,
    flushManifests,
  };
}

describe("local-first initial synchronization bootstrap", () => {
  beforeEach(() => localStorage.clear());

  it("enqueues an attempt created before remote writes were enabled", async () => {
    const context = await setup();
    await context.bootstrap.run("user-a");
    expect(context.attemptQueue.list("user-a")).toHaveLength(1);
    expect(context.attemptQueue.list("user-a")[0]?.payload).toMatchObject({
      userId: "user-a",
      sessionId: "session-1",
      attempt: { attemptId: "attempt-local" },
    });
  });

  it("does not enqueue an attempt that already exists remotely", async () => {
    const context = await setup({ existingRemoteIds: new Set(["attempt-local"]) });
    await context.bootstrap.run("user-a");
    expect(context.attemptQueue.list("user-a")).toEqual([]);
  });

  it("enqueues all local attempts safely while offline without a remote read", async () => {
    const context = await setup({ online: false });
    const result = await context.bootstrap.run("user-a");
    expect(result.remoteLookupFallback).toBe(true);
    expect(context.listAttemptIdsByUser).not.toHaveBeenCalled();
    expect(context.attemptQueue.list("user-a")).toHaveLength(1);
    expect(context.flushAttempts).not.toHaveBeenCalled();
  });

  it("prepares every local manifest through the persistent queue", async () => {
    const context = await setup();
    await context.bootstrap.run("user-a");
    expect(context.manifestQueue.list("user-a")).toEqual([
      expect.objectContaining({
        userId: "user-a",
        manifestId: "manifest-local",
        snapshot: expect.objectContaining({ questionIds: [7] }),
      }),
    ]);
  });

  it("does not duplicate data when the bootstrap runs repeatedly", async () => {
    const context = await setup();
    await context.bootstrap.run("user-a");
    await context.bootstrap.run("user-a");
    expect(context.attemptQueue.list("user-a")).toHaveLength(1);
    expect(context.manifestQueue.list("user-a")).toHaveLength(1);
    expect(context.listAttemptIdsByUser).toHaveBeenCalledOnce();
  });

  it("never assigns another user's local data to the authenticated user", async () => {
    const wrongEntry: AttemptEntry = {
      userId: "user-b",
      sessionId: "session-b",
      attempt: { ...attempt, attemptId: "attempt-b" },
    };
    const attemptQueue = new PersistentSyncQueue();
    const manifestQueue = new PersistentManifestSyncQueue();
    const bootstrap = new LocalDataBootstrap({
      writesEnabled: true,
      isOnline: () => true,
      localAttempts: { listEntriesByUser: vi.fn(async () => [wrongEntry]) },
      remoteAttempts: { listAttemptIdsByUser: vi.fn(async () => new Set<string>()) },
      attemptQueue,
      localManifests: { listByUser: () => [] },
      manifestQueue,
      state: memoryState(),
      flushAttempts: vi.fn(async () => undefined),
      flushManifests: vi.fn(async () => undefined),
    });
    await bootstrap.run("user-a");
    expect(attemptQueue.list("user-a")).toEqual([]);
    expect(attemptQueue.list("user-b")).toEqual([]);
  });

  it("does not read or write remote data while the feature flag is false", async () => {
    const localRead = vi.fn(async () => []);
    const remoteRead = vi.fn(async () => new Set<string>());
    const enqueueAttempt = vi.fn();
    const enqueueManifest = vi.fn();
    const flushAttempts = vi.fn(async () => undefined);
    const flushManifests = vi.fn(async () => undefined);
    const dependencies: LocalDataBootstrapDependencies = {
      writesEnabled: false,
      isOnline: () => true,
      localAttempts: { listEntriesByUser: localRead },
      remoteAttempts: { listAttemptIdsByUser: remoteRead },
      attemptQueue: {
        enqueue: enqueueAttempt,
        reportPersistenceFailure: vi.fn(),
      },
      localManifests: { listByUser: vi.fn(() => []) },
      manifestQueue: {
        enqueue: enqueueManifest,
        reportPersistenceFailure: vi.fn(),
      },
      state: memoryState(),
      flushAttempts,
      flushManifests,
    };
    await new LocalDataBootstrap(dependencies).run("user-a");
    expect(localRead).not.toHaveBeenCalled();
    expect(remoteRead).not.toHaveBeenCalled();
    expect(enqueueAttempt).not.toHaveBeenCalled();
    expect(enqueueManifest).not.toHaveBeenCalled();
    expect(flushAttempts).not.toHaveBeenCalled();
    expect(flushManifests).not.toHaveBeenCalled();
  });

  it("sanitizes bootstrap failures and keeps the application locally usable", async () => {
    const attemptQueue = new PersistentSyncQueue();
    const manifestQueue = new PersistentManifestSyncQueue();
    const bootstrap = new LocalDataBootstrap({
      writesEnabled: true,
      isOnline: () => true,
      localAttempts: {
        listEntriesByUser: vi.fn(async () => {
          throw new Error("secret remote or storage detail");
        }),
      },
      remoteAttempts: { listAttemptIdsByUser: vi.fn(async () => new Set<string>()) },
      attemptQueue,
      localManifests: { listByUser: () => [] },
      manifestQueue,
      state: memoryState(),
      flushAttempts: vi.fn(async () => undefined),
      flushManifests: vi.fn(async () => undefined),
    });
    const result = await bootstrap.run("user-a");
    expect(result).toMatchObject({ prepared: false });
    expect(result.error).toContain("nova tentativa");
    expect(result.error).not.toContain("secret");
    expect(attemptQueue.hasPersistenceFailure("user-a")).toBe(true);
  });

  it("falls back to idempotent enqueue when the remote ID lookup fails", async () => {
    const context = await setup({ remoteFailure: true });
    const result = await context.bootstrap.run("user-a");
    expect(result.remoteLookupFallback).toBe(true);
    expect(context.attemptQueue.list("user-a")).toHaveLength(1);
  });
});
