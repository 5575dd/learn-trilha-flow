import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType, ReactNode } from "react";
import { Route } from "@/routes/aulas.$id.index";

const state = vi.hoisted(() => ({
  questions: [] as unknown[],
  loading: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ id: "16" }),
  }),
  Link: ({ children }: { children: ReactNode }) => <a href="/preparar">{children}</a>,
}));
vi.mock("@/auth/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/data/queries", () => ({ getAula: vi.fn(), listQuestoesByAula: vi.fn() }));
vi.mock("@/domain/questions/questionValidator", () => ({
  validateAndRepair: (questions: unknown[]) =>
    questions.map((question) => ({ status: "valid", question })),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) =>
    queryKey[0] === "aula"
      ? {
          data: {
            id: 16,
            titulo: "Present Simple",
            status: "concluida",
            quantidade_atividades: 40,
            content: {
              objectives: [],
              keyTakeaways: [],
              preActivityReview: [],
              grammar: [],
              vocabulary: [],
              dialogues: [],
              corrections: [],
              timeline: [],
              pronunciation: [],
              visuals: [],
            },
          },
          isLoading: false,
          error: null,
        }
      : {
          data: state.questions,
          isLoading: state.loading,
          error: state.error,
          refetch: state.refetch,
        },
}));

const Detail = Route.options.component as ComponentType;
function question(id: number, sessao: number) {
  return { id, aulaId: 16, sessao, ordem: id, kind: "TF" };
}

describe("lesson detail session display", () => {
  beforeEach(() => {
    cleanup();
    state.questions = Array.from({ length: 40 }, (_, i) => question(i + 1, i < 20 ? 1 : 2));
    state.loading = false;
    state.error = null;
    state.refetch.mockReset();
  });

  it("shows two sessions of 20 without an empty third session", () => {
    render(<Detail />);
    expect(screen.getByText("Suas sessões")).toBeVisible();
    expect(screen.getAllByText(/20 atividades/)).toHaveLength(2);
    expect(screen.queryByText(/Sessão 3/)).not.toBeInTheDocument();
    expect(screen.queryByText("Suas três sessões")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preparar sessão" })).toBeVisible();
  });

  it("keeps the third session of a legacy lesson", () => {
    state.questions.push(question(41, 3));
    render(<Detail />);
    expect(screen.getByText(/Sessão 3/)).toBeVisible();
  });

  it("does not offer study while questions are loading", () => {
    state.loading = true;
    state.questions = [];
    render(<Detail />);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando atividades");
    expect(screen.queryByRole("link", { name: "Preparar sessão" })).not.toBeInTheDocument();
  });

  it("offers retry instead of silently showing an empty lesson on failure", async () => {
    state.error = new Error("offline");
    state.questions = [];
    render(<Detail />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar");
    expect(screen.queryByRole("link", { name: "Preparar sessão" })).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Tentar carregar atividades novamente" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
