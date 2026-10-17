import type { ValidQuestion } from "@/domain/questions/questionTypes";

// Project only the exercise the student can see, never its answer or grading metadata.
export function tutorQuestionView(question: ValidQuestion, studentAnswer?: string): string {
  let budget = 3000;
  const encoder = new TextEncoder();
  const text = (value: string | undefined, max: number) => {
    let result = (value ?? "").trim().slice(0, Math.min(max, budget));
    while (result && encoder.encode(JSON.stringify(result)).length > budget)
      result = result.slice(0, -1);
    budget = Math.max(0, budget - encoder.encode(JSON.stringify(result)).length);
    return result;
  };
  const values = (items: string[], max: number, size = 120) =>
    items
      .slice(0, max)
      .map((item) => text(item, size))
      .filter(Boolean);
  const view: Record<string, unknown> = {
    tipo: question.kind,
    enunciado: text(question.enunciado, 900),
  };
  if (studentAnswer) view.resposta_do_estudante = text(studentAnswer, 500);
  switch (question.kind) {
    case "MC":
    case "READING_MC":
    case "LISTENING_MC":
    case "MICROSCENARIO":
      view.apoio = text(question.supportText, 1000);
      view.opcoes = values(question.options, 12);
      view.audio = text(question.audioText, 700);
      break;
    case "ORDER":
    case "DIALOGUE_ORDER":
      view.blocos = values(
        question.shuffledBlocks.map((block) => block.text),
        20,
      );
      break;
    case "MATCHING":
      view.coluna_esquerda = values(question.pairs.map((pair) => pair.left).sort(), 12);
      view.coluna_direita = values(question.shuffledAnswers.slice().sort(), 12);
      break;
    case "CLASSIFY":
      view.categorias = values(question.categories, 8, 80);
      view.itens = values(
        question.items.map((item) => item.text),
        20,
        80,
      );
      break;
    case "CORRECTION":
      view.frase_original = text(question.supportText, 1000);
      break;
    case "FLASHCARD":
    case "OPEN":
      view.frente = text(question.frontText, 1000);
      break;
    case "FB":
      view.opcoes = values(question.hintOptions ?? [], 12);
      break;
    case "DICTATION":
      view.audio = "Ditado: a transcricao nao e fornecida para nao revelar a resposta.";
      break;
  }
  return JSON.stringify(view);
}
