import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSessionManifest,
  type SessionManifest,
  type SessionStatus,
} from "@/domain/session/sessionManifest";
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
  constructor(private readonly clientFactory: () => SupabaseClient = getSupabase) {}

  async upsert(manifest: SessionManifest): Promise<SessionManifest> {
    if (!isSessionManifest(manifest)) {
      throw new RemoteManifestError("Manifest local inválido.", false);
    }
    const { data, error } = await this.clientFactory()
      .from("sessoes_estudo")
      .upsert(rowFromManifest(manifest), { onConflict: "id" })
      .select(MANIFEST_COLUMNS)
      .single();
    if (error) throw remoteError(error);
    return parseManifest(data as RemoteManifestRow, manifest.userId);
  }

  async updateStatus(
    userId: string,
    manifestId: string,
    status: SessionStatus,
  ): Promise<SessionManifest | null> {
    const now = new Date().toISOString();
    const changes = {
      status,
      updated_at: now,
      ...(status === "completed" ? { completed_at: now } : {}),
    };
    return this.update(userId, manifestId, changes);
  }

  async updateCurrentIndex(
    userId: string,
    manifestId: string,
    currentIndex: number,
  ): Promise<SessionManifest | null> {
    if (!Number.isSafeInteger(currentIndex) || currentIndex < 0) {
      throw new RemoteManifestError("Índice remoto inválido.", false);
    }
    return this.update(userId, manifestId, {
      current_index: currentIndex,
      updated_at: new Date().toISOString(),
    });
  }

  async complete(userId: string, manifestId: string): Promise<SessionManifest | null> {
    return this.updateStatus(userId, manifestId, "completed");
  }

  async get(userId: string, manifestId: string): Promise<SessionManifest | null> {
    const { data, error } = await this.clientFactory()
      .from("sessoes_estudo")
      .select(MANIFEST_COLUMNS)
      .eq("id", manifestId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw remoteError(error);
    return data ? parseManifest(data as RemoteManifestRow, userId) : null;
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

  private async update(
    userId: string,
    manifestId: string,
    changes: Record<string, unknown>,
  ): Promise<SessionManifest | null> {
    const { data, error } = await this.clientFactory()
      .from("sessoes_estudo")
      .update(changes)
      .eq("id", manifestId)
      .eq("user_id", userId)
      .select(MANIFEST_COLUMNS)
      .maybeSingle();
    if (error) throw remoteError(error);
    return data ? parseManifest(data as RemoteManifestRow, userId) : null;
  }
}

export const manifestSerialization = { parseManifest, rowFromManifest };
