import { isSessionManifest, type SessionManifest } from "@/domain/session/sessionManifest";

export type ManifestConflictCode = "invalid_manifest" | "wrong_user" | "question_ids_changed";

export class ManifestConflictError extends Error {
  readonly code: ManifestConflictCode;

  constructor(code: ManifestConflictCode) {
    super("Não foi possível combinar uma sessão recuperada com os dados deste dispositivo.");
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

function isTerminal(manifest: SessionManifest): boolean {
  return manifest.status === "completed" || manifest.status === "abandoned";
}

export function mergeManifestSnapshots({
  expectedUserId,
  local,
  remote,
  localPending = false,
}: {
  expectedUserId: string;
  local: SessionManifest | null;
  remote: SessionManifest;
  localPending?: boolean;
}): SessionManifest {
  if (!isSessionManifest(remote) || (local !== null && !isSessionManifest(local))) {
    throw new ManifestConflictError("invalid_manifest");
  }
  if (remote.userId !== expectedUserId || (local !== null && local.userId !== expectedUserId)) {
    throw new ManifestConflictError("wrong_user");
  }
  if (!local) return frozenCopy(remote);
  if (local.id !== remote.id || !sameQuestionIds(local.questionIds, remote.questionIds)) {
    throw new ManifestConflictError("question_ids_changed");
  }
  if (localPending) return frozenCopy(local);

  const localTerminal = isTerminal(local);
  const remoteTerminal = isTerminal(remote);
  if (localTerminal !== remoteTerminal) {
    return frozenCopy(localTerminal ? local : remote);
  }
  const newer = remote.updatedAt > local.updatedAt ? remote : local;
  const older = newer === remote ? local : remote;
  if (newer.currentIndex < older.currentIndex) return frozenCopy(older);
  return frozenCopy(newer);
}
