import type { AttemptRecord } from "@/domain/session/sessionReducer";

export interface AttemptRepository {
  save(sessionId: string, attempt: AttemptRecord): Promise<void>;
  load(sessionId: string): Promise<AttemptRecord[]>;
  clear(sessionId: string): Promise<void>;
}

export class InMemoryAttemptRepository implements AttemptRepository {
  private store = new Map<string, AttemptRecord[]>();
  private storageKey(id: string) {
    return `trilha.attempts.${id}`;
  }
  private hydrate(id: string): AttemptRecord[] {
    if (this.store.has(id)) return this.store.get(id)!;
    if (typeof window === "undefined") return [];
    try {
      const raw = window.sessionStorage.getItem(this.storageKey(id));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as AttemptRecord[];
      if (Array.isArray(parsed)) {
        this.store.set(id, parsed);
        return parsed;
      }
    } catch {
      /* ignore corrupt storage */
    }
    return [];
  }
  private persist(id: string, list: AttemptRecord[]) {
    this.store.set(id, list);
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(this.storageKey(id), JSON.stringify(list));
    } catch {
      /* ignore quota */
    }
  }
  async save(sessionId: string, attempt: AttemptRecord): Promise<void> {
    const list = this.hydrate(sessionId);
    if (list.some((a) => a.attemptId === attempt.attemptId)) return;
    this.persist(sessionId, [...list, attempt]);
  }
  async load(sessionId: string): Promise<AttemptRecord[]> {
    return this.hydrate(sessionId);
  }
  async clear(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(this.storageKey(sessionId));
    } catch {
      /* ignore */
    }
  }
}

// Placeholder — never invoked while VITE_ENABLE_SUPABASE_WRITES=false.
export class SupabaseAttemptRepository implements AttemptRepository {
  async save(): Promise<void> {
    throw new Error("SupabaseAttemptRepository desativado nesta fase (writes disabled).");
  }
  async load(): Promise<AttemptRecord[]> {
    return [];
  }
  async clear(): Promise<void> {
    /* no-op */
  }
}
