import type { SupabaseClient } from "@supabase/supabase-js";
import {
  localAttemptRepository,
  remoteAttemptRepository,
} from "@/data/repositories/DualAttemptRepository";
import { attemptSyncQueue } from "@/data/sync/syncQueue";
import {
  applyAttemptsToReviewStates,
  dueReviews,
  projectLocalReviews,
  type ReviewState,
} from "@/domain/review/reviewProjection";
import type { AttemptRecord } from "@/domain/session/sessionReducer";
import { getSupabase, WRITES_ENABLED } from "@/lib/supabase";

interface RemoteReviewRow {
  user_id?: unknown;
  questao_id?: unknown;
  acertos_seguidos?: unknown;
  total_tentativas?: unknown;
  total_acertos?: unknown;
  proxima_revisao_em?: unknown;
  ultima_resposta_em?: unknown;
  ultimo_attempt_id?: unknown;
}

const REVIEW_COLUMNS =
  "user_id, questao_id, acertos_seguidos, total_tentativas, total_acertos, proxima_revisao_em, ultima_resposta_em, ultimo_attempt_id";

export class RemoteReviewError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean, cause?: unknown) {
    super(message);
    this.name = "RemoteReviewError";
    this.retryable = retryable;
    this.cause = cause;
  }
}

function nonNegativeInteger(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function timestamp(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "string") return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseReview(row: RemoteReviewRow, expectedUserId: string): ReviewState {
  const questionId = nonNegativeInteger(row.questao_id);
  const consecutiveCorrect = nonNegativeInteger(row.acertos_seguidos);
  const totalAttempts = nonNegativeInteger(row.total_tentativas);
  const totalCorrect = nonNegativeInteger(row.total_acertos);
  const nextReviewAt = timestamp(row.proxima_revisao_em);
  const lastAnsweredAt = timestamp(row.ultima_resposta_em);
  if (
    row.user_id !== expectedUserId ||
    questionId === null ||
    questionId <= 0 ||
    consecutiveCorrect === null ||
    totalAttempts === null ||
    totalCorrect === null ||
    totalCorrect > totalAttempts ||
    Number.isNaN(nextReviewAt) ||
    Number.isNaN(lastAnsweredAt) ||
    (row.ultimo_attempt_id !== null &&
      row.ultimo_attempt_id !== undefined &&
      typeof row.ultimo_attempt_id !== "string")
  ) {
    throw new RemoteReviewError("Dados remotos de revisão inválidos.", false);
  }
  return {
    questionId,
    consecutiveCorrect,
    totalAttempts,
    totalCorrect,
    nextReviewAt,
    lastAnsweredAt,
    ...(typeof row.ultimo_attempt_id === "string" ? { lastAttemptId: row.ultimo_attempt_id } : {}),
  };
}

function remoteError(error: unknown): RemoteReviewError {
  const candidate = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const status = typeof candidate.status === "number" ? candidate.status : Number(candidate.status);
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const retryable =
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    (!Number.isFinite(status) && !code) ||
    code.startsWith("08") ||
    code === "57014";
  return new RemoteReviewError("Não foi possível carregar as revisões.", retryable, error);
}

export class SupabaseReviewRepository {
  constructor(private readonly clientFactory: () => SupabaseClient = getSupabase) {}

  async listByUser(userId: string): Promise<ReviewState[]> {
    const { data, error } = await this.clientFactory()
      .from("revisoes_questoes")
      .select(REVIEW_COLUMNS)
      .eq("user_id", userId)
      .order("proxima_revisao_em", { ascending: true, nullsFirst: false });
    if (error) throw remoteError(error);
    if (!Array.isArray(data)) {
      throw new RemoteReviewError("Resposta remota de revisões inválida.", false);
    }
    return data.map((row) => parseReview(row as RemoteReviewRow, userId));
  }

  async listDue(userId: string, now: number = Date.now()): Promise<ReviewState[]> {
    const { data, error } = await this.clientFactory()
      .from("revisoes_questoes")
      .select(REVIEW_COLUMNS)
      .eq("user_id", userId)
      .lte("proxima_revisao_em", new Date(now).toISOString())
      .order("proxima_revisao_em", { ascending: true });
    if (error) throw remoteError(error);
    if (!Array.isArray(data)) {
      throw new RemoteReviewError("Resposta remota de revisões inválida.", false);
    }
    return data.map((row) => parseReview(row as RemoteReviewRow, userId));
  }
}

export interface ReviewReadResult {
  reviews: ReviewState[];
  localOnly: boolean;
  error?: string;
}

export class DualReviewRepository {
  constructor(
    private readonly loadLocalAttempts: (userId: string) => Promise<AttemptRecord[]>,
    private readonly remote: SupabaseReviewRepository,
    private readonly remoteReadsEnabled = true,
    private readonly isOnline: () => boolean = () =>
      typeof navigator === "undefined" || navigator.onLine,
    private readonly loadPendingAttempts: (userId: string) => AttemptRecord[] = (userId) =>
      attemptSyncQueue.list(userId).map((item) => item.payload.attempt),
    private readonly loadRemoteAttemptIds?: (userId: string) => Promise<Set<string>>,
  ) {}

  async listDue(userId: string, now: number = Date.now()): Promise<ReviewReadResult> {
    const localAttempts = await this.loadLocalAttempts(userId);
    if (!this.remoteReadsEnabled || !this.isOnline()) {
      return {
        reviews: dueReviews(projectLocalReviews(localAttempts), now),
        localOnly: true,
      };
    }
    try {
      const remote = await this.remote.listByUser(userId);
      const remoteAttemptIds = this.loadRemoteAttemptIds
        ? await this.loadRemoteAttemptIds(userId)
        : new Set(remote.flatMap((review) => (review.lastAttemptId ? [review.lastAttemptId] : [])));
      const pending = this.loadPendingAttempts(userId).filter(
        (attempt) => !remoteAttemptIds.has(attempt.attemptId),
      );
      const combined = applyAttemptsToReviewStates(remote, pending);
      return { reviews: dueReviews(combined, now), localOnly: false };
    } catch {
      return {
        reviews: dueReviews(projectLocalReviews(localAttempts), now),
        localOnly: true,
        error: "Não foi possível carregar revisões remotas. A agenda local continua disponível.",
      };
    }
  }
}

const supabaseReviewRepository = new SupabaseReviewRepository();

export const reviewRepository = new DualReviewRepository(
  (userId) => localAttemptRepository.listByUser(userId),
  supabaseReviewRepository,
  WRITES_ENABLED,
  undefined,
  undefined,
  async (userId) =>
    new Set(
      (await remoteAttemptRepository.listEntriesByUser(userId)).map(
        (entry) => entry.attempt.attemptId,
      ),
    ),
);

export const reviewSerialization = { parseReview };
