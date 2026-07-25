import {
  InMemoryAttemptRepository,
  type AttemptEntry,
  type AttemptRepository,
} from "@/data/repositories/AttemptRepository";
import { SupabaseAttemptRepository } from "@/data/repositories/SupabaseAttemptRepository";
import {
  attemptSyncQueue,
  PersistentSyncQueue,
  type AttemptSyncPayload,
} from "@/data/sync/syncQueue";
import type { AttemptRecord } from "@/domain/session/sessionReducer";
import { WRITES_ENABLED } from "@/lib/supabase";

export interface DualAttemptRepositoryOptions {
  writesEnabled?: boolean;
}

export class DualAttemptRepository implements AttemptRepository {
  readonly writesEnabled: boolean;
  private readonly unscheduled = new Map<string, Map<string, AttemptSyncPayload>>();

  constructor(
    private readonly local: AttemptRepository,
    private readonly remote: SupabaseAttemptRepository,
    private readonly queue: PersistentSyncQueue,
    options: DualAttemptRepositoryOptions = {},
  ) {
    this.writesEnabled = options.writesEnabled ?? true;
  }

  async save(userId: string, sessionId: string, attempt: AttemptRecord): Promise<void> {
    await this.local.save(userId, sessionId, attempt);
    if (!this.writesEnabled) return;

    try {
      this.queue.enqueue({ userId, sessionId, attempt });
    } catch {
      const pending = this.unscheduled.get(userId) ?? new Map<string, AttemptSyncPayload>();
      pending.set(attempt.attemptId, { userId, sessionId, attempt });
      this.unscheduled.set(userId, pending);
      this.queue.reportPersistenceFailure(userId);
      return;
    }
    void this.flush(userId);
  }

  async load(userId: string, sessionId: string): Promise<AttemptRecord[]> {
    return this.local.load(userId, sessionId);
  }

  async loadEntries(userId: string, sessionId: string): Promise<AttemptEntry[]> {
    return this.local.loadEntries(userId, sessionId);
  }

  async clear(userId: string, sessionId: string): Promise<void> {
    await this.local.clear(userId, sessionId);
  }

  async listByUser(userId: string): Promise<AttemptRecord[]> {
    return this.local.listByUser(userId);
  }

  async listEntriesByUser(userId: string): Promise<AttemptEntry[]> {
    return this.local.listEntriesByUser(userId);
  }

  async flush(userId: string, force = false): Promise<void> {
    if (!this.writesEnabled) return;
    const pending = this.unscheduled.get(userId);
    if (pending) {
      try {
        for (const payload of pending.values()) {
          this.queue.enqueue(payload);
          pending.delete(payload.attempt.attemptId);
        }
        if (pending.size === 0) {
          this.unscheduled.delete(userId);
          this.queue.clearPersistenceFailure(userId);
        }
      } catch {
        this.queue.reportPersistenceFailure(userId);
        return;
      }
    }
    await this.queue.flush(userId, (payload) => this.synchronize(payload), force);
  }

  registerOnlineFlush(userId: string): () => void {
    if (!this.writesEnabled) return () => undefined;
    return this.queue.registerOnlineFlush(userId, (payload) => this.synchronize(payload));
  }

  private async synchronize(payload: AttemptSyncPayload): Promise<void> {
    await this.remote.saveRemote(payload.userId, payload.sessionId, payload.attempt);
  }
}

export const localAttemptRepository = new InMemoryAttemptRepository();
export const remoteAttemptRepository = new SupabaseAttemptRepository();

export const attemptRepository = WRITES_ENABLED
  ? new DualAttemptRepository(localAttemptRepository, remoteAttemptRepository, attemptSyncQueue, {
      writesEnabled: true,
    })
  : localAttemptRepository;

export function flushAttemptSyncQueue(userId: string, force = false): Promise<void> {
  return attemptRepository instanceof DualAttemptRepository
    ? attemptRepository.flush(userId, force)
    : Promise.resolve();
}

export function registerAttemptOnlineFlush(userId: string): () => void {
  return attemptRepository instanceof DualAttemptRepository
    ? attemptRepository.registerOnlineFlush(userId)
    : () => undefined;
}
