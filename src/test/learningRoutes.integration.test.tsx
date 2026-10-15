import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import type { LessonProgress } from "@/domain/progress/lessonProgress";
import { Route as HomeRoute } from "@/routes/index";
import { Route as PrepareRoute } from "@/routes/aulas.$id.preparar";
import { Route as StudyRoute } from "@/routes/aulas.$id.estudar";

const controls = vi.hoisted(() => ({
  loading: false,
  error: null as Error | null,
  search: {} as Record<string, string>,
  progress: {
    status: "not-started",
    sessions: [],
    completedSessions: 0,
    totalSessions: 2,
  } as LessonProgress,
  studyMount: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ id: "17" }),
    useSearch: () => controls.search,
  }),
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    to,
    search,
    params: _params,
    ...rest
  }: {
    children: ReactNode;
    to: string;
    search?: Record<string, string>;
    params?: unknown;
  }) => (
    <a href={`${to}${search ? `?${new URLSearchParams(search)}` : ""}`} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/auth/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ session: { user: { id: "u1" } } }) }));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/data/queries", () => ({ listAulas: vi.fn(), listQuestoesByAula: vi.fn() }));
vi.mock("@/components/study/StudySession", () => ({
  StudySession: (props: unknown) => {
    controls.studyMount(props);
    return <p>Runner started</p>;
  },
}));
vi.mock("@/hooks/useLearningProgress", () => ({
  useLearningProgress: () => ({
    userId: "u1",
    isLoading: controls.loading,
    error: controls.error,
    warning: "",
    localOnly: false,
    getLesson: () => controls.progress,
    daily: { today: 12, days: ["2026-10-14", "2026-10-13"] },
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    isLoading: false,
    error: null,
    data:
      queryKey[0] === "aulas"
        ? [
            {
              id: 17,
              titulo: "Jobs and routines",
              status: "concluida",
              quantidade_atividades: 40,
              data_aula: "2026-10-05",
            },
          ]
        : Array.from({ length: 40 }, (_, i) => ({
            id: i + 1,
            aula_id: 17,
            tipo: "TF",
            enunciado: "In this question, do comes before you.",
            resposta_correta: "True",
            opcoes: "True|False",
            explicacao: "",
            traducao: "",
            audio_texto: null,
            sessao: i < 20 ? 1 : 2,
            ordem: (i % 20) + 1,
            dificuldade: 1,
            metadados: {},
          })),
  }),
}));
const Home = HomeRoute.options.component as ComponentType;
const Prepare = PrepareRoute.options.component as ComponentType;
const Study = StudyRoute.options.component as ComponentType;
const done = {
  schemaVersion: 1 as const,
  id: "completed-1",
  userId: "u1",
  source: { kind: "aula" as const, aulaId: 17 },
  criteria: {},
  questionIds: Array.from({ length: 20 }, (_, i) => i + 1),
  status: "completed" as const,
  currentIndex: 20,
  createdAt: 1,
  updatedAt: 2,
};
beforeEach(() => {
  cleanup();
  controls.loading = false;
  controls.error = null;
  controls.search = {};
  controls.studyMount.mockClear();
  controls.progress = {
    status: "not-started",
    completedSessions: 0,
    totalSessions: 2,
    sessions: [
      { session: 1, total: 20, answered: 0, completed: false, available: true },
      { session: 2, total: 20, answered: 0, completed: false, available: true },
    ],
  };
});

describe("visible lesson progress across entry points", () => {
  it("does not confuse the engine's concluida status with a completed lesson on home", () => {
    render(<Home />);
    expect(screen.getByText("Ainda não iniciada")).toBeVisible();
    expect(screen.queryByText("Aula concluída")).not.toBeInTheDocument();
    expect(screen.getByText("12 atividades respondidas")).toBeVisible();
    expect(screen.getByText("14/10/2026")).toBeVisible();
  });
  it("shows the persisted completed lesson on home", () => {
    controls.progress.status = "completed";
    controls.progress.completedSessions = 2;
    render(<Home />);
    expect(screen.getByText("Aula concluída")).toBeVisible();
  });
  it("does not flash not-started labels while remote history loads", () => {
    controls.loading = true;
    render(<Home />);
    expect(screen.queryByText("Ainda não iniciada")).not.toBeInTheDocument();
    expect(screen.getByText("Carregando progresso…")).toBeVisible();
  });
  it("separates a completed first session and a new second session", () => {
    controls.progress.sessions[0] = {
      ...controls.progress.sessions[0],
      completed: true,
      completedManifest: done,
    };
    controls.progress.status = "in-progress";
    controls.progress.completedSessions = 1;
    render(<Prepare />);
    expect(screen.getByRole("link", { name: "Ver resultado da sessão 1" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Começar sessão 2" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Começar sessão 1" })).not.toBeInTheDocument();
  });
  it("opening a completed session URL cannot allocate a new session automatically", () => {
    controls.search = { sessao: "1" };
    controls.progress.sessions[0] = {
      ...controls.progress.sessions[0],
      completed: true,
      completedManifest: done,
    };
    render(<Study />);
    expect(controls.studyMount).not.toHaveBeenCalled();
    expect(
      screen.getByText("Você já concluiu esta sessão. Seu resultado continua salvo."),
    ).toBeVisible();
  });
  it("only explicit restart opens the study runner for a completed session", () => {
    controls.search = { sessao: "1", restart: "1" };
    controls.progress.sessions[0] = {
      ...controls.progress.sessions[0],
      completed: true,
      completedManifest: done,
    };
    render(<Study />);
    expect(controls.studyMount).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "restart", sessionScope: "sessao-1" }),
    );
  });
  it("does not allocate a session before confirming history or on index failure", () => {
    controls.loading = true;
    render(<Study />);
    expect(controls.studyMount).not.toHaveBeenCalled();
    cleanup();
    controls.loading = false;
    controls.error = new Error("offline");
    render(<Study />);
    expect(controls.studyMount).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeVisible();
  });
});
