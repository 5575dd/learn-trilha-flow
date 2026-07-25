import { readLocal, storageKeys, writeLocal } from "@/data/localStorage";
import type { AttemptEntry, AttemptRepository } from "@/data/repositories/AttemptRepository";
import {
  flushAttemptSyncQueue,
  localAttemptRepository,
  remoteAttemptRepository,
} from "@/data/repositories/DualAttemptRepository";
import type { SupabaseAttemptRepository } from "@/data/repositories/SupabaseAttemptRepository";
import { flushManifestSyncQueue, manifestStore, type ManifestStore } from "@/data/manifestStore";
import { attemptSyncQueue, type PersistentSyncQueue } from "@/data/sync/syncQueue";
import { manifestSyncQueue, type PersistentManifestSyncQueue } from "@/data/sync/manifestSyncQueue";
import { WRITES_ENABLED } from "@/lib/supabase";

export interface InitialSyncStateStore {
  isPrepared(userId: string): boolean;
  markPrepared(userId: string): void;
}

export interface LocalDataBootstrapDependencies {
  writesEnabled: boolean;
  isOnline: () => boolean;
  localAttempts: Pick<AttemptRepository, "listEntriesByUser">;
  remoteAttempts: Pick<SupabaseAttemptRepository, "listAttemptIdsByUser">;
  attemptQueue: Pick<PersistentSyncQueue, "enqueue" | "reportPersistenceFailure"> &
    Partial<Pick<PersistentSyncQueue, "clearPersistenceFailure">>;
  localManifests: Pick<ManifestStore, "listByUser">;
  manifestQueue: Pick<PersistentManifestSyncQueue, "enqueue" | "reportPersistenceFailure"> &
    Partial<Pick<PersistentManifestSyncQueue, "clearPersistenceFailure">>;
  state: InitialSyncStateStore;
  flushAttempts: (userId: string) => Promise<void>;
  flushManifests: (userId: string) => Promise<void>;
}

export interface LocalDataBootstrapResult {
  prepared: boolean;
  attemptsQueued: number;
  manifestsQueued: number;
  remoteLookupFallback: boolean;
  error?: string;
}

const defaultState: InitialSyncStateStore = {
  isPrepared: (userId) => readLocal(storageKeys.initialSyncPrepared(userId)) === "1",
  markPrepared: (userId) => writeLocal(storageKeys.initialSyncPrepared(userId), "1"),
};

function offlineResult(): LocalDataBootstrapResult {
  return {
    prepared: false,
    attemptsQueued: 0,
    manifestsQueued: 0,
    remoteLookupFallback: false,
  };
}

export class LocalDataBootstrap {
  private readonly inFlight = new Map<string, Promise<LocalDataBootstrapResult>>();

  constructor(private readonly dependencies: LocalDataBootstrapDependencies) {}

  run(userId: string): Promise<LocalDataBootstrapResult> {
    if (!userId || !this.dependencies.writesEnabled) {
      return Promise.resolve(offlineResult());
    }
    const running = this.inFlight.get(userId);
    if (running) return running;
    const promise = this.runOnce(userId).finally(() => {
      this.inFlight.delete(userId);
    });
    this.inFlight.set(userId, promise);
    return promise;
  }

  private async runOnce(userId: string): Promise<LocalDataBootstrapResult> {
    try {
      if (this.dependencies.state.isPrepared(userId)) {
        return {
          ...offlineResult(),
          prepared: true,
        };
      }

      const localAttempts = (
        await this.dependencies.localAttempts.listEntriesByUser(userId)
      ).filter((entry): entry is AttemptEntry => entry.userId === userId);
      const online = this.dependencies.isOnline();
      let remoteIds = new Set<string>();
      let remoteLookupFallback = false;
      if (online) {
        try {
          remoteIds = await this.dependencies.remoteAttempts.listAttemptIdsByUser(userId);
        } catch {
          remoteLookupFallback = true;
        }
      } else {
        remoteLookupFallback = true;
      }

      let attemptsQueued = 0;
      for (const entry of localAttempts) {
        if (remoteIds.has(entry.attempt.attemptId)) continue;
        this.dependencies.attemptQueue.enqueue({
          userId,
          sessionId: entry.sessionId,
          attempt: entry.attempt,
        });
        attemptsQueued++;
      }

      let manifestsQueued = 0;
      for (const manifest of this.dependencies.localManifests
        .listByUser(userId)
        .filter((candidate) => candidate.userId === userId)) {
        this.dependencies.manifestQueue.enqueue(userId, manifest);
        manifestsQueued++;
      }

      this.dependencies.state.markPrepared(userId);
      this.dependencies.attemptQueue.clearPersistenceFailure?.(userId);
      this.dependencies.manifestQueue.clearPersistenceFailure?.(userId);
      if (online) {
        await Promise.allSettled([
          this.dependencies.flushAttempts(userId),
          this.dependencies.flushManifests(userId),
        ]);
      }

      return {
        prepared: true,
        attemptsQueued,
        manifestsQueued,
        remoteLookupFallback,
      };
    } catch {
      this.dependencies.attemptQueue.reportPersistenceFailure(userId);
      this.dependencies.manifestQueue.reportPersistenceFailure(userId);
      return {
        ...offlineResult(),
        error:
          "Não foi possível preparar todos os dados locais para sincronização. Uma nova tentativa será feita.",
      };
    }
  }
}

const localDataBootstrap = new LocalDataBootstrap({
  writesEnabled: WRITES_ENABLED,
  isOnline: () => typeof navigator === "undefined" || navigator.onLine,
  localAttempts: localAttemptRepository,
  remoteAttempts: remoteAttemptRepository,
  attemptQueue: attemptSyncQueue,
  localManifests: manifestStore,
  manifestQueue: manifestSyncQueue,
  state: defaultState,
  flushAttempts: (userId) => flushAttemptSyncQueue(userId),
  flushManifests: (userId) => flushManifestSyncQueue(userId),
});

export function bootstrapLocalDataForUser(userId: string): Promise<LocalDataBootstrapResult> {
  return localDataBootstrap.run(userId);
}
