import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { LessonSessionActions } from "@/components/study/LessonSessionActions";
import { LessonProgressBadge } from "@/components/study/LessonProgressBadge";
import type { LessonSessionProgress } from "@/domain/progress/lessonProgress";
import { CourseMaterials } from "@/components/study/CourseMaterials";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
    ...rest
  }: {
    children: ReactNode;
    to: string;
    search?: Record<string, string>;
  }) => (
    <a href={`${to}?${new URLSearchParams(search)}`} {...rest}>
      {children}
    </a>
  ),
}));
const base: LessonSessionProgress = {
  session: 1,
  total: 20,
  answered: 0,
  completed: false,
  available: true,
};
const complete = {
  schemaVersion: 1 as const,
  id: "done",
  userId: "u",
  source: { kind: "aula" as const, aulaId: 17 },
  criteria: {},
  questionIds: [1],
  status: "completed" as const,
  currentIndex: 1,
  createdAt: 1,
  updatedAt: 2,
  completedAt: Date.parse("2026-10-14T15:00:00Z"),
};
beforeEach(cleanup);

describe("lesson session actions", () => {
  it("offers a result and explicit practice instead of silently restarting", () => {
    render(
      <LessonSessionActions
        aulaId={17}
        progress={{ ...base, completed: true, completedManifest: complete }}
      />,
    );
    expect(screen.getByText("Sessão concluída")).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver resultado da sessão 1" })).toHaveAttribute(
      "href",
      "/sessao/resultado?m=done",
    );
    expect(screen.getByRole("link", { name: "Praticar novamente" })).toHaveAttribute(
      "href",
      expect.stringContaining("restart=1"),
    );
    expect(screen.queryByRole("link", { name: /Começar/ })).not.toBeInTheDocument();
  });
  it("continues the same manifest without losing the previous completion badge", () => {
    render(
      <LessonSessionActions
        aulaId={17}
        progress={{
          ...base,
          completed: true,
          completedManifest: complete,
          activeManifest: { ...complete, id: "repeat", status: "active", currentIndex: 3 },
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "Continuar sessão 1" })).toHaveAttribute(
      "href",
      "/sessao?m=repeat",
    );
    expect(screen.getByText("Sessão concluída")).toBeVisible();
  });
  it("waits for history instead of exposing a premature start button", () => {
    render(<LessonSessionActions aulaId={17} progress={base} loading />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeVisible();
  });
  it("does not mislabel unavailable history as not started", () => {
    render(
      <LessonProgressBadge
        progress={{ status: "not-started", sessions: [], completedSessions: 0, totalSessions: 0 }}
        error
      />,
    );
    expect(screen.getByText("Progresso indisponível")).toBeVisible();
  });
  it("links to verified official resources without embedding credentials or copying the book", () => {
    render(<CourseMaterials showLesson2 />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Homework 2" })).toHaveAttribute(
      "href",
      "https://view.genially.com/69667ac10599acea0fd573e3",
    );
    expect(screen.getByRole("link", { name: /Livro completo/ })).toHaveAttribute(
      "href",
      "https://lms-wo.com/mod/url/view.php?id=11202",
    );
  });
});
