import type { LessonQuestionIndex } from "@/data/queries";
import type { AttemptEntry } from "@/data/repositories/AttemptRepository";
import type { SessionManifest } from "@/domain/session/sessionManifest";

export interface LessonSessionProgress {
  session: number;
  total: number;
  answered: number;
  completed: boolean;
  completedManifest?: SessionManifest;
  activeManifest?: SessionManifest;
  available: boolean;
}

export interface LessonProgress {
  status: "not-started" | "in-progress" | "completed";
  sessions: LessonSessionProgress[];
  completedSessions: number;
  totalSessions: number;
}

export function buildLessonProgress(
  userId: string,
  aulaId: number,
  questions: readonly LessonQuestionIndex[],
  manifests: readonly SessionManifest[],
  entries: readonly AttemptEntry[],
  now = Date.now(),
): LessonProgress {
  const rows = questions.filter((q) => q.aula_id === aulaId && [1, 2, 3].includes(q.sessao));
  const lessonManifests = manifests
    .filter((m) => m.userId === userId && m.source.kind === "aula" && m.source.aulaId === aulaId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const answered = new Set(
    entries
      .filter(
        (entry) =>
          entry.userId === userId && !["invalid", "skipped"].includes(entry.attempt.result.status),
      )
      .map((entry) => entry.attempt.questionId),
  );
  const sessions = [...new Set(rows.map((q) => q.sessao))].sort().map((session) => {
    const group = rows.filter((q) => q.sessao === session);
    const ids = group.map((q) => q.id);
    // A quick drill or a partially covered session never counts as a completed lesson.
    const completedManifest = lessonManifests.find(
      (m) => m.status === "completed" && ids.every((id) => m.questionIds.includes(id)),
    );
    const activeManifest = lessonManifests.find(
      (m) =>
        ["created", "active"].includes(m.status) &&
        m.questionIds.length === ids.length &&
        ids.every((id) => m.questionIds.includes(id)) &&
        (m.currentIndex > 0 ||
          entries.some((entry) => entry.userId === userId && entry.sessionId === m.id)),
    );
    return {
      session,
      total: ids.length,
      answered: ids.filter((id) => answered.has(id)).length,
      completed: !!completedManifest,
      completedManifest,
      activeManifest,
      available: group.every(
        (q) =>
          !q.proxima_revisao_em ||
          !Number.isFinite(Date.parse(q.proxima_revisao_em)) ||
          Date.parse(q.proxima_revisao_em) <= now,
      ),
    };
  });
  const completedSessions = sessions.filter((s) => s.completed).length;
  return {
    status:
      sessions.length > 0 && completedSessions === sessions.length
        ? "completed"
        : sessions.some((s) => s.completed || s.answered > 0 || s.activeManifest)
          ? "in-progress"
          : "not-started",
    sessions,
    completedSessions,
    totalSessions: sessions.length,
  };
}

export function studyDay(timestamp: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(timestamp);
}

export function buildDailyStudy(
  userId: string,
  entries: readonly AttemptEntry[],
  now = Date.now(),
) {
  const days = new Map<string, Set<number>>();
  const seen = new Set<string>();
  for (const entry of entries) {
    const attempt = entry.attempt;
    if (
      entry.userId !== userId ||
      seen.has(attempt.attemptId) ||
      ["invalid", "skipped"].includes(attempt.result.status) ||
      !attempt.clientCreatedAt ||
      attempt.clientCreatedAt > now
    )
      continue;
    seen.add(attempt.attemptId);
    const day = studyDay(attempt.clientCreatedAt);
    const ids = days.get(day) ?? new Set<number>();
    ids.add(attempt.questionId);
    days.set(day, ids);
  }
  return { today: days.get(studyDay(now))?.size ?? 0, days: [...days.keys()].sort().reverse() };
}
