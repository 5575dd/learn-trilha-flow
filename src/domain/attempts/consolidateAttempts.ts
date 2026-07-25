import type { AttemptEntry } from "@/data/repositories/AttemptRepository";
import { isAttemptRecord } from "@/data/repositories/AttemptRepository";

export interface AttemptConflict {
  attemptId: string;
  code: "payload_conflict" | "scope_conflict";
}

export interface ConsolidatedAttempts {
  entries: AttemptEntry[];
  conflicts: AttemptConflict[];
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeJson(item)]),
  );
}

function sameAttempt(left: AttemptEntry, right: AttemptEntry): boolean {
  return (
    left.userId === right.userId &&
    left.sessionId === right.sessionId &&
    JSON.stringify(normalizeJson(left.attempt)) === JSON.stringify(normalizeJson(right.attempt))
  );
}

function cloneEntry(entry: AttemptEntry): AttemptEntry {
  return {
    userId: entry.userId,
    sessionId: entry.sessionId,
    attempt: {
      ...entry.attempt,
      result: {
        ...entry.attempt.result,
        metadata: { ...entry.attempt.result.metadata },
      },
    },
  };
}

function compareEntries(left: AttemptEntry, right: AttemptEntry): number {
  const leftTime = left.attempt.clientCreatedAt;
  const rightTime = right.attempt.clientCreatedAt;
  if (leftTime !== undefined && rightTime !== undefined && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  if (leftTime !== undefined && rightTime === undefined) return -1;
  if (leftTime === undefined && rightTime !== undefined) return 1;
  const session = left.sessionId.localeCompare(right.sessionId);
  return session || left.attempt.attemptId.localeCompare(right.attempt.attemptId);
}

export function consolidateAttempts({
  expectedUserId,
  expectedSessionId,
  local,
  remote,
}: {
  expectedUserId: string;
  expectedSessionId?: string;
  local: readonly AttemptEntry[];
  remote: readonly AttemptEntry[];
}): ConsolidatedAttempts {
  const conflicts: AttemptConflict[] = [];
  const byId = new Map<string, AttemptEntry>();

  const accept = (entry: AttemptEntry, prefer: boolean) => {
    if (
      entry.userId !== expectedUserId ||
      (expectedSessionId !== undefined && entry.sessionId !== expectedSessionId) ||
      !isAttemptRecord(entry.attempt)
    ) {
      conflicts.push({ attemptId: entry.attempt?.attemptId ?? "", code: "scope_conflict" });
      return;
    }
    const existing = byId.get(entry.attempt.attemptId);
    if (!existing) {
      byId.set(entry.attempt.attemptId, cloneEntry(entry));
      return;
    }
    if (!sameAttempt(existing, entry)) {
      conflicts.push({ attemptId: entry.attempt.attemptId, code: "payload_conflict" });
    }
    if (prefer) byId.set(entry.attempt.attemptId, cloneEntry(entry));
  };

  remote.forEach((entry) => accept(entry, false));
  local.forEach((entry) => accept(entry, true));
  return {
    entries: [...byId.values()].sort(compareEntries),
    conflicts,
  };
}
