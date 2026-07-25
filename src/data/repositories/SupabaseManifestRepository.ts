import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSessionManifest,
  type SessionManifest,
  type SessionStatus,
} from "@/domain/session/sessionManifest";
import { ManifestConflictError, mergeManifestSnapshots } from "@/domain/session/mergeManifests";
import { getSupabase } from "@/lib/supabase";

export class RemoteManifestError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean, cause?: unknown) {
    super(message);
    this.name = "RemoteManifestError";
    this.retryable = retryable;
    this.cause = cause;
  }
}

interface RemoteManifestRow {
  id?: unknown;
  user_id?: unknown;
  schema_version?: unknown;
  source?: unknown;
  criteria?: unknown;
  question_ids?: unknown;
  status?: unknown;
  current_index?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  completed_at?: unknown;
}

const MANIFEST_COLUMNS =
  "id, user_id, schema_version, source, criteria, question_ids, status, current_index, created_at, updated_at, completed_at";
const DEFAULT_MAX_SYNC_ATTEMPTS = 3;

export interface SupabaseManifestRepositoryOptions {
  maxSyncAttempts?: number;
  now?: () => number;
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseManifest(row: RemoteManifestRow, expectedUserId: string): SessionManifest {
  const createdAt = parseTimestamp(row.created_at);
  const updatedAt = parseTimestamp(row.updated_at);
  const completedAt = row.completed_at === null ? undefined : parseTimestamp(row.completed_at);
  const candidate = {
    schemaVersion: row.schema_version,
    id: row.id,
    userId: row.user_id,
    source: row.source,
    criteria: row.criteria,
    questionIds: row.question_ids,
    status: row.status,
    currentIndex: row.current_index,
    createdAt,
    updatedAt,
    ...(completedAt === undefined ? {} : { completedAt }),
  };
  if (row.user_id !== expectedUserId || !isSessionManifest(candidate)) {
    throw new RemoteManifestError("Manifest remoto malformado ou de outro usuário.", false);
  }
  return {
    ...candidate,
    questionIds: Object.freeze([...candidate.questionIds]),
  };
}

interface RemoteManifestVersion {
  manifest: SessionManifest;
  updatedAtToken: string;
}

function parseManifestVersion(
  row: RemoteManifestRow,
  expectedUserId: string,
): RemoteManifestVersion {
  if (typeof row.updated_at !== "string") {
    throw new RemoteManifestError("Manifest remoto sem versão válida.", false);
  }
  return {
    manifest: parseManifest(row, expectedUserId),
    // Keep the original text, including any sub-millisecond precision, for CAS.
    updatedAtToken: row.updated_at,
  };
}

function rowFromManifest(manifest: SessionManifest) {
  return {
    id: manifest.id,
    user_id: manifest.userId,
    schema_version: manifest.schemaVersion,
    source: manifest.source,
    criteria: manifest.criteria,
    question_ids: [...manifest.questionIds],
    status: manifest.status,
    current_index: manifest.currentIndex,
    created_at: new Date(manifest.createdAt).toISOString(),
    updated_at: new Date(manifest.updatedAt).toISOString(),
    completed_at:
      manifest.completedAt === undefined ? null : new Date(manifest.completedAt).toISOString(),
  };
}

function mutableRowFromManifest(manifest: SessionManifest) {
  return {
    status: manifest.status,
    current_index: manifest.currentIndex,
    updated_at: new Date(manifest.updatedAt).toISOString(),
    completed_at:
      manifest.completedAt === undefined ? null : new Date(manifest.completedAt).toISOString(),
  };
}

function hasSameRemoteState(left: SessionManifest, right: SessionManifest): boolean {
  return (
    left.status === right.status &&
    left.currentIndex === right.currentIndex &&
    left.completedAt === right.completedAt
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function remoteError(error: unknown): RemoteManifestError {
  const candidate =
    error && typeof error === "object" ? (error as Record<string, unknown>) : undefined;
  const status =
    typeof candidate?.status === "number" ? candidate.status : Number(candidate?.status);
  const code = typeof candidate?.code === "string" ? candidate.code : "";
  const retryable =
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    (!Number.isFinite(status) && !code) ||
    code.startsWith("08") ||
    code === "57014";
  return new RemoteManifestError("Não foi possível sincronizar a sessão.", retryable, error);
}

export class SupabaseManifestRepository {
  private readonly maxSyncAttempts: number;
  private readonly now: () => number;

  constructor(
    private readonly clientFactory: () => SupabaseClient = getSupabase,
    options: SupabaseManifestRepositoryOptions = {},
  ) {
    this.maxSyncAttempts =
      Number.isSafeInteger(options.maxSyncAttempts) && (options.maxSyncAttempts ?? 0) > 0
        ? options.maxSyncAttempts!
        : DEFAULT_MAX_SYNC_ATTEMPTS;
    this.now = options.now ?? Date.now;
  }

  async synchronize(manifest: SessionManifest): Promise<SessionManifest> {
    if (!isSessionManifest(manifest)) {
      throw new RemoteManifestError("Manifest local inválido.", false);
    }
    const client = this.clientFactory();

    for (let attempt = 0; attempt < this.maxSyncAttempts; attempt++) {
      const current = await this.readCurrent(client, manifest.userId, manifest.id);
      if (!current) {
        const { data, error } = await client
          .from("sessoes_estudo")
          .insert(rowFromManifest(manifest))
          .select(MANIFEST_COLUMNS)
          .maybeSingle();
        if (error) {
          if (isUniqueViolation(error)) continue;
          throw remoteError(error);
        }
        if (!data) continue;
        const inserted = parseManifest(data as RemoteManifestRow, manifest.userId);
        if (!this.isConfirmed(manifest, inserted)) continue;
        return inserted;
      }

      let merged: SessionManifest;
      try {
        merged = mergeManifestSnapshots({
          expectedUserId: manifest.userId,
          local: manifest,
          remote: current.manifest,
        });
      } catch (error) {
        if (error instanceof ManifestConflictError) {
          throw new RemoteManifestError(
            "Manifest remoto incompatível com o snapshot local.",
            false,
            error,
          );
        }
        throw error;
      }

      if (hasSameRemoteState(merged, current.manifest)) {
        return current.manifest;
      }

      const nextUpdatedAt = Math.max(
        this.now(),
        manifest.updatedAt,
        merged.updatedAt,
        current.manifest.updatedAt + 1,
      );
      const candidate: SessionManifest = {
        ...merged,
        updatedAt: nextUpdatedAt,
      };
      const { data, error } = await client
        .from("sessoes_estudo")
        .update(mutableRowFromManifest(candidate))
        .eq("id", manifest.id)
        .eq("user_id", manifest.userId)
        .eq("updated_at", current.updatedAtToken)
        .select(MANIFEST_COLUMNS)
        .maybeSingle();
      if (error) throw remoteError(error);
      if (!data) continue;
      const saved = parseManifest(data as RemoteManifestRow, manifest.userId);
      if (!this.isConfirmed(manifest, saved)) continue;
      return saved;
    }

    throw new RemoteManifestError(
      "A sessão mudou em outro dispositivo durante a sincronização.",
      true,
    );
  }

  async upsert(manifest: SessionManifest): Promise<SessionManifest> {
    return this.synchronize(manifest);
  }

  async updateStatus(
    userId: string,
    manifestId: string,
    status: SessionStatus,
  ): Promise<SessionManifest | null> {
    const current = await this.get(userId, manifestId);
    if (!current) return null;
    const now = Math.max(this.now(), current.updatedAt + 1);
    return this.synchronize({
      ...current,
      status,
      updatedAt: now,
      ...(status === "completed"
        ? { currentIndex: current.questionIds.length, completedAt: now }
        : {}),
    } as SessionManifest);
  }

  async updateCurrentIndex(
    userId: string,
    manifestId: string,
    currentIndex: number,
  ): Promise<SessionManifest | null> {
    if (!Number.isSafeInteger(currentIndex) || currentIndex < 0) {
      throw new RemoteManifestError("Índice remoto inválido.", false);
    }
    const current = await this.get(userId, manifestId);
    if (!current) return null;
    return this.synchronize({
      ...current,
      currentIndex: Math.min(currentIndex, current.questionIds.length),
      updatedAt: Math.max(this.now(), current.updatedAt + 1),
    });
  }

  async complete(userId: string, manifestId: string): Promise<SessionManifest | null> {
    return this.updateStatus(userId, manifestId, "completed");
  }

  async get(userId: string, manifestId: string): Promise<SessionManifest | null> {
    return (await this.readCurrent(this.clientFactory(), userId, manifestId))?.manifest ?? null;
  }

  async listRecoverable(userId: string): Promise<SessionManifest[]> {
    const { data, error } = await this.clientFactory()
      .from("sessoes_estudo")
      .select(MANIFEST_COLUMNS)
      .eq("user_id", userId)
      .in("status", ["created", "active"])
      .order("updated_at", { ascending: false });
    if (error) throw remoteError(error);
    if (!Array.isArray(data)) {
      throw new RemoteManifestError("Resposta remota de sessões inválida.", false);
    }
    return data.map((row) => parseManifest(row as RemoteManifestRow, userId));
  }

  async listByUser(userId: string): Promise<SessionManifest[]> {
    const { data, error } = await this.clientFactory()
      .from("sessoes_estudo")
      .select(MANIFEST_COLUMNS)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw remoteError(error);
    if (!Array.isArray(data)) {
      throw new RemoteManifestError("Resposta remota de sessões inválida.", false);
    }
    return data.map((row) => parseManifest(row as RemoteManifestRow, userId));
  }

  private async readCurrent(
    client: SupabaseClient,
    userId: string,
    manifestId: string,
  ): Promise<RemoteManifestVersion | null> {
    const { data, error } = await client
      .from("sessoes_estudo")
      .select(MANIFEST_COLUMNS)
      .eq("id", manifestId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw remoteError(error);
    return data ? parseManifestVersion(data as RemoteManifestRow, userId) : null;
  }

  private isConfirmed(local: SessionManifest, remote: SessionManifest): boolean {
    try {
      const confirmed = mergeManifestSnapshots({
        expectedUserId: local.userId,
        local,
        remote,
      });
      return hasSameRemoteState(confirmed, remote);
    } catch (error) {
      if (error instanceof ManifestConflictError) {
        throw new RemoteManifestError(
          "Manifest remoto incompatível com o snapshot local.",
          false,
          error,
        );
      }
      throw error;
    }
  }
}

export const manifestSerialization = { parseManifest, rowFromManifest };
