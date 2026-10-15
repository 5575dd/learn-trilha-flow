import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CourseMaterials } from "@/components/study/CourseMaterials";
import { findModule2Lesson, module2Lessons, module2PageCount } from "@/data/courseMaterials";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("verified Module 2 materials", () => {
  it("covers the 305-page book once, in 12 separate lessons", () => {
    expect(module2Lessons).toHaveLength(12);
    expect(new Set(module2Lessons.map((item) => `${item.unit}:${item.lesson}`)).size).toBe(12);
    let nextPage = 1;
    for (const item of module2Lessons) {
      expect(item.pages[0]).toBe(nextPage);
      expect(item.pages[1]).toBeGreaterThanOrEqual(item.pages[0]);
      nextPage = item.pages[1] + 1;
    }
    expect(nextPage - 1).toBe(module2PageCount);
  });

  it("preserves all 39 distinct official resources without tokens or embeds", () => {
    const resources = module2Lessons.flatMap((item) => item.resources);
    expect(resources).toHaveLength(39);
    expect(new Set(resources.map((item) => item.href)).size).toBe(39);
    for (const item of resources) {
      expect(item.href).toMatch(/^https:\/\/view\.genially\.com\/[a-f0-9]{24}$/);
    }
    for (const [unit, lesson] of [
      [1, 3],
      [2, 3],
      [3, 1],
    ]) {
      const parts = module2Lessons
        .find((item) => item.unit === unit && item.lesson === lesson)!
        .resources.filter((item) => item.label.startsWith("Complemento"));
      expect(parts.map((item) => item.label)).toEqual([
        `Complemento ${lesson} · Parte 1`,
        `Complemento ${lesson} · Parte 2`,
      ]);
    }
  });

  it.each([
    "Unit 2 - Lesson 2 - Jobs and routines",
    "MODULE 2: UNIT 2 – LESSON 2",
    "Módulo 2: Unidade 2 · Lição 2",
    "Unit 2: Lesson 2 / Unit 2 - Lesson 2",
  ])("recognizes explicit context: %s", (title) => {
    expect(findModule2Lesson(title)?.pages).toEqual([110, 133]);
  });

  it.each([
    "Benjamin's and Jessica's Daily Routines",
    "Sleep Routine, Time Prepositions, and Daily Schedule",
    "Jobs and routines",
    "Unit 12 - Lesson 2",
    "Unit 2 - Lesson 20",
    "Module 1 - Unit 2 - Lesson 2",
    "Módulo 3 - Unidade 2 - Lição 2",
    "Unit 2 - Lesson 2 and Unit 2 - Lesson 3",
    "",
  ])("does not guess the wrong lesson: %s", (title) => {
    expect(findModule2Lesson(title)).toBeUndefined();
  });
});

describe("course materials picker", () => {
  const unitPicker = () => screen.getByRole("combobox", { name: "Unidade do material · Módulo 2" });
  const lessonPicker = () => screen.getByRole("combobox", { name: "Lição do material" });

  it("does not recommend a lesson when the class title is ambiguous", () => {
    render(<CourseMaterials lessonTitle="Daily routines" />);
    expect(unitPicker()).toHaveValue("");
    expect(lessonPicker()).toBeDisabled();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("preselects only a verified explicit unit and lesson", () => {
    render(<CourseMaterials lessonTitle="Unit 2 - Lesson 2" />);
    expect(unitPicker()).toHaveValue("2");
    expect(lessonPicker()).toHaveValue("2");
    expect(screen.getByText("Livro: páginas 110–133 de 305")).toBeVisible();
    expect(screen.getByRole("link", { name: "Complemento 2" })).toHaveAttribute(
      "href",
      "https://view.genially.com/6698ef682c4ef2140f35f2d3",
    );
  });

  it("lets the student choose all 12 lessons and keeps both complement parts", async () => {
    const user = userEvent.setup();
    render(<CourseMaterials />);
    for (const item of module2Lessons) {
      await user.selectOptions(unitPicker(), String(item.unit));
      await user.selectOptions(lessonPicker(), String(item.lesson));
      expect(
        screen.getByText(`Livro: páginas ${item.pages[0]}–${item.pages[1]} de 305`),
      ).toBeVisible();
      expect(screen.getAllByRole("link")).toHaveLength(2 + item.resources.length);
      for (const resource of item.resources) {
        expect(screen.getByRole("link", { name: resource.label })).toHaveAttribute(
          "href",
          resource.href,
        );
      }
    }
  });

  it("clears the previous lesson and its links when changing unit", async () => {
    const user = userEvent.setup();
    render(<CourseMaterials lessonTitle="Unit 2 - Lesson 2" />);
    await user.selectOptions(unitPicker(), "4");
    expect(lessonPicker()).toHaveValue("");
    expect(screen.queryByRole("link", { name: "Homework 2" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    await user.selectOptions(unitPicker(), "");
    expect(lessonPicker()).toBeDisabled();
  });

  it("resets the selection when the selected app class changes", async () => {
    const user = userEvent.setup();
    const view = render(<CourseMaterials lessonTitle="Unit 2 - Lesson 2" />);
    await user.selectOptions(lessonPicker(), "3");
    view.rerender(<CourseMaterials lessonTitle="Unit 4 - Lesson 1" />);
    expect(unitPicker()).toHaveValue("4");
    expect(lessonPicker()).toHaveValue("1");
    expect(screen.getByText("Livro: páginas 228–250 de 305")).toBeVisible();
    view.rerender(<CourseMaterials lessonTitle="Aula sem unidade identificada" />);
    expect(unitPicker()).toHaveValue("");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("does not store selections as answers or completed work", async () => {
    const persist = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    const view = render(<CourseMaterials />);
    await user.selectOptions(unitPicker(), "2");
    await user.selectOptions(lessonPicker(), "3");
    expect(persist).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll("form, iframe")).toHaveLength(0);
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});
