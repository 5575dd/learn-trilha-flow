import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TutorAnswer } from "@/features/tucunare/TutorAnswer";
import { filterTutorSources } from "@/features/tucunare/tucunareClient";

describe("Tucunare answer presentation", () => {
  it("renders emphasis and lists without displaying formatting markers", () => {
    const { container } = render(
      <TutorAnswer text={"Use **does** com *she*.\n\n1. Does she work?\n2. Does he study?"} />,
    );
    expect(container.querySelector("strong")).toHaveTextContent("does");
    expect(container.querySelector("em")).toHaveTextContent("she");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.textContent).not.toContain("**");
  });
  it("does not create HTML, remote images, embedded frames or model-generated links", () => {
    const { container } = render(
      <TutorAnswer
        text={
          '<script>alert(1)</script>\n\n<img src="https://evil.example/pixel" onerror="alert(1)">\n\n<iframe src="https://evil.example"></iframe>\n\n[clique](javascript:alert(1))\n\n![imagem](https://evil.example/pixel)\n\n[link externo](https://evil.example)'
        }
      />,
    );
    expect(container.querySelector("script,img,iframe,a")).toBeNull();
    expect(screen.getByText(/link externo/)).toBeInTheDocument();
  });
  it("keeps code examples as inert text and headings at normal panel scale", () => {
    const { container } = render(<TutorAnswer text={"# Exemplo\n\n`<script>alert(1)</script>`"} />);
    expect(container.querySelector("script,h1")).toBeNull();
    expect(container.querySelector("code")).toHaveTextContent("<script>alert(1)</script>");
    expect(screen.getByText("Exemplo")).toHaveClass("font-semibold");
  });
});

describe("Tucunare source validation", () => {
  it("preserves course references while excluding other hosts and arbitrary fields", () => {
    expect(
      filterTutorSources([
        {
          label: " Livro ",
          url: "https://lms-wo.com/mod/url/view.php?id=11202",
          secret: "not propagated",
        },
        { label: "Aula", url: "https://learn-trilha-flow.lovable.app/aulas/19" },
        { label: "Link", url: "javascript:alert(1)" },
        { label: "Link", url: "https://learn-trilha-flow.lovable.app.evil.example/aulas/19" },
        { label: "Link", url: "https://view.genially.com/6698fc6df44799815a435283?redirect=evil" },
        null,
        { label: "", url: "https://learn-trilha-flow.lovable.app/aulas/19" },
      ]),
    ).toEqual([
      { label: "Livro", url: "https://lms-wo.com/mod/url/view.php?id=11202" },
      { label: "Aula", url: "https://learn-trilha-flow.lovable.app/aulas/19" },
    ]);
  });
  it.each([undefined, null, {}, "https://evil.example"])(
    "rejects malformed stored sources %j",
    (value) => {
      expect(filterTutorSources(value)).toEqual([]);
    },
  );
});
