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

  it("hides a vocabulary flashcard translation until the answer is revealed", async () => {
    const user = userEvent.setup();
    const question: ValidQuestion = {
      ...base,
      kind: "FLASHCARD",
      enunciado: "Fireplace",
      traducao: "Lareira",
      canonicalAnswerText: "Lareira",
    };
    render(<Activity question={question} disabled={false} onSubmit={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Ver tradução" })).toBeNull();
    expect(screen.queryByText("Lareira")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Mostrar resposta" }));
    expect(screen.getByRole("button", { name: "Ver tradução" })).toBeVisible();
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
    expect(screen.getByText(/Pense na resposta antes de revelar/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Mostrar resposta" }));
    await user.click(screen.getByRole("button", { name: "Já domino" }));
    expect(onSubmit).toHaveBeenCalledWith({ text: "", selfEval: "know" });
  });

  it("shows self-evaluation as a manual record rather than an automatic grade", () => {
    render(
      <FeedbackPanel
        result={{
          status: "correct",
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

  it("does not promise a review for a skipped self-evaluation", () => {
    render(
      <FeedbackPanel
        result={{
          status: "skipped",
          studentAnswerDisplay: "skip",
          correctAnswerDisplay: "has",
          normalizedStudentAnswer: "skip",
          normalizedCorrectAnswer: "has",
          explanation: "",
          diagnosticCode: "selfeval.skip",
          metadata: {},
        }}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Atividade pulada");
    expect(screen.getByRole("status")).not.toHaveTextContent("entrará na revisão");
  });

  it("shows pronunciation with familiar letters and does not render IPA symbols", async () => {
    const user = userEvent.setup();
    const question: ValidQuestion = {
      ...base,
      kind: "FLASHCARD",
      enunciado: "How do you pronounce the word 'does' in English?",
      traducao: "Como se pronuncia a palavra does em inglês?",
      canonicalAnswerText: "It is pronounced /dʌz/ (sounds like 'dâz', with a short sound).",
    };
    render(<Activity question={question} disabled={false} onSubmit={vi.fn()} />);

    expect(screen.getByRole("button", { name: "🔊 Ouvir a palavra" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Mostrar resposta" }));
    const accessiblePronunciation = screen.getByText(/Como soa para brasileiros/).closest("p");
    expect(accessiblePronunciation).toHaveTextContent("dâz");
    expect(screen.getByText("Entender a pronúncia")).toBeVisible();
    expect(screen.queryByText(/\/dʌz\//)).not.toBeInTheDocument();
  });

  it("offers a useful fallback hint when a short answer has no generated hints", async () => {
    const user = userEvent.setup();
    const question: ValidQuestion = {
      ...base,
      kind: "SHORT_ANSWER",
      enunciado: "What does David love to do in the summertime?",
      traducao: "O que David ama fazer no verão?",
      canonicalAnswerText: "David loves to swim.",
    };
    render(<Activity question={question} disabled={false} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Preciso de uma dica" }));
    expect(screen.getByText(/David loves to/)).toBeVisible();
  });

  it("shows the meaning for fill-in questions before checking polarity", () => {
    const question: ValidQuestion = {
      ...base,
      kind: "FB",
      enunciado: "_____ a coffee table in the room.",
      traducao: "Não há uma mesa de centro na sala.",
      canonicalAnswerText: "There isn't",
    };
    render(<Activity question={question} disabled={false} onSubmit={vi.fn()} />);
    expect(screen.getByText("Não há uma mesa de centro na sala.")).toBeVisible();
  });

  it("does not reveal the dictated sentence through its old translation", () => {
    const question: ValidQuestion = {
      ...base,
      kind: "DICTATION",
      enunciado: "Type the sentence heard.",
      traducao: "Há algumas plantas de interior na sala.",
      canonicalAnswerText: "There are some indoor plants in the room.",
      audioText: "There are some indoor plants in the room.",
    };
    render(<Activity question={question} disabled={false} onSubmit={vi.fn()} />);
    expect(screen.queryByText("Há algumas plantas de interior na sala.")).toBeNull();
  });

  it("explains when an accent-only spelling difference was accepted", () => {
    render(
      <FeedbackPanel
        result={{
          status: "correct",
          studentAnswerDisplay: "Nico and Natália are twins",
          correctAnswerDisplay: "Nico and Natalia are twins",
          normalizedStudentAnswer: "nico and natália are twins",
          normalizedCorrectAnswer: "nico and natalia are twins",
          explanation: "",
          diagnosticCode: "match.diacritic_variant",
          metadata: {},
        }}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Correto, com atenção");
    expect(screen.getByRole("status")).toHaveTextContent("a diferença foi apenas de acentuação");
    expect(screen.getByRole("status")).toHaveTextContent("Nico and Natalia are twins");
  });
});
