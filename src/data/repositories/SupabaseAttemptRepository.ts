import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isAttemptRecord,
  type AttemptEntry,
  type AttemptRepository,
} from "@/data/repositories/AttemptRepository";
import { isEvaluationStatus } from "@/domain/answers/evaluationTypes";
import type { AttemptRecord } from "@/domain/session/sessionReducer";
import { getSupabase } from "@/lib/supabase";

export interface RemoteAttemptSaveResult {
  inserted: boolean;
  alreadyExisted: boolean;
  nextReviewAt: string | null;
}

export class RemoteAttemptError extends Error {
  readonly retryable: boolean;
  readonly code?: string;

  constructor(message: string, options: { retryable: boolean; code?: string; cause?: unknown }) {
    super(message);
    this.name = "RemoteAttemptError";
    this.retryable = options.retryable;
    this.code = options.code;
    this.cause = options.cause;
  }
}

interface RemoteAttemptRow {
  user_id?: unknown;
  attempt_id?: unknown;
  session_id?: unknown;
  questao_id?: unknown;
  resposta_aluno?: unknown;
  resposta_correta?: unknown;
  feedback?: unknown;
  tempo_segundos?: unknown;
  result_status?: unknown;
  client_created_at?: unknown;
  modo_estudo?: unknown;
  metadados?: unknown;
}

interface RpcResultRow {
  inserted?: unknown;
  already_existed?: unknown;
  next_review_at?: unknown;
}

interface RemoteAttemptIdentityRow {
  user_id?: unknown;
  attempt_id?: unknown;
}

const REMOTE_COLUMNS =
  "user_id, attempt_id, session_id, questao_id, resposta_aluno, resposta_correta, feedback, tempo_segundos, result_status, client_created_at, modo_estudo, metadados";
const REMOTE_ID_COLUMNS = "user_id, attempt_id";

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function reconstructAttempt(
  row: RemoteAttemptRow,
  expectedUserId: string,
  expectedSessionId?: string,
): AttemptRecord | null {
  const questionId = finiteNumber(row.questao_id);
  const seconds = finiteNumber(row.tempo_segundos);
  if (
    row.user_id !== expectedUserId ||
    typeof row.attempt_id !== "string" ||
    row.attempt_id.length === 0 ||
    typeof row.session_id !== "string" ||
    row.session_id.length === 0 ||
    (expectedSessionId !== undefined && row.session_id !== expectedSessionId) ||
    questionId === null ||
    !Number.isSafeInteger(questionId) ||
    questionId <= 0 ||
    seconds === null ||
    seconds < 0 ||
    !isEvaluationStatus(row.result_status)
  ) {
    return null;
  }

  const metadata = objectValue(row.metadados);
  const clientCreatedAtSupplied = metadata.client_created_at_supplied;
  if (clientCreatedAtSupplied !== undefined && typeof clientCreatedAtSupplied !== "boolean") {
    return null;
  }
  const evaluationMetadata = objectValue(metadata.evaluation_metadata);
  const milliseconds = finiteNumber(metadata.tempo_ms);
  const correctAnswer = typeof row.resposta_correta === "string" ? row.resposta_correta : "";
  const createdAt =
    typeof row.client_created_at === "string" ? Date.parse(row.client_created_at) : Number.NaN;
  if (clientCreatedAtSupplied === true && !Number.isFinite(createdAt)) return null;
  const attempt: AttemptRecord = {
    attemptId: row.attempt_id,
    questionId,
    timeMs: Math.max(0, Math.round(milliseconds ?? seconds * 1000)),
    result: {
      status: row.result_status,
      studentAnswerDisplay: typeof row.resposta_aluno === "string" ? row.resposta_aluno : "",
      correctAnswerDisplay: correctAnswer,
      normalizedStudentAnswer:
        typeof metadata.normalized_student_answer === "string"
          ? metadata.normalized_student_answer
          : "",
      normalizedCorrectAnswer: correctAnswer.trim().toLocaleLowerCase("pt-BR"),
      explanation: typeof row.feedback === "string" ? row.feedback : "",
      diagnosticCode: typeof metadata.diagnostic_code === "string" ? metadata.diagnostic_code : "",
      metadata: evaluationMetadata,
    },
    ...(clientCreatedAtSupplied !== false && Number.isFinite(createdAt)
      ? { clientCreatedAt: createdAt }
      : {}),
    ...(typeof row.modo_estudo === "string" ? { sessionMode: row.modo_estudo } : {}),
  };
  return isAttemptRecord(attempt) ? attempt : null;
}

function classifyError(error: unknown): RemoteAttemptError {
  const candidate =
    error && typeof error === "object" ? (error as Record<string, unknown>) : undefined;
  const code = typeof candidate?.code === "string" ? candidate.code : undefined;
  const status = finiteNumber(candidate?.status);
  const retryable =
    status === 408 ||
    status === 429 ||
    (status !== null && status >= 500) ||
    (!code && status === null) ||
    (code !== undefined && (code.startsWith("08") || code === "57014"));
  return new RemoteAttemptError("Não foi possível sincronizar a tentativa.", {
    retryable,
    code,
    cause: error,
  });
}

function serializeAttempt(sessionId: string, attempt: AttemptRecord) {
  return {
    p_attempt_id: attempt.attemptId,
    p_session_id: sessionId,
    p_questao_id: attempt.questionId,
    p_resposta_aluno: attempt.result.studentAnswerDisplay,
    p_result_status: attempt.result.status,
    p_feedback: attempt.result.explanation,
    p_tempo_ms: Math.max(0, Math.round(attempt.timeMs)),
    p_modo_estudo: attempt.sessionMode ?? "study",
    p_metadados: {
      diagnostic_code: attempt.result.diagnosticCode,
      normalized_student_answer: attempt.result.normalizedStudentAnswer,
      evaluation_metadata: attempt.result.metadata,
    },
    p_client_created_at:
      attempt.clientCreatedAt === undefined
        ? null
        : new Date(attempt.clientCreatedAt).toISOString(),
  };
}

type SerializedAttemptPayload = ReturnType<typeof serializeAttempt>;

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeJson(item)]),
  );
}

function sameSerializedPayload(
  left: SerializedAttemptPayload,
  right: SerializedAttemptPayload,
): boolean {
  return (
    left.p_attempt_id === right.p_attempt_id &&
    left.p_session_id === right.p_session_id &&
    left.p_questao_id === right.p_questao_id &&
    left.p_resposta_aluno === right.p_resposta_aluno &&
    left.p_result_status === right.p_result_status &&
    left.p_feedback === right.p_feedback &&
    left.p_tempo_ms === right.p_tempo_ms &&
    left.p_modo_estudo === right.p_modo_estudo &&
    left.p_client_created_at === right.p_client_created_at &&
    JSON.stringify(normalizeJson(left.p_metadados)) ===
      JSON.stringify(normalizeJson(right.p_metadados))
  );
}

export class SupabaseAttemptRepository implements AttemptRepository {
  constructor(private readonly clientFactory: () => SupabaseClient = getSupabase) {}

  async save(userId: string, sessionId: string, attempt: AttemptRecord): Promise<void> {
    await this.saveRemote(userId, sessionId, attempt);
  }

  async saveRemote(
    userId: string,
    sessionId: string,
    attempt: AttemptRecord,
  ): Promise<RemoteAttemptSaveResult> {
    if (!userId || !sessionId || !isAttemptRecord(attempt)) {
      throw new RemoteAttemptError("Tentativa inválida.", { retryable: false });
    }
    const { data, error } = await this.clientFactory().rpc(
      "registrar_tentativa_estudo",
      serializeAttempt(sessionId, attempt),
    );
    if (error) throw classifyError(error);
    const row = (Array.isArray(data) ? data[0] : data) as RpcResultRow | null;
    if (
      !row ||
      typeof row.inserted !== "boolean" ||
      typeof row.already_existed !== "boolean" ||
      (!row.inserted && !row.already_existed)
    ) {
      throw new RemoteAttemptError("Resposta inválida da sincronização.", { retryable: false });
    }
    return {
      inserted: row.inserted,
      alreadyExisted: row.already_existed,
      nextReviewAt: typeof row.next_review_at === "string" ? row.next_review_at : null,
    };
  }

  async load(userId: string, sessionId: string): Promise<AttemptRecord[]> {
    return (await this.loadEntries(userId, sessionId)).map((entry) => entry.attempt);
  }

  async loadEntries(userId: string, sessionId: string): Promise<AttemptEntry[]> {
    if (!userId || !sessionId) return [];
    const { data, error } = await this.clientFactory()
      .from("tentativas")
      .select(REMOTE_COLUMNS)
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .order("respondido_em", { ascending: true });
    if (error) throw classifyError(error);
    return this.parseRows(data, userId, sessionId);
  }

  async listByUser(userId: string): Promise<AttemptRecord[]> {
    return (await this.listEntriesByUser(userId)).map((entry) => entry.attempt);
  }

  async listEntriesByUser(userId: string): Promise<AttemptEntry[]> {
    if (!userId) return [];
    const { data, error } = await this.clientFactory()
      .from("tentativas")
      .select(REMOTE_COLUMNS)
      .eq("user_id", userId)
      .order("respondido_em", { ascending: true });
    if (error) throw classifyError(error);
    return this.parseRows(data, userId);
  }

  async listAttemptIdsByUser(userId: string): Promise<Set<string>> {
    if (!userId) return new Set();
    const { data, error } = await this.clientFactory()
      .from("tentativas")
      .select(REMOTE_ID_COLUMNS)
      .eq("user_id", userId)
      .order("attempt_id", { ascending: true });
    if (error) throw classifyError(error);
    if (!Array.isArray(data)) {
      throw new RemoteAttemptError("Resposta remota malformada.", { retryable: false });
    }
    const ids = new Set<string>();
    for (const value of data) {
      const row = value as RemoteAttemptIdentityRow;
      if (
        row.user_id !== userId ||
        typeof row.attempt_id !== "string" ||
        row.attempt_id.length === 0
      ) {
        throw new RemoteAttemptError("Tentativa remota malformada ou de outro usuário.", {
          retryable: false,
        });
      }
      ids.add(row.attempt_id);
    }
    return ids;
  }

  async clear(): Promise<void> {
    // Remote attempts are immutable audit records. Restart only clears the local snapshot.
  }

  private parseRows(data: unknown, userId: string, sessionId?: string): AttemptEntry[] {
    if (!Array.isArray(data)) {
      throw new RemoteAttemptError("Resposta remota malformada.", { retryable: false });
    }
    const byId = new Map<string, AttemptEntry>();
    for (const value of data) {
      const row = value as RemoteAttemptRow;
      const attempt = reconstructAttempt(row, userId, sessionId);
      if (!attempt || typeof row.session_id !== "string") {
        throw new RemoteAttemptError("Tentativa remota malformada ou de outro usuário.", {
          retryable: false,
        });
      }
      if (!byId.has(attempt.attemptId)) {
        byId.set(attempt.attemptId, {
          userId,
          sessionId: row.session_id,
          attempt,
        });
      }
    }
    return [...byId.values()];
  }
}

export const attemptSerialization = {
  serializeAttempt,
  reconstructAttempt,
  sameSerializedPayload,
};
