import type { AttemptRecord } from "@/domain/session/sessionReducer";

export interface SessionSnapshot {
  aulaId: number;
  sessionId: string;
  index: number;
  total: number;
  updatedAt: number;
}

export interface AttemptRepository {
  save(sessionId: string, attempt: AttemptRecord): Promise<void>;
  load(sessionId: string): Promise<AttemptRecord[]>;
  clear(sessionId: string): Promise<void>;
}

const ATTEMPTS_KEY = (id: string) => `trilha.attempts.${id}`;
const SNAPSHOT_KEY = (aulaId: number) => `trilha.session.${aulaId}`;

export class InMemoryAttemptRepository implements AttemptRepository {
  private store = new Map<string, AttemptRecord[]>();

  private hydrate(id: string): AttemptRecord[] {
    if (this.store.has(id)) return this.store.get(id)!;
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(ATTEMPTS_KEY(id));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as AttemptRecord[];
      if (Array.isArray(parsed)) {
        this.store.set(id, parsed);
        return parsed;
      }
    } catch {
      /* ignore */
    }
    return [];
  }

  private persist(id: string, list: AttemptRecord[]) {
    this.store.set(id, list);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ATTEMPTS_KEY(id), JSON.stringify(list));
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
      window.localStorage.removeItem(ATTEMPTS_KEY(sessionId));
    } catch {
      /* ignore */
    }
  }
}

export function saveSessionSnapshot(snap: SessionSnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNAPSHOT_KEY(snap.aulaId), JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

export function loadSessionSnapshot(aulaId: number): SessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY(aulaId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionSnapshot;
    if (parsed && typeof parsed.sessionId === "string" && typeof parsed.index === "number") {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearSessionSnapshot(aulaId: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SNAPSHOT_KEY(aulaId));
  } catch {
    /* ignore */
  }
}

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
