import { describe, expect, it } from "vitest";
import { buildDailyStudy, buildLessonProgress, studyDay } from "@/domain/progress/lessonProgress";
import type { LessonQuestionIndex } from "@/data/queries";
import type { AttemptEntry } from "@/data/repositories/AttemptRepository";
import type { SessionManifest } from "@/domain/session/sessionManifest";

const rows: LessonQuestionIndex[] = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  aula_id: 17,
  sessao: i < 20 ? 1 : 2,
  ordem: (i % 20) + 1,
  proxima_revisao_em: null,
}));
function manifest(ids: number[], changes: Partial<SessionManifest> = {}): SessionManifest {
  return {
    schemaVersion: 1,
    id: "finished",
    userId: "u1",
    source: { kind: "aula", aulaId: 17 },
    criteria: {},
    questionIds: ids,
    status: "completed",
    currentIndex: ids.length,
    createdAt: 1,
    updatedAt: 2,
    completedAt: 2,
    ...changes,
  };
}
function entry(
  id: number,
  timestamp = Date.parse("2026-10-14T15:00:00Z"),
  userId = "u1",
): AttemptEntry {
  return {
    userId,
    sessionId: "s1",
    attempt: {
      attemptId: `a-${id}`,
      questionId: id,
      timeMs: 1000,
      clientCreatedAt: timestamp,
      result: {
        status: "incorrect",
        studentAnswerDisplay: "x",
        correctAnswerDisplay: "y",
        normalizedStudentAnswer: "x",
        normalizedCorrectAnswer: "y",
        explanation: "",
        diagnosticCode: "x",
        metadata: {},
      },
    },
  };
}
const first = rows.slice(0, 20).map((q) => q.id);
const second = rows.slice(20).map((q) => q.id);
const progress = (manifests: SessionManifest[], entries: AttemptEntry[] = [], index = rows) =>
  buildLessonProgress("u1", 17, index, manifests, entries);

describe("lesson completion is student progress, not processing status", () => {
  it("starts with two incomplete sessions even though all activities exist", () => {
    expect(progress([])).toMatchObject({
      status: "not-started",
      completedSessions: 0,
      totalSessions: 2,
    });
  });
  it("completing one session does not complete the lesson", () => {
    expect(progress([manifest(first)])).toMatchObject({
      status: "in-progress",
      completedSessions: 1,
      totalSessions: 2,
    });
  });
  it("completes the lesson only when both sessions were completed", () => {
    expect(progress([manifest(first), manifest(second, { id: "s2" })]).status).toBe("completed");
  });
  it("ignores a quick drill and another user with the same question IDs", () => {
    expect(
      progress([manifest(first, { source: { kind: "quick" } }), manifest(second, { userId: "u2" })])
        .completedSessions,
    ).toBe(0);
  });
  it("does not infer completion from attempts alone or an unfinished manifest", () => {
    expect(
      progress(
        [manifest(first, { status: "active" })],
        first.map((id) => entry(id)),
      ).completedSessions,
    ).toBe(0);
  });
  it("does not count a partial subset as a completed session", () => {
    expect(progress([manifest(first.slice(0, 10))]).completedSessions).toBe(0);
  });
  it("preserves completion when a subsequent practice session is unfinished", () => {
    const result = progress([
      manifest(first),
      manifest(first, { id: "repeat", status: "active", currentIndex: 5, updatedAt: 3 }),
    ]);
    expect(result.sessions[0]).toMatchObject({ completed: true, activeManifest: { id: "repeat" } });
  });
  it("does not resume an empty abandoned or created session", () => {
    expect(
      progress([
        manifest(first, { status: "abandoned" }),
        manifest(first, { id: "empty", status: "active", currentIndex: 0 }),
      ]).sessions[0].activeManifest,
    ).toBeUndefined();
  });
  it("resumes after the first answer even before advancing to question 2", () => {
    expect(
      progress(
        [manifest(first, { status: "active", currentIndex: 0 })],
        [{ ...entry(1), sessionId: "finished" }],
      ).sessions[0].activeManifest?.id,
    ).toBe("finished");
  });
  it("keeps a legacy third session and requires it before completing the lesson", () => {
    const index = [...rows, { ...rows[0], id: 41, sessao: 3 }];
    expect(progress([manifest([...first, ...second])], [], index)).toMatchObject({
      status: "in-progress",
      totalSessions: 3,
      completedSessions: 2,
    });
  });
  it("does not hide a future session or call the lesson complete early", () => {
    const index = rows.map((q) =>
      q.sessao === 2 ? { ...q, proxima_revisao_em: "2099-01-01T00:00:00Z" } : q,
    );
    const result = progress([manifest(first)], [], index);
    expect(result.totalSessions).toBe(2);
    expect(result.sessions[1].available).toBe(false);
    expect(result.status).toBe("in-progress");
  });
  it("requires completion again if new question IDs were added", () => {
    expect(
      progress([manifest(first)], [], [...rows, { ...rows[0], id: 41 }]).sessions[0].completed,
    ).toBe(false);
  });
});

describe("daily study history", () => {
  const now = Date.parse("2026-10-15T02:30:00Z");
  it("uses the Sao Paulo date at the midnight UTC boundary", () => {
    expect(studyDay(now)).toBe("2026-10-14");
    expect(buildDailyStudy("u1", [entry(1, now)], now).today).toBe(1);
  });
  it("does not inflate the daily count with repeated answers or duplicate sync entries", () => {
    const one = entry(1, now);
    const repeat = { ...one, attempt: { ...one.attempt, attemptId: "repeat" } };
    expect(buildDailyStudy("u1", [one, one, repeat, entry(2, now)], now).today).toBe(2);
  });
  it("ignores other users, undated, future, invalid and skipped answers", () => {
    const skipped = entry(3, now);
    skipped.attempt.result.status = "skipped";
    const invalid = entry(4, now);
    invalid.attempt.result.status = "invalid";
    const undated = entry(5);
    delete undated.attempt.clientCreatedAt;
    expect(
      buildDailyStudy(
        "u1",
        [entry(1, now, "u2"), entry(2, now + 1), skipped, invalid, undated],
        now,
      ).today,
    ).toBe(0);
  });
});
