import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionResult } from "@/components/study/SessionResult";
import { StudySession } from "@/components/study/StudySession";
import { hydrateManifestStore, LocalManifestStore, manifestStore } from "@/data/manifestStore";
import { InMemoryAttemptRepository } from "@/data/repositories/AttemptRepository";
import { buildProgressSummary } from "@/domain/progress/progressSummary";
import type { ValidQuestion } from "@/domain/questions/questionTypes";

const USER_ID = "manifest-user";
const AULA_ID = 42;
const SESSION_ID = "aula-manifest-session";

const firstQuestion: ValidQuestion = {
  id: 401,
  aulaId: AULA_ID,
  enunciado: "Questão do manifest",
  explicacao: "",
  traducao: "",
  sessao: 1,
  ordem: 1,
  kind: "MC",
  options: ["A", "B"],
  canonicalAnswerText: "A",
};

const secondQuestion: ValidQuestion = {
  id: 402,
  aulaId: AULA_ID,
  enunciado: "Segunda questão",
  explicacao: "",
  traducao: "",
  sessao: 1,
  ordem: 2,
  kind: "MC",
  options: ["A", "B"],
  canonicalAnswerText: "A",
};

const questions: ValidQuestion[] = [firstQuestion, secondQuestion];

function renderAulaSession({
  sessionQuestions = questions,
  mode = "normal",
  repository = new InMemoryAttemptRepository(),
  userId = USER_ID,
  onComplete = vi.fn(),
  createSessionId = () => SESSION_ID,
}: {
  sessionQuestions?: ValidQuestion[];
  mode?: "normal" | "resume" | "restart";
  repository?: InMemoryAttemptRepository;
  userId?: string;
  onComplete?: (sessionId: string) => void;
  createSessionId?: () => string;
} = {}) {
  const view = render(
    <StudySession
      aulaId={AULA_ID}
      userId={userId}
      questions={sessionQuestions}
      mode={mode}
      repository={repository}
      createSessionId={createSessionId}
      onComplete={onComplete}
    />,
  );
  return { view, repository, onComplete };
}

async function answerCurrentQuestion(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "A" }));
  await user.click(screen.getByRole("button", { name: "Verificar" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Perfeito!");
}

async function completeSingleQuestion() {
  const user = userEvent.setup();
  const repository = new InMemoryAttemptRepository();
  const onComplete = vi.fn();
  const { view } = renderAulaSession({
    sessionQuestions: [firstQuestion],
    repository,
    onComplete,
  });
  await screen.findByText(firstQuestion.enunciado);
  await answerCurrentQuestion(user);
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await waitFor(() => expect(manifestStore.get(USER_ID, SESSION_ID)?.status).toBe("completed"));
  return { view, repository, onComplete };
}

async function restartAfterFirstAttempt() {
  const user = userEvent.setup();
  const repository = new InMemoryAttemptRepository();
  const firstRender = renderAulaSession({ repository });
  await screen.findByText(firstQuestion.enunciado);
  await answerCurrentQuestion(user);
  expect(await repository.load(USER_ID, SESSION_ID)).toHaveLength(1);
  firstRender.view.unmount();

  renderAulaSession({
    repository,
    createSessionId: () => SESSION_ID,
  });
  await user.click(await screen.findByRole("button", { name: "Reiniciar" }));
  expect(await screen.findByText(firstQuestion.enunciado)).toBeTruthy();

  let newSessionId = "";
  await waitFor(() => {
    newSessionId =
      manifestStore.listByUser(USER_ID).find((manifest) => manifest.id !== SESSION_ID)?.id ?? "";
    expect(newSessionId).not.toBe("");
  });

  return { user, repository, newSessionId };
}

describe("local SessionManifest lifecycle", () => {
  beforeEach(() => localStorage.clear());

  it("creates and persists a manifest before opening an aula session", async () => {
    renderAulaSession();

    expect(await screen.findByText(firstQuestion.enunciado)).toBeTruthy();
    expect(manifestStore.get(USER_ID, SESSION_ID)).toMatchObject({
      id: SESSION_ID,
      userId: USER_ID,
      source: { kind: "aula", aulaId: AULA_ID },
      status: "active",
      currentIndex: 0,
      questionIds: [401, 402],
    });
  });

  it("updates currentIndex after advancing to the next question", async () => {
    const user = userEvent.setup();
    renderAulaSession();
    await screen.findByText(firstQuestion.enunciado);
    await answerCurrentQuestion(user);
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText(secondQuestion.enunciado)).toBeTruthy();
    await waitFor(() => expect(manifestStore.get(USER_ID, SESSION_ID)?.currentIndex).toBe(1));
  });

  it("keeps an incomplete session recoverable after reload", async () => {
    const user = userEvent.setup();
    const firstRender = renderAulaSession();
    await screen.findByText(firstQuestion.enunciado);
    await answerCurrentQuestion(user);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(manifestStore.get(USER_ID, SESSION_ID)?.currentIndex).toBe(1));
    firstRender.view.unmount();

    const reloadedStore = new LocalManifestStore();
    expect(reloadedStore.findRecoverable(USER_ID)).toMatchObject({
      id: SESSION_ID,
      status: "active",
      currentIndex: 1,
    });
    renderAulaSession({ repository: new InMemoryAttemptRepository() });
    expect(
      await screen.findByText("Existe uma sessão anterior que pode ser retomada."),
    ).toBeTruthy();
  });

  it("marks the last question as completed with a full index and completedAt", async () => {
    await completeSingleQuestion();
    const completed = manifestStore.get(USER_ID, SESSION_ID);

    expect(completed).toMatchObject({
      status: "completed",
      currentIndex: 1,
    });
    expect(completed?.completedAt).toBeTypeOf("number");
  });

  it("keeps a completed manifest stored after the component unmounts", async () => {
    const completed = await completeSingleQuestion();
    completed.view.unmount();

    expect(new LocalManifestStore().get(USER_ID, SESSION_ID)?.status).toBe("completed");
  });

  it("does not expose a completed manifest as recoverable", async () => {
    await completeSingleQuestion();

    expect(new LocalManifestStore().findRecoverable(USER_ID)).toBeNull();
  });

  it("returns the completed manifest to the Progress hydration", async () => {
    await completeSingleQuestion();
    const hydration = await hydrateManifestStore(USER_ID, { includeHistory: true });

    expect(hydration.manifests).toHaveLength(1);
    expect(hydration.manifests[0]).toMatchObject({
      id: SESSION_ID,
      status: "completed",
    });
  });

  it("counts one completed session in Progress", async () => {
    const completed = await completeSingleQuestion();
    const entries = await completed.repository.listEntriesByUser(USER_ID);
    const summary = buildProgressSummary({
      entries,
      manifests: new LocalManifestStore().listByUser(USER_ID),
      questions: [firstQuestion],
      dueReviewsToday: 0,
    });

    expect(summary.metrics.completedSessions).toBe(1);
  });

  it("adds the completed session to recent history with its result available", async () => {
    const completed = await completeSingleQuestion();
    const entries = await completed.repository.listEntriesByUser(USER_ID);
    const summary = buildProgressSummary({
      entries,
      manifests: new LocalManifestStore().listByUser(USER_ID),
      questions: [firstQuestion],
      dueReviewsToday: 0,
    });

    expect(summary.history).toHaveLength(1);
    expect(summary.history[0]).toMatchObject({
      manifestId: SESSION_ID,
      status: "completed",
      recoverable: false,
      resultAvailable: true,
    });
  });

  it("keeps the completed result accessible after reload", async () => {
    const completed = await completeSingleQuestion();
    completed.view.unmount();
    const manifest = new LocalManifestStore().get(USER_ID, SESSION_ID);
    expect(manifest).not.toBeNull();

    render(
      <SessionResult
        manifest={manifest!}
        userId={USER_ID}
        store={new LocalManifestStore()}
        repository={new InMemoryAttemptRepository()}
        onOpenManifest={vi.fn()}
      />,
    );

    expect(await screen.findByText("100%")).toBeTruthy();
  });

  it("does not duplicate attempts when an answered session reloads", async () => {
    const user = userEvent.setup();
    const firstRepository = new InMemoryAttemptRepository();
    const firstRender = renderAulaSession({
      sessionQuestions: [firstQuestion],
      repository: firstRepository,
    });
    await screen.findByText(firstQuestion.enunciado);
    await answerCurrentQuestion(user);
    expect(await firstRepository.load(USER_ID, SESSION_ID)).toHaveLength(1);
    firstRender.view.unmount();

    const reloadedRepository = new InMemoryAttemptRepository();
    renderAulaSession({
      sessionQuestions: [firstQuestion],
      mode: "resume",
      repository: reloadedRepository,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Perfeito!");
    expect(await reloadedRepository.load(USER_ID, SESSION_ID)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await reloadedRepository.load(USER_ID, SESSION_ID)).toHaveLength(1);
  });

  it("keeps manifests and attempts isolated from another user", async () => {
    const repository = new InMemoryAttemptRepository();
    renderAulaSession({ repository });
    expect(await screen.findByText(firstQuestion.enunciado)).toBeTruthy();

    expect(new LocalManifestStore().get("other-user", SESSION_ID)).toBeNull();
    expect(await repository.load("other-user", SESSION_ID)).toEqual([]);
    expect(new LocalManifestStore().listByUser("other-user")).toEqual([]);
  });

  it("preserves the previous attempt when an answered session restarts", async () => {
    const restarted = await restartAfterFirstAttempt();

    expect(await restarted.repository.load(USER_ID, SESSION_ID)).toHaveLength(1);
  });

  it("marks the previous manifest as abandoned and keeps it in history", async () => {
    const restarted = await restartAfterFirstAttempt();
    const store = new LocalManifestStore();
    const entries = await restarted.repository.listEntriesByUser(USER_ID);
    const summary = buildProgressSummary({
      entries,
      manifests: store.listByUser(USER_ID),
      questions,
      dueReviewsToday: 0,
    });

    expect(store.get(USER_ID, SESSION_ID)?.status).toBe("abandoned");
    expect(summary.history).toContainEqual(
      expect.objectContaining({
        manifestId: SESSION_ID,
        status: "abandoned",
        recoverable: false,
      }),
    );
  });

  it("does not expose the abandoned manifest as recoverable", async () => {
    const restarted = await restartAfterFirstAttempt();
    const recoverable = new LocalManifestStore().findRecoverable(USER_ID);

    expect(recoverable?.id).toBe(restarted.newSessionId);
    expect(recoverable?.id).not.toBe(SESSION_ID);
  });

  it("allocates a different ID when the session ID factory collides", async () => {
    const restarted = await restartAfterFirstAttempt();

    expect(restarted.newSessionId).not.toBe(SESSION_ID);
  });

  it("starts the replacement session at index zero", async () => {
    const restarted = await restartAfterFirstAttempt();

    expect(new LocalManifestStore().get(USER_ID, restarted.newSessionId)?.currentIndex).toBe(0);
    expect(screen.getByText("1 / 2")).toBeTruthy();
  });

  it("keeps previous attempts in listEntriesByUser", async () => {
    const restarted = await restartAfterFirstAttempt();
    const entries = await restarted.repository.listEntriesByUser(USER_ID);

    expect(entries).toContainEqual(
      expect.objectContaining({
        userId: USER_ID,
        sessionId: SESSION_ID,
      }),
    );
  });

  it("continues counting previous attempts in Progress", async () => {
    const restarted = await restartAfterFirstAttempt();
    const entries = await restarted.repository.listEntriesByUser(USER_ID);
    const summary = buildProgressSummary({
      entries,
      manifests: new LocalManifestStore().listByUser(USER_ID),
      questions,
      dueReviewsToday: 0,
    });

    expect(summary.metrics.totalAttempts).toBe(1);
    expect(summary.metrics.correct).toBe(1);
    expect(summary.metrics.uniqueQuestions).toBe(1);
  });

  it("keeps attempts from the replacement session separate without duplication", async () => {
    const restarted = await restartAfterFirstAttempt();
    await answerCurrentQuestion(restarted.user);

    expect(await restarted.repository.load(USER_ID, SESSION_ID)).toHaveLength(1);
    expect(await restarted.repository.load(USER_ID, restarted.newSessionId)).toHaveLength(1);
    const entries = await restarted.repository.listEntriesByUser(USER_ID);
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((entry) => entry.sessionId))).toEqual(
      new Set([SESSION_ID, restarted.newSessionId]),
    );
  });

  it("keeps restarted manifests and attempts isolated from other users", async () => {
    const restarted = await restartAfterFirstAttempt();

    expect(new LocalManifestStore().listByUser("other-user")).toEqual([]);
    expect(await restarted.repository.listEntriesByUser("other-user")).toEqual([]);
    expect(await restarted.repository.load("other-user", restarted.newSessionId)).toEqual([]);
  });
});
