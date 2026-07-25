import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudyHub } from "@/components/study/StudyHub";
import { LocalManifestStore } from "@/data/manifestStore";
import type { AulaListItem } from "@/data/queries";
import type { ValidQuestion } from "@/domain/questions/questionTypes";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

const aulas: AulaListItem[] = [
  {
    id: 1,
    titulo: "Aula um",
    tema: null,
    data_aula: null,
    status: "concluida",
    quantidade_atividades: 2,
  },
  {
    id: 2,
    titulo: "Aula dois",
    tema: null,
    data_aula: null,
    status: "concluida",
    quantidade_atividades: 1,
  },
];

const questions: ValidQuestion[] = [
  {
    id: 1,
    aulaId: 1,
    enunciado: "",
    explicacao: "",
    traducao: "",
    sessao: 1,
    ordem: 1,
    kind: "MC",
    options: ["a", "b"],
    canonicalAnswerText: "a",
  },
  {
    id: 2,
    aulaId: 1,
    enunciado: "",
    explicacao: "",
    traducao: "",
    sessao: 1,
    ordem: 2,
    kind: "TF",
    canonicalAnswerText: "True",
  },
  {
    id: 3,
    aulaId: 2,
    enunciado: "",
    explicacao: "",
    traducao: "",
    sessao: 1,
    ordem: 1,
    kind: "TF",
    canonicalAnswerText: "False",
  },
];

const incorrectAttempt: AttemptRecord = {
  attemptId: "attempt-1",
  questionId: 2,
  timeMs: 10,
  result: {
    status: "incorrect",
    studentAnswerDisplay: "False",
    correctAnswerDisplay: "True",
    normalizedStudentAnswer: "false",
    normalizedCorrectAnswer: "true",
    explanation: "",
    diagnosticCode: "mismatch",
    metadata: {},
  },
};

function setup() {
  let id = 0;
  const store = new LocalManifestStore({
    createId: () => `manifest-${++id}`,
    now: () => id,
  });
  const onOpenManifest = vi.fn();
  return { store, onOpenManifest };
}

describe("StudyHub cards", () => {
  beforeEach(() => localStorage.clear());

  it("opens the existing recoverable manifest without creating another", async () => {
    const user = userEvent.setup();
    const { store, onOpenManifest } = setup();
    const existing = store.create({
      userId: "user-a",
      source: { kind: "quick" },
      questionIds: [1],
    });
    render(
      <StudyHub
        userId="user-a"
        aulas={aulas}
        questions={questions}
        attempts={[]}
        store={store}
        onOpenManifest={onOpenManifest}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Continuar sessão" }));
    expect(onOpenManifest).toHaveBeenCalledWith(existing.id);
    expect(store.listByUser("user-a")).toHaveLength(1);
  });

  it("creates and navigates to a quick manifest", async () => {
    const user = userEvent.setup();
    const { store, onOpenManifest } = setup();
    render(
      <StudyHub
        userId="user-a"
        aulas={aulas}
        questions={questions}
        attempts={[]}
        store={store}
        random={() => 0}
        onOpenManifest={onOpenManifest}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Iniciar sessão rápida" }));
    const manifest = store.listByUser("user-a")[0];
    expect(manifest.source).toEqual({ kind: "quick" });
    expect(manifest.questionIds).toHaveLength(3);
    expect(onOpenManifest).toHaveBeenCalledWith(manifest.id);
  });

  it("creates and navigates to a local-errors manifest", async () => {
    const user = userEvent.setup();
    const { store, onOpenManifest } = setup();
    render(
      <StudyHub
        userId="user-a"
        aulas={aulas}
        questions={questions}
        attempts={[incorrectAttempt]}
        store={store}
        onOpenManifest={onOpenManifest}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Revisar erros" }));
    const manifest = store.listByUser("user-a")[0];
    expect(manifest.source).toEqual({ kind: "errors" });
    expect(manifest.questionIds).toEqual([2]);
    expect(onOpenManifest).toHaveBeenCalledWith(manifest.id);
  });

  it("reports an empty local-error source without creating a manifest", async () => {
    const user = userEvent.setup();
    const { store, onOpenManifest } = setup();
    render(
      <StudyHub
        userId="user-a"
        aulas={aulas}
        questions={questions}
        attempts={[]}
        store={store}
        onOpenManifest={onOpenManifest}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Revisar erros" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Nenhuma questão disponível");
    expect(store.listByUser("user-a")).toEqual([]);
    expect(onOpenManifest).not.toHaveBeenCalled();
  });

  it("creates and navigates to the selected aula manifest", async () => {
    const user = userEvent.setup();
    const { store, onOpenManifest } = setup();
    render(
      <StudyHub
        userId="user-a"
        aulas={aulas}
        questions={questions}
        attempts={[]}
        store={store}
        onOpenManifest={onOpenManifest}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Aula"), "2");
    await user.click(screen.getByRole("button", { name: "Estudar aula" }));
    const manifest = store.listByUser("user-a")[0];
    expect(manifest.source).toEqual({ kind: "aula", aulaId: 2 });
    expect(manifest.questionIds).toEqual([3]);
    expect(onOpenManifest).toHaveBeenCalledWith(manifest.id);
  });

  it("creates and navigates to the selected question-type manifest", async () => {
    const user = userEvent.setup();
    const { store, onOpenManifest } = setup();
    render(
      <StudyHub
        userId="user-a"
        aulas={aulas}
        questions={questions}
        attempts={[]}
        store={store}
        onOpenManifest={onOpenManifest}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Tipo de questão"), "TF");
    await user.click(screen.getByRole("button", { name: "Praticar tipo" }));
    const manifest = store.listByUser("user-a")[0];
    expect(manifest.source).toEqual({ kind: "questionType", questionType: "TF" });
    expect(manifest.questionIds).toEqual([2, 3]);
    expect(onOpenManifest).toHaveBeenCalledWith(manifest.id);
  });
});
