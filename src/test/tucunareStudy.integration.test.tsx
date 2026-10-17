import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudySession } from "@/components/study/StudySession";
import { InMemoryAttemptRepository } from "@/data/repositories/AttemptRepository";
import { TucunareProvider } from "@/features/tucunare/TucunareContext";
import { TucunareAssistant } from "@/features/tucunare/TucunareAssistant";
import type { ValidQuestion } from "@/domain/questions/questionTypes";

const mocks = vi.hoisted(() => ({ ask: vi.fn(), status: vi.fn() }));
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ loading: false, session: { user: { id: "tutor-study" } } }),
}));
vi.mock("@tanstack/react-router", () => ({ useRouterState: () => "/sessao/current" }));
vi.mock("@/features/tucunare/tucunareClient", async (original) => ({
  ...(await original<typeof import("@/features/tucunare/tucunareClient")>()),
  askTucunare: mocks.ask,
  getTucunareStatus: mocks.status,
}));
const questions: ValidQuestion[] = [1, 2].map((id) => ({
  id,
  aulaId: 19,
  sessao: 2,
  ordem: id,
  kind: "MC",
  enunciado: `Exercise ${id}`,
  options: ["Alpha", "Beta"],
  canonicalAnswerText: "Alpha",
  explicacao: "Explanation",
  traducao: "",
}));
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mocks.ask
    .mockReset()
    .mockResolvedValue({ answer: "A contextual hint.", sources: [], remaining: 29 });
  mocks.status.mockReset().mockResolvedValue({ remaining: 30, limit: 30 });
});
const view = (resumeIndex?: number) => (
  <TucunareProvider>
    <StudySession
      aulaId={19}
      userId="tutor-study"
      questions={questions}
      mode="restart"
      repository={new InMemoryAttemptRepository()}
      createSessionId={() => "tutor-study-session"}
      managedSession={
        resumeIndex === undefined
          ? undefined
          : {
              id: "managed-tutor",
              currentIndex: resumeIndex,
              onCurrentIndexChange: () => {},
              onComplete: () => {},
            }
      }
    />
    <TucunareAssistant />
  </TucunareProvider>
);

describe("Tucunare follows the real study session", () => {
  it("updates the visible question after advancing, without calling AI on navigation", async () => {
    const user = userEvent.setup();
    render(view());
    await screen.findByText("Exercise 1");
    await user.click(screen.getByRole("button", { name: "Conversar com Tucunaré" }));
    expect(screen.getByText(/^Questão 1 ·/)).toBeInTheDocument();
    expect(mocks.ask).not.toHaveBeenCalled();
    await user.type(
      screen.getByRole("textbox", { name: "Sua pergunta para Tucunaré" }),
      "Me explique isso",
    );
    await user.click(screen.getByRole("button", { name: "Enviar pergunta" }));
    await screen.findByText("A contextual hint.");
    expect(mocks.ask.mock.calls[0][0]).toMatchObject({ lessonId: 19, questionId: 1 });
    expect(mocks.ask.mock.calls[0][0].questionView).toContain("Exercise 1");
    await user.click(screen.getByRole("button", { name: "Fechar Tucunaré" }));
    await user.click(screen.getByRole("button", { name: "Alpha" }));
    await user.click(screen.getByRole("button", { name: "Verificar" }));
    await user.click(await screen.findByRole("button", { name: "Continuar" }));
    await screen.findByText("Exercise 2");
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Conversar com Tucunaré" }));
    expect(screen.getByText(/^Questão 2 ·/)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Sua pergunta para Tucunaré" }), "E essa?");
    await user.click(screen.getByRole("button", { name: "Enviar pergunta" }));
    await screen.findAllByText("A contextual hint.");
    expect(mocks.ask.mock.calls[1][0]).toMatchObject({ questionId: 2, history: [] });
    expect(mocks.ask.mock.calls[1][0].questionView).toContain("Exercise 2");
  });
  it("restores the current question when resuming and clears it when leaving the session", async () => {
    const user = userEvent.setup();
    const rendered = render(view(1));
    await screen.findByText("Exercise 2");
    await user.click(screen.getByRole("button", { name: "Conversar com Tucunaré" }));
    expect(screen.getByText(/^Questão 2 ·/)).toBeInTheDocument();
    expect(mocks.ask).not.toHaveBeenCalled();
    rendered.unmount();
  });
});
