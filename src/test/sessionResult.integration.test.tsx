import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionResult } from "@/components/study/SessionResult";
import { LocalManifestStore } from "@/data/manifestStore";
import { InMemoryAttemptRepository } from "@/data/repositories/AttemptRepository";
import type { AttemptRecord } from "@/domain/session/sessionReducer";

function setup() {
  let id = 0;
  const store = new LocalManifestStore({
    createId: () => `manifest-${++id}`,
    now: () => id,
  });
  const manifest = store.create({
    userId: "user-a",
    source: { kind: "quick" },
    questionIds: [1, 2],
  });
  return {
    store,
    manifest,
    repository: new InMemoryAttemptRepository(),
    onOpenManifest: vi.fn(),
  };
}

function attempt(status: "correct" | "incorrect"): AttemptRecord {
  return {
    attemptId: `attempt-${status}`,
    questionId: 1,
    timeMs: 1,
    result: {
      status,
      studentAnswerDisplay: "",
      correctAnswerDisplay: "",
      normalizedStudentAnswer: "",
      normalizedCorrectAnswer: "",
      explanation: "",
      diagnosticCode: "",
      metadata: {},
    },
  };
}

describe("SessionResult", () => {
  beforeEach(() => localStorage.clear());

  it("does not show a false 0% result without attempts", async () => {
    const state = setup();
    render(
      <SessionResult
        manifest={state.manifest}
        userId="user-a"
        store={state.store}
        repository={state.repository}
        onOpenManifest={state.onOpenManifest}
      />,
    );
    expect(await screen.findByText("Esta sessão não possui tentativas salvas.")).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("creates a new errors manifest from incorrect attempts", async () => {
    const user = userEvent.setup();
    const state = setup();
    await state.repository.save("user-a", state.manifest.id, attempt("incorrect"));
    render(
      <SessionResult
        manifest={state.manifest}
        userId="user-a"
        store={state.store}
        repository={state.repository}
        onOpenManifest={state.onOpenManifest}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Revisar erros desta sessão" }));
    const review = state.store.listByUser("user-a").find((item) => item.id !== state.manifest.id);
    expect(review?.source).toEqual({ kind: "errors", fromSessionId: state.manifest.id });
    expect(review?.questionIds).toEqual([1]);
    expect(state.onOpenManifest).toHaveBeenCalledWith(review?.id);
  });

  it("shows an empty state when the session has no errors", async () => {
    const state = setup();
    await state.repository.save("user-a", state.manifest.id, attempt("correct"));
    render(
      <SessionResult
        manifest={state.manifest}
        userId="user-a"
        store={state.store}
        repository={state.repository}
        onOpenManifest={state.onOpenManifest}
      />,
    );
    expect(await screen.findByText("Nenhum erro para revisar nesta sessão.")).toBeTruthy();
  });
});
