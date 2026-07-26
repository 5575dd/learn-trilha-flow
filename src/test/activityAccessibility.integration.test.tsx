import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity } from "@/components/activities/Activity";
import { FeedbackPanel } from "@/components/feedback/FeedbackPanel";
import type { ValidQuestion } from "@/domain/questions/questionTypes";

const base = {
  id: 1,
  aulaId: 1,
  explicacao: "",
  sessao: 1,
  ordem: 1,
};

describe("accessible activity help", () => {
  it("reveals the Portuguese translation only when requested", async () => {
    const user = userEvent.setup();
    const question: ValidQuestion = {
      ...base,
      kind: "MC",
      enunciado: "Choose the best answer.",
      traducao: "Escolha a melhor resposta.",
      options: ["A", "B"],
      canonicalAnswerText: "A",
    };
    render(<Activity question={question} disabled={false} onSubmit={vi.fn()} />);

    expect(screen.queryByText("Escolha a melhor resposta.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Ver tradução" }));
    expect(screen.getByText("Escolha a melhor resposta.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Ocultar tradução" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("requires revealing a flashcard before self-evaluation", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const question: ValidQuestion = {
      ...base,
      kind: "FLASHCARD",
      enunciado: "What is the third-person form of have?",
      traducao: "Qual é a forma de terceira pessoa de have?",
      canonicalAnswerText: "has",
      frontText: "What is the third-person form of have?",
    };
    render(<Activity question={question} disabled={false} onSubmit={onSubmit} />);

    expect(screen.getByRole("button", { name: "Já domino" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Mostrar resposta" }));
    await user.click(screen.getByRole("button", { name: "Já domino" }));
    expect(onSubmit).toHaveBeenCalledWith({ text: "", selfEval: "know" });
  });

  it("shows self-evaluation as a neutral record instead of an error", () => {
    render(
      <FeedbackPanel
        result={{
          status: "neutral",
          studentAnswerDisplay: "know",
          correctAnswerDisplay: "has",
          normalizedStudentAnswer: "know",
          normalizedCorrectAnswer: "has",
          explanation: "Have vira has com he, she e it.",
          diagnosticCode: "selfeval.know",
          metadata: {},
        }}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Ótimo, registrado!");
    expect(screen.getByRole("status")).not.toHaveTextContent("Gabarito:");
    expect(screen.getByRole("status")).not.toHaveTextContent("Ainda não");
  });
});
