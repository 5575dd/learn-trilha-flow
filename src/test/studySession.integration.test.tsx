import { beforeEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudySession } from "@/components/study/StudySession";
import {
  InMemoryAttemptRepository,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  loadSessionSnapshot,
  saveSessionSnapshot,
} from "@/data/repositories/AttemptRepository";
import type { ValidQuestion } from "@/domain/questions/questionTypes";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

const USER_ID = "user-a";
const AULA_ID = 7;
const SESSION_ID = "recoverable-session";

const firstQuestion: ValidQuestion = {
  id: 10,
  aulaId: AULA_ID,
  enunciado: "Primeira questão",
  explicacao: "Explicação anterior",
  traducao: "",
  sessao: 1,
  ordem: 0,
  kind: "MC",
  options: ["Alpha", "Beta"],
  canonicalAnswerText: "Alpha",
};

const tfQuestion: ValidQuestion = {
  id: 11,
  aulaId: AULA_ID,
  enunciado: "A afirmação é verdadeira?",
  explicacao: "",
  traducao: "",
  sessao: 1,
  ordem: 1,
  kind: "TF",
  canonicalAnswerText: "True",
};

const mcQuestion: ValidQuestion = {
  id: 12,
  aulaId: AULA_ID,
  enunciado: "Escolha Paris",
  explicacao: "",
  traducao: "",
  sessao: 1,
  ordem: 2,
  kind: "MC",
  options: ["Londres", "Paris"],
  canonicalAnswerText: "Paris",
};

const previousAttempt: AttemptRecord = {
  attemptId: `${SESSION_ID}-${firstQuestion.id}`,
  questionId: firstQuestion.id,
  timeMs: 500,
  result: {
    status: "correct",
    studentAnswerDisplay: "Alpha",
    correctAnswerDisplay: "Alpha",
    normalizedStudentAnswer: "alpha",
    normalizedCorrectAnswer: "alpha",
    explanation: "Explicação anterior",
    diagnosticCode: "match",
    metadata: {},
  },
};

async function seedRecoverable(repository: InMemoryAttemptRepository, questions: ValidQuestion[]) {
  saveSessionSnapshot({
    schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
    userId: USER_ID,
    aulaId: AULA_ID,
    sessionId: SESSION_ID,
    questionIds: questions.map((question) => question.id),
    currentQuestionId: questions[0].id,
    currentIndex: 0,
    updatedAt: Date.now(),
  });
  await repository.save(USER_ID, SESSION_ID, previousAttempt);
}

describe("StudySession integration", () => {
  beforeEach(() => localStorage.clear());

  it("shows a recoverable-session warning on a normal visit", async () => {
    const repository = new InMemoryAttemptRepository();
    const questions = [firstQuestion, tfQuestion];
    await seedRecoverable(repository, questions);

    render(
      <StudySession
        aulaId={AULA_ID}
        userId={USER_ID}
        questions={questions}
        mode="normal"
        repository={repository}
      />,
    );

    expect(
      await screen.findByText("Existe uma sessão anterior que pode ser retomada."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retomar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reiniciar" })).toBeTruthy();
  });

  it("resumes in feedback, creates no attempt, and Continue advances once", async () => {
    const user = userEvent.setup();
    const repository = new InMemoryAttemptRepository();
    const questions = [firstQuestion, tfQuestion, mcQuestion];
    await seedRecoverable(repository, questions);

    render(
      <StudySession
        aulaId={AULA_ID}
        userId={USER_ID}
        questions={questions}
        mode="normal"
        repository={repository}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Retomar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Perfeito!");
    expect(screen.getByText("Explicação anterior")).toBeTruthy();
    expect(await repository.load(USER_ID, SESSION_ID)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText(tfQuestion.enunciado)).toBeTruthy();
    expect(screen.getByText("2 / 3")).toBeTruthy();
    expect(await repository.load(USER_ID, SESSION_ID)).toHaveLength(1);
  });

  it("restarts directly, preserves the old session, and creates a new ready session", async () => {
    const user = userEvent.setup();
    const repository = new InMemoryAttemptRepository();
    const questions = [firstQuestion, tfQuestion];
    await seedRecoverable(repository, questions);

    render(
      <StudySession
        aulaId={AULA_ID}
        userId={USER_ID}
        questions={questions}
        mode="normal"
        repository={repository}
        createSessionId={() => "new-session"}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Reiniciar" }));
    expect(await screen.findByText(firstQuestion.enunciado)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(await repository.load(USER_ID, SESSION_ID)).toEqual([previousAttempt]);
    await waitFor(() =>
      expect(
        loadSessionSnapshot({
          userId: USER_ID,
          aulaId: AULA_ID,
          questionIds: questions.map((question) => question.id),
        })?.sessionId,
      ).toBe("new-session"),
    );
  });

  it("reacts to search-mode changes without requiring an unmount", async () => {
    const repository = new InMemoryAttemptRepository();
    const questions = [firstQuestion, tfQuestion];
    await seedRecoverable(repository, questions);
    const view = render(
      <StudySession
        aulaId={AULA_ID}
        userId={USER_ID}
        questions={questions}
        mode="normal"
        repository={repository}
      />,
    );
    expect(
      await screen.findByText("Existe uma sessão anterior que pode ser retomada."),
    ).toBeTruthy();

    view.rerender(
      <StudySession
        aulaId={AULA_ID}
        userId={USER_ID}
        questions={questions}
        mode="resume"
        repository={repository}
      />,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("Perfeito!");
  });

  it("keeps TF functional after resuming", async () => {
    const user = userEvent.setup();
    const repository = new InMemoryAttemptRepository();
    const questions = [firstQuestion, tfQuestion];
    await seedRecoverable(repository, questions);
    render(
      <StudySession
        aulaId={AULA_ID}
        userId={USER_ID}
        questions={questions}
        mode="resume"
        repository={repository}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "Verdadeiro" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Perfeito!");
    expect(await repository.load(USER_ID, SESSION_ID)).toHaveLength(2);
  });

  it("keeps MC functional after resuming", async () => {
    const user = userEvent.setup();
    const repository = new InMemoryAttemptRepository();
    const questions = [firstQuestion, mcQuestion];
    await seedRecoverable(repository, questions);
    render(
      <StudySession
        aulaId={AULA_ID}
        userId={USER_ID}
        questions={questions}
        mode="resume"
        repository={repository}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "Paris" }));
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Perfeito!");
    expect(await repository.load(USER_ID, SESSION_ID)).toHaveLength(2);
  });
});
