import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { webAppLinks, webAppMeta } from "@/lib/webAppHead";

const publicFile = (path: string) => readFileSync(resolve("public", path.replace(/^\//, "")));
const manifest = JSON.parse(publicFile("manifest.webmanifest").toString("utf8"));

describe("home screen photo icon", () => {
  it("opens from home in standalone mode within the same app origin", () => {
    expect(manifest).toMatchObject({
      id: "/",
      name: "Trilha",
      short_name: "Trilha",
      start_url: "/",
      scope: "/",
      display: "standalone",
      lang: "pt-BR",
    });
    expect(webAppMeta).toContainEqual({ name: "apple-mobile-web-app-capable", content: "yes" });
    expect(webAppMeta).toContainEqual({
      name: "apple-mobile-web-app-title",
      content: manifest.short_name,
    });
    expect(webAppLinks).toContainEqual({ rel: "manifest", href: "/manifest.webmanifest" });
    expect(webAppMeta.find((meta) => meta.name === "theme-color")?.content).toBe(
      manifest.theme_color,
    );
  });
  it.each([
    ...(manifest.icons as { src: string; sizes: string }[]).map((icon) => ({
      href: icon.src,
      sizes: icon.sizes,
    })),
    ...webAppLinks.filter((link) => link.rel !== "manifest"),
  ])("serves a real square PNG at $href with the declared dimensions", (icon) => {
    expect(icon.href).toMatch(/^\/icons\/trilha-photo-v1-\d+\.png$/);
    const png = publicFile(icon.href);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const [width, height] = (icon.sizes ?? "").split("x").map(Number);
    expect(png.readUInt32BE(16)).toBe(width);
    expect(png.readUInt32BE(20)).toBe(height);
    expect(width).toBe(height);
  });
  it("keeps the conventional iPhone fallback identical to the versioned touch icon", () => {
    expect(publicFile("apple-touch-icon.png")).toEqual(publicFile("icons/trilha-photo-v1-180.png"));
  });
  it("registers the icon and app-mode metadata in the root document", () => {
    const root = readFileSync(resolve("src/routes/__root.tsx"), "utf8");
    expect(root).toContain("...webAppMeta");
    expect(root).toContain("...webAppLinks");
  });
});
