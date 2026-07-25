import type { AttemptEntry, AttemptRepository } from "@/data/repositories/AttemptRepository";
import {
  attemptRepository,
  localAttemptRepository,
  remoteAttemptRepository,
} from "@/data/repositories/DualAttemptRepository";
import type { SupabaseAttemptRepository } from "@/data/repositories/SupabaseAttemptRepository";
import { consolidateAttempts, type AttemptConflict } from "@/domain/attempts/consolidateAttempts";
import type { AttemptRecord } from "@/domain/session/sessionReducer";
import { WRITES_ENABLED } from "@/lib/supabase";

export interface AttemptReadResult {
  entries: AttemptEntry[];
  attempts: AttemptRecord[];
  conflicts: AttemptConflict[];
  localOnly: boolean;
  error?: string;
}

export class ConsolidatedAttemptReadService {
  constructor(
    private readonly local: AttemptRepository,
    private readonly remote: SupabaseAttemptRepository,
    private readonly remoteReadsEnabled = true,
    private readonly isOnline: () => boolean = () =>
      typeof navigator === "undefined" || navigator.onLine,
  ) {}

  async loadSession(userId: string, sessionId: string): Promise<AttemptReadResult> {
    const local = await this.local.loadEntries(userId, sessionId);
    return this.combine(userId, sessionId, local, () => this.remote.loadEntries(userId, sessionId));
  }

  async listByUser(userId: string): Promise<AttemptReadResult> {
    const local = await this.local.listEntriesByUser(userId);
    return this.combine(userId, undefined, local, () => this.remote.listEntriesByUser(userId));
  }

  private async combine(
    userId: string,
    sessionId: string | undefined,
    local: AttemptEntry[],
    loadRemote: () => Promise<AttemptEntry[]>,
  ): Promise<AttemptReadResult> {
    if (!this.remoteReadsEnabled || !this.isOnline()) {
      const result = consolidateAttempts({
        expectedUserId: userId,
        expectedSessionId: sessionId,
        local,
        remote: [],
      });
      return {
        ...result,
        attempts: result.entries.map((entry) => entry.attempt),
        localOnly: true,
      };
    }
    try {
      const remote = await loadRemote();
      const result = consolidateAttempts({
        expectedUserId: userId,
        expectedSessionId: sessionId,
        local,
        remote,
      });
      return {
        ...result,
        attempts: result.entries.map((entry) => entry.attempt),
        localOnly: false,
        ...(result.conflicts.length > 0
          ? { error: "Algumas tentativas conflitantes foram mantidas neste dispositivo." }
          : {}),
      };
    } catch {
      const result = consolidateAttempts({
        expectedUserId: userId,
        expectedSessionId: sessionId,
        local,
        remote: [],
      });
      return {
        ...result,
        attempts: result.entries.map((entry) => entry.attempt),
        localOnly: true,
        error:
          "Não foi possível carregar tentativas remotas. Os dados locais continuam disponíveis.",
      };
    }
  }
}

export const consolidatedAttemptReadService = new ConsolidatedAttemptReadService(
  localAttemptRepository,
  remoteAttemptRepository,
  WRITES_ENABLED,
);

export const consolidatedAttemptRepository: AttemptRepository = {
  save: (userId, sessionId, attempt) => attemptRepository.save(userId, sessionId, attempt),
  load: async (userId, sessionId) =>
    (await consolidatedAttemptReadService.loadSession(userId, sessionId)).attempts,
  loadEntries: async (userId, sessionId) =>
    (await consolidatedAttemptReadService.loadSession(userId, sessionId)).entries,
  clear: (userId, sessionId) => attemptRepository.clear(userId, sessionId),
  listByUser: async (userId) => (await consolidatedAttemptReadService.listByUser(userId)).attempts,
  listEntriesByUser: async (userId) =>
    (await consolidatedAttemptReadService.listByUser(userId)).entries,
};
