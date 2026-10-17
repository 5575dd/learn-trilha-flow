import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TucunareAssistant } from "@/features/tucunare/TucunareAssistant";
import { TucunareProvider } from "@/features/tucunare/TucunareContext";
import { TutorError } from "@/features/tucunare/tucunareClient";
import { CourseMaterials } from "@/components/study/CourseMaterials";

const mocks = vi.hoisted(() => ({
  user: "one" as string | undefined,
  path: "/aulas/19",
  ask: vi.fn(),
  status: vi.fn(),
}));
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ loading: false, session: mocks.user ? { user: { id: mocks.user } } : null }),
}));
vi.mock("@tanstack/react-router", () => ({ useRouterState: () => mocks.path }));
vi.mock("@/features/tucunare/tucunareClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/tucunare/tucunareClient")>()),
  askTucunare: mocks.ask,
  getTucunareStatus: mocks.status,
}));
const view = () => (
  <TucunareProvider>
    <CourseMaterials lessonTitle="Unit 2 - Lesson 3" />
    <TucunareAssistant />
  </TucunareProvider>
);
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mocks.user = "one";
  mocks.path = "/aulas/19";
  mocks.ask
    .mockReset()
    .mockResolvedValue({ answer: "Use does com she.", remaining: 29, sources: [] });
  mocks.status.mockReset().mockResolvedValue({ remaining: 30, limit: 30 });
});

describe("Tucunare widget", () => {
  it("connects the dialog description without accessibility warnings", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      render(view());
      fireEvent.click(await screen.findByRole("button", { name: "Conversar com Tucunaré" }));
      expect(screen.getByRole("dialog", { name: "Tucunaré" })).toHaveAccessibleDescription(
        "Conversa com a assistente de inglês Tucunaré.",
      );
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });
  it("restores safe material references when reopening a saved conversation", async () => {
    sessionStorage.setItem(
      "trilha:tucunare:conversation:v1:one",
      JSON.stringify({
        updatedAt: Date.now(),
        messages: [
          {
            role: "assistant",
            text: "Use **does** com she.",
            sources: [
              { label: "Referência do livro", url: "https://lms-wo.com/mod/url/view.php?id=11202" },
              { label: "Unsafe source", url: "https://evil.example" },
            ],
          },
        ],
      }),
    );
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: "Conversar com Tucunaré" }));
    expect(screen.getByRole("link", { name: "Referência do livro" })).toHaveAttribute(
      "href",
      "https://lms-wo.com/mod/url/view.php?id=11202",
    );
    expect(screen.queryByRole("link", { name: "Unsafe source" })).not.toBeInTheDocument();
    expect(screen.getByText("does").tagName).toBe("STRONG");
    expect(mocks.ask).not.toHaveBeenCalled();
  });
  it("does not restore expired conversations", async () => {
    sessionStorage.setItem(
      "trilha:tucunare:conversation:v1:one",
      JSON.stringify({
        updatedAt: Date.now() - 13 * 60 * 60 * 1000,
        messages: [{ role: "assistant", text: "Expired answer" }],
      }),
    );
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: "Conversar com Tucunaré" }));
    expect(screen.queryByText("Expired answer")).not.toBeInTheDocument();
  });
  it("uses the app theme for the floating control, header and send button", async () => {
    render(view());
    const trigger = await screen.findByRole("button", { name: "Conversar com Tucunaré" });
    expect(trigger).toHaveClass("bg-primary", "text-primary-foreground");
    fireEvent.click(trigger);
    expect(screen.getByRole("heading", { name: "Tucunaré" }).closest("header")).toHaveClass(
      "bg-primary",
      "text-primary-foreground",
    );
    expect(screen.getByRole("button", { name: "Enviar pergunta" })).toHaveClass(
      "bg-primary",
      "text-primary-foreground",
    );
  });
  it("opens without spending an AI call, sends once, and preserves conversation on reopen", async () => {
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: "Conversar com Tucunaré" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(mocks.ask).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Quando uso does?" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pergunta" }));
    expect(await screen.findByText("Use does com she.")).toBeInTheDocument();
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    expect(mocks.ask.mock.calls[0][0]).toMatchObject({ lessonId: 19, message: "Quando uso does?" });
    fireEvent.click(screen.getByRole("button", { name: "Fechar Tucunaré" }));
    fireEvent.click(screen.getByRole("button", { name: "Conversar com Tucunaré" }));
    expect(screen.getByText("Use does com she.")).toBeInTheDocument();
  });
  it("opens alternative practice as an editable draft without calling AI", async () => {
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "Prática extra" }));
    expect(((await screen.findByRole("textbox")) as HTMLTextAreaElement).value).toContain(
      "pratica extra",
    );
    expect(mocks.ask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pergunta" }));
    await waitFor(() => expect(mocks.ask).toHaveBeenCalled());
    expect(mocks.ask.mock.calls[0][0].materialKey).toBe("module2-u2-l3");
  });
  it("keeps old-user answers out of a new user's conversation", async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.ask.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const rendered = render(view());
    fireEvent.click(await screen.findByRole("button", { name: "Conversar com Tucunaré" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Private question" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pergunta" }));
    mocks.user = "two";
    rendered.rerender(view());
    await act(async () => resolve({ answer: "Private answer", remaining: 29, sources: [] }));
    fireEvent.click(await screen.findByRole("button", { name: "Conversar com Tucunaré" }));
    expect(screen.queryByText("Private answer")).not.toBeInTheDocument();
    expect(screen.queryByText("Private question")).not.toBeInTheDocument();
  });
  it("shows quota failures without losing the question", async () => {
    mocks.ask.mockRejectedValue(new TutorError("daily_limit", 3600, 0));
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: "Conversar com Tucunaré" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Help me" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pergunta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("30 perguntas");
    expect(screen.getByText("Help me")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeDisabled();
  });
  it("hides for logged-out users", () => {
    mocks.user = undefined;
    render(view());
    expect(
      screen.queryByRole("button", { name: "Conversar com Tucunaré" }),
    ).not.toBeInTheDocument();
  });
});
