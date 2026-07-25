import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionRunner } from "@/components/study/SessionRunner";
import { LocalManifestStore } from "@/data/manifestStore";
import { InMemoryAttemptRepository } from "@/data/repositories/AttemptRepository";
import type { RawQuestion } from "@/domain/questions/questionTypes";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

const raw = (id: number, enunciado: string): RawQuestion => ({
  id,
  aula_id: 1,
  tipo: "MC",
  enunciado,
  opcoes: "A|B",
  resposta_correta: "A",
  explicacao: "",
  traducao: "",
  audio_texto: null,
  sessao: 1,
  ordem: id,
  dificuldade: 1,
  metadados: {},
});

const previousAttempt: AttemptRecord = {
  attemptId: "manifest-1-1",
  questionId: 1,
  timeMs: 10,
  result: {
    status: "correct",
    studentAnswerDisplay: "A",
    correctAnswerDisplay: "A",
    normalizedStudentAnswer: "a",
    normalizedCorrectAnswer: "a",
    explanation: "",
    diagnosticCode: "match",
    metadata: {},
  },
};

function setup(questionIds: number[]) {
  const store = new LocalManifestStore({
    createId: () => "manifest-1",
    now: () => 10,
  });
  const manifest = store.create({
    userId: "user-a",
    source: { kind: "aula", aulaId: 1 },
    questionIds,
  });
  const repository = new InMemoryAttemptRepository();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { store, manifest, repository, client };
}

function renderRunner(
  setupResult: ReturnType<typeof setup>,
  rows: RawQuestion[],
  missingIds: number[] = [],
  onComplete = vi.fn(),
) {
  const view = render(
    <QueryClientProvider client={setupResult.client}>
      <SessionRunner
        manifest={setupResult.manifest}
        userId="user-a"
        store={setupResult.store}
        repository={setupResult.repository}
        loadQuestions={async () => ({ questions: rows, missingIds })}
        onComplete={onComplete}
      />
    </QueryClientProvider>,
  );
  return { view, onComplete };
}

describe("SessionRunner integration", () => {
  beforeEach(() => localStorage.clear());

  it("uses the manifest's frozen question order", async () => {
    const state = setup([2, 1]);
    renderRunner(state, [raw(2, "Questão dois"), raw(1, "Questão um")]);
    expect(await screen.findByText("Questão dois")).toBeTruthy();
  });

  it("resumes the same manifest and restores feedback", async () => {
    const state = setup([1, 2]);
    await state.repository.save("user-a", state.manifest.id, previousAttempt);
    renderRunner(state, [raw(1, "Questão um"), raw(2, "Questão dois")]);
    expect(await screen.findByRole("status")).toHaveTextContent("Perfeito!");
    expect(state.store.listByUser("user-a")).toHaveLength(1);
  });

  it("updates currentIndex and completes the manifest", async () => {
    const user = userEvent.setup();
    const state = setup([1, 2]);
    await state.repository.save("user-a", state.manifest.id, previousAttempt);
    const { onComplete } = renderRunner(state, [raw(1, "Questão um"), raw(2, "Questão dois")]);

    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(state.store.get("user-a", state.manifest.id)?.currentIndex).toBe(1));
    await user.click(screen.getByRole("button", { name: "A" }));
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await user.click(await screen.findByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(state.store.get("user-a", state.manifest.id)?.status).toBe("completed"),
    );
    expect(onComplete).toHaveBeenCalledWith(state.manifest.id);
    expect(await state.repository.load("user-a", state.manifest.id)).toHaveLength(2);
  });

  it("skips a removed question safely without changing frozen IDs", async () => {
    const state = setup([99, 1]);
    renderRunner(state, [raw(1, "Questão disponível")], [99]);
    expect(await screen.findByText(/1 questão/)).toBeTruthy();
    expect(screen.getByText("Questão disponível")).toBeTruthy();
    expect(state.store.get("user-a", state.manifest.id)?.questionIds).toEqual([99, 1]);
  });

  it("treats unsupported question types as unavailable without crashing", async () => {
    const state = setup([1]);
    const unsupported = { ...raw(1, "Pronúncia"), tipo: "PRONUNCIATION" };
    renderRunner(state, [unsupported]);
    expect(
      await screen.findByText("Nenhuma questão desta sessão está disponível no momento."),
    ).toBeTruthy();
  });

  it("does not create a new manifest when mounted again", async () => {
    const state = setup([1]);
    const first = renderRunner(state, [raw(1, "Questão um")]);
    expect(await screen.findByText("Questão um")).toBeTruthy();
    first.view.unmount();

    const nextClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderRunner({ ...state, client: nextClient }, [raw(1, "Questão um")]);
    expect(await screen.findByText("Questão um")).toBeTruthy();
    expect(state.store.listByUser("user-a")).toHaveLength(1);
  });
});
