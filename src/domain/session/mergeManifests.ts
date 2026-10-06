import { isSessionManifest, type SessionManifest } from "@/domain/session/sessionManifest";

export type ManifestConflictCode =
  | "invalid_manifest"
  | "wrong_user"
  | "question_ids_changed"
  | "immutable_fields_changed";

export class ManifestConflictError extends Error {
  readonly code: ManifestConflictCode;
  readonly retryable = false;

  constructor(code: ManifestConflictCode) {
    super(
      code === "question_ids_changed"
        ? "Não foi possível combinar uma sessão: os IDs congelados não podem ser alterados."
        : "Não foi possível combinar uma sessão recuperada com os dados deste dispositivo.",
    );
    this.name = "ManifestConflictError";
    this.code = code;
  }
}

function sameQuestionIds(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function frozenCopy(manifest: SessionManifest): SessionManifest {
  return {
    ...manifest,
    source: { ...manifest.source },
    criteria: { ...manifest.criteria },
    questionIds: Object.freeze([...manifest.questionIds]),
  };
}

function normalizedJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  };
  return JSON.stringify(normalize(value));
}

function resolveStatus(local: SessionManifest, remote: SessionManifest): SessionManifest["status"] {
  if (local.status === "completed" || remote.status === "completed") return "completed";
  if (local.status === "abandoned" || remote.status === "abandoned") return "abandoned";
  if (local.status === "active" || remote.status === "active") return "active";
  return "created";
}

export function mergeManifestSnapshots({
  expectedUserId,
  local,
  remote,
  localPending: _localPending = false,
}: {
  expectedUserId: string;
  local: SessionManifest | null;
  remote: SessionManifest;
  localPending?: boolean;
}): SessionManifest {
  void _localPending;
  if (!isSessionManifest(remote) || (local !== null && !isSessionManifest(local))) {
    throw new ManifestConflictError("invalid_manifest");
  }
  if (remote.userId !== expectedUserId || (local !== null && local.userId !== expectedUserId)) {
    throw new ManifestConflictError("wrong_user");
  }
  if (!local) return frozenCopy(remote);
  if (!sameQuestionIds(local.questionIds, remote.questionIds)) {
    throw new ManifestConflictError("question_ids_changed");
  }
  if (
    local.id !== remote.id ||
    local.schemaVersion !== remote.schemaVersion ||
    local.createdAt !== remote.createdAt ||
    normalizedJson(local.source) !== normalizedJson(remote.source) ||
    normalizedJson(local.criteria) !== normalizedJson(remote.criteria)
  ) {
    throw new ManifestConflictError("immutable_fields_changed");
  }

  const status = resolveStatus(local, remote);
  const updatedAt = Math.max(local.updatedAt, remote.updatedAt);
  const currentIndex =
    status === "completed"
      ? local.questionIds.length
      : Math.min(local.questionIds.length, Math.max(local.currentIndex, remote.currentIndex));
  const completedAt =
    status === "completed"
      ? remote.status === "completed" && remote.completedAt !== undefined
        ? remote.completedAt
        : local.status === "completed" && local.completedAt !== undefined
          ? local.completedAt
          : updatedAt
      : undefined;

  return frozenCopy({
    ...remote,
    status,
    currentIndex,
    updatedAt,
    ...(completedAt === undefined ? { completedAt: undefined } : { completedAt }),
  });
}
