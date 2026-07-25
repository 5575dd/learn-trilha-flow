import { SUPPORTED_KINDS, type SupportedKind } from "@/domain/questions/questionTypes";

export const SESSION_MANIFEST_SCHEMA_VERSION = 1 as const;

export type SessionStatus = "created" | "active" | "completed" | "abandoned";

export type SessionSource =
  | { kind: "aula"; aulaId: number }
  | { kind: "quick" }
  | { kind: "errors"; fromSessionId?: string }
  | { kind: "dueReview" }
  | { kind: "questionType"; questionType: SupportedKind };

export interface SessionCriteria {
  limit?: number;
  aulaId?: number;
  questionType?: SupportedKind;
  fromSessionId?: string;
}

export interface SessionManifest {
  schemaVersion: typeof SESSION_MANIFEST_SCHEMA_VERSION;
  id: string;
  userId: string;
  source: SessionSource;
  criteria: SessionCriteria;
  questionIds: readonly number[];
  status: SessionStatus;
  currentIndex: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface CreateSessionManifestInput {
  userId: string;
  source: SessionSource;
  criteria?: SessionCriteria;
  questionIds: readonly number[];
}

export function isSessionManifest(value: unknown): value is SessionManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<SessionManifest>;
  return (
    manifest.schemaVersion === SESSION_MANIFEST_SCHEMA_VERSION &&
    typeof manifest.id === "string" &&
    manifest.id.length > 0 &&
    typeof manifest.userId === "string" &&
    manifest.userId.length > 0 &&
    isSessionSource(manifest.source) &&
    isSessionCriteria(manifest.criteria) &&
    Array.isArray(manifest.questionIds) &&
    manifest.questionIds.every((id) => Number.isSafeInteger(id) && id > 0) &&
    new Set(manifest.questionIds).size === manifest.questionIds.length &&
    ["created", "active", "completed", "abandoned"].includes(manifest.status ?? "") &&
    Number.isSafeInteger(manifest.currentIndex) &&
    (manifest.currentIndex ?? -1) >= 0 &&
    (manifest.currentIndex ?? 0) <= manifest.questionIds.length &&
    typeof manifest.createdAt === "number" &&
    typeof manifest.updatedAt === "number" &&
    (manifest.completedAt === undefined || typeof manifest.completedAt === "number")
  );
}

function isSessionCriteria(value: unknown): value is SessionCriteria {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const criteria = value as SessionCriteria;
  return (
    (criteria.limit === undefined ||
      (Number.isSafeInteger(criteria.limit) && criteria.limit >= 0)) &&
    (criteria.aulaId === undefined ||
      (Number.isSafeInteger(criteria.aulaId) && criteria.aulaId > 0)) &&
    (criteria.questionType === undefined || SUPPORTED_KINDS.includes(criteria.questionType)) &&
    (criteria.fromSessionId === undefined || typeof criteria.fromSessionId === "string")
  );
}

function isSessionSource(source: unknown): source is SessionSource {
  if (!source || typeof source !== "object") return false;
  const candidate = source as Partial<SessionSource>;
  switch (candidate.kind) {
    case "aula":
      return (
        Number.isSafeInteger((candidate as { aulaId?: number }).aulaId) &&
        ((candidate as { aulaId: number }).aulaId ?? 0) > 0
      );
    case "quick":
      return true;
    case "errors":
      return (
        (candidate as { fromSessionId?: unknown }).fromSessionId === undefined ||
        typeof (candidate as { fromSessionId?: unknown }).fromSessionId === "string"
      );
    case "dueReview":
      return true;
    case "questionType":
      return SUPPORTED_KINDS.includes(
        (candidate as { questionType?: SupportedKind }).questionType as SupportedKind,
      );
    default:
      return false;
  }
}
