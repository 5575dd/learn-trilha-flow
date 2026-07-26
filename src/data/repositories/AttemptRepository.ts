import type { AttemptRecord } from "@/domain/session/sessionReducer";
import { readLocal, removeLocal, storageKeys, writeLocal } from "@/data/localStorage";
import { isEvaluationStatus } from "@/domain/answers/evaluationTypes";

export const SESSION_SNAPSHOT_SCHEMA_VERSION = 1;

export interface SessionSnapshot {
  schemaVersion: typeof SESSION_SNAPSHOT_SCHEMA_VERSION;
  userId: string;
  aulaId: number;
  sessionId: string;
  questionIds: number[];
  currentQuestionId: number | null;
  currentIndex: number;
  updatedAt: number;
}

export interface SnapshotExpectation {
  userId: string;
  aulaId: number;
  questionIds: number[];
  scope?: string;
}

export interface AttemptRepository {
  save(userId: string, sessionId: string, attempt: AttemptRecord): Promise<void>;
  load(userId: string, sessionId: string): Promise<AttemptRecord[]>;
  loadEntries(userId: string, sessionId: string): Promise<AttemptEntry[]>;
  clear(userId: string, sessionId: string): Promise<void>;
  listByUser(userId: string): Promise<AttemptRecord[]>;
  listEntriesByUser(userId: string): Promise<AttemptEntry[]>;
}

export interface AttemptEntry {
  userId: string;
  sessionId: string;
  attempt: AttemptRecord;
}

export function isAttemptRecord(value: unknown): value is AttemptRecord {
  if (!value || typeof value !== "object") return false;
  const attempt = value as Partial<AttemptRecord>;
  const result = attempt.result as Record<string, unknown> | undefined;
  return (
    typeof attempt.attemptId === "string" &&
    attempt.attemptId.length > 0 &&
    Number.isSafeInteger(attempt.questionId) &&
    (attempt.questionId ?? 0) > 0 &&
    typeof attempt.timeMs === "number" &&
    Number.isFinite(attempt.timeMs) &&
    attempt.timeMs >= 0 &&
    (attempt.clientCreatedAt === undefined ||
      (typeof attempt.clientCreatedAt === "number" && Number.isFinite(attempt.clientCreatedAt))) &&
    (attempt.sessionMode === undefined || typeof attempt.sessionMode === "string") &&
    !!result &&
    isEvaluationStatus(result.status) &&
    typeof result.studentAnswerDisplay === "string" &&
    typeof result.correctAnswerDisplay === "string" &&
    typeof result.normalizedStudentAnswer === "string" &&
    typeof result.normalizedCorrectAnswer === "string" &&
    typeof result.explanation === "string" &&
    typeof result.diagnosticCode === "string" &&
    !!result.metadata &&
    typeof result.metadata === "object" &&
    !Array.isArray(result.metadata)
  );
}

export class InMemoryAttemptRepository implements AttemptRepository {
  private store = new Map<string, AttemptRecord[]>();

  private cacheKey(userId: string, sessionId: string) {
    return `${userId}:${sessionId}`;
  }

  private hydrate(userId: string, sessionId: string): AttemptRecord[] {
    const cacheKey = this.cacheKey(userId, sessionId);
    if (this.store.has(cacheKey)) return this.store.get(cacheKey)!;
    const raw = readLocal(storageKeys.attempts(userId, sessionId));
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.every(isAttemptRecord)) {
        removeLocal(storageKeys.attempts(userId, sessionId));
        return [];
      }
      this.store.set(cacheKey, parsed);
      return parsed;
    } catch (error) {
      console.error("[storage] corrupt attempts discarded", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      removeLocal(storageKeys.attempts(userId, sessionId));
      return [];
    }
  }

  async save(userId: string, sessionId: string, attempt: AttemptRecord): Promise<void> {
    const list = this.hydrate(userId, sessionId);
    if (list.some((item) => item.attemptId === attempt.attemptId)) return;
    const next = [...list, attempt];
    writeLocal(storageKeys.attempts(userId, sessionId), JSON.stringify(next));
    this.store.set(this.cacheKey(userId, sessionId), next);
  }

  async load(userId: string, sessionId: string): Promise<AttemptRecord[]> {
    return this.hydrate(userId, sessionId);
  }

  async loadEntries(userId: string, sessionId: string): Promise<AttemptEntry[]> {
    return (await this.load(userId, sessionId)).map((attempt) => ({
      userId,
      sessionId,
      attempt,
    }));
  }

  async clear(userId: string, sessionId: string): Promise<void> {
    removeLocal(storageKeys.attempts(userId, sessionId));
    this.store.delete(this.cacheKey(userId, sessionId));
  }

  async listByUser(userId: string): Promise<AttemptRecord[]> {
    return (await this.listEntriesByUser(userId)).map((entry) => entry.attempt);
  }

  async listEntriesByUser(userId: string): Promise<AttemptEntry[]> {
    if (typeof window === "undefined") return [];
    const keyPrefix = storageKeys.attemptsPrefix(userId);
    const attempts: AttemptEntry[] = [];
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(keyPrefix)) continue;
      const sessionId = decodeURIComponent(key.slice(keyPrefix.length));
      attempts.push(
        ...this.hydrate(userId, sessionId).map((attempt) => ({
          userId,
          sessionId,
          attempt,
        })),
      );
    }
    return attempts;
  }
}

function sameIds(left: number[], right: number[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function isSnapshot(value: unknown): value is SessionSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<SessionSnapshot>;
  return (
    snapshot.schemaVersion === SESSION_SNAPSHOT_SCHEMA_VERSION &&
    typeof snapshot.userId === "string" &&
    Number.isSafeInteger(snapshot.aulaId) &&
    typeof snapshot.sessionId === "string" &&
    snapshot.sessionId.length > 0 &&
    Array.isArray(snapshot.questionIds) &&
    snapshot.questionIds.every(Number.isSafeInteger) &&
    (snapshot.currentQuestionId === null || Number.isSafeInteger(snapshot.currentQuestionId)) &&
    Number.isSafeInteger(snapshot.currentIndex) &&
    typeof snapshot.updatedAt === "number"
  );
}

export function saveSessionSnapshot(snapshot: SessionSnapshot, scope?: string): void {
  writeLocal(
    storageKeys.snapshot(snapshot.userId, snapshot.aulaId, scope),
    JSON.stringify(snapshot),
  );
}

export function loadSessionSnapshot(expected: SnapshotExpectation): SessionSnapshot | null {
  const key = storageKeys.snapshot(expected.userId, expected.aulaId, expected.scope);
  const raw = readLocal(key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isSnapshot(parsed) ||
      parsed.userId !== expected.userId ||
      parsed.aulaId !== expected.aulaId ||
      !sameIds(parsed.questionIds, expected.questionIds) ||
      parsed.currentIndex < 0 ||
      parsed.currentIndex > expected.questionIds.length ||
      parsed.currentQuestionId !== (expected.questionIds[parsed.currentIndex] ?? null)
    ) {
      removeLocal(key);
      return null;
    }
    return parsed;
  } catch (error) {
    console.error("[storage] corrupt snapshot discarded", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    removeLocal(key);
    return null;
  }
}

export function clearSessionSnapshot(userId: string, aulaId: number, scope?: string): void {
  removeLocal(storageKeys.snapshot(userId, aulaId, scope));
}
