import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStudyClock } from "@/hooks/useStudyClock";
import { groupLessonSessions } from "@/domain/session/lessonSessions";
import type { ValidQuestion } from "@/domain/questions/questionTypes";

describe("automatic session release", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T05:59:45-03:00"));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([6, 19])("unlocks at %i without reloading the open screen", (hour) => {
    const releaseAt = `2026-10-20T${String(hour).padStart(2, "0")}:00:00-03:00`;
    vi.setSystemTime(Date.parse(releaseAt) - 15_000);
    const question: ValidQuestion = {
      id: 1,
      aulaId: 7,
      sessao: 1,
      ordem: 1,
      kind: "TF",
      enunciado: "True or false?",
      explicacao: "",
      traducao: "Verdadeiro ou falso?",
      canonicalAnswerText: "True",
      releaseAt,
    };
    const { result } = renderHook(() => groupLessonSessions([question], useStudyClock())[0]);
    expect(result.current.available).toBe(false);
    act(() => vi.advanceTimersByTime(14_999));
    expect(result.current.available).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.available).toBe(true);
  });

  it.each(["focus", "pageshow"])("refreshes immediately on %s after sleep", (event) => {
    const { result } = renderHook(() => useStudyClock());
    act(() => {
      vi.setSystemTime(new Date("2026-10-20T19:05:00-03:00"));
      window.dispatchEvent(new Event(event));
    });
    expect(result.current).toBe(Date.now());
    expect(vi.getTimerCount()).toBe(1);
  });

  it("refreshes when the installed app becomes visible again", () => {
    const { result } = renderHook(() => useStudyClock());
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    act(() => {
      vi.setSystemTime(new Date("2026-10-21T06:05:00-03:00"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(Date.now());
  });

  it("cleans up timers and listeners on unmount", () => {
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useStudyClock());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(removeWindow).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith("pageshow", expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});
