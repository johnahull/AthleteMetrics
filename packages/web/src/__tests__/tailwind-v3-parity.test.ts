// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { compile } from "@tailwindcss/node";

/**
 * Guards the Tailwind config in index.css (issues #523, #562). Compiles the real stylesheet and
 * checks the generated CSS, so a Tailwind upgrade (or an edit that breaks a token mapping) turns into
 * a red test instead of a silent visual regression.
 */
const srcDir = path.resolve(__dirname, "..");

let build: (candidates: string[]) => string;

beforeAll(async () => {
  const css = readFileSync(path.join(srcDir, "index.css"), "utf8");
  const compiler = await compile(css, { base: srcDir, onDependency: () => {} });
  build = (candidates) => compiler.build(candidates);
});

describe("tailwind config", () => {
  it("uses the border token as the default border color", () => {
    const css = build(["border"]);
    expect(css).toMatch(/border-color: var\(--border\)/);
    // the old rule wrapped an hsl() token in hsl() again, which is invalid CSS
    expect(css).not.toContain("border-color: hsl(var(--border))");
  });

  it("maps bg-sidebar to the defined --sidebar token", () => {
    const css = build(["bg-sidebar"]);
    expect(css).toMatch(/\.bg-sidebar \{\s*background-color: var\(--sidebar\);/);
    expect(css).not.toContain("--sidebar-background");
  });

  it("adopts the Tailwind v4 default palette (no pinned v3 hex colors)", () => {
    const css = build(["bg-blue-600"]);
    expect(css).toMatch(/--color-blue-600: oklch\(/);
    expect(css).not.toContain("#2563eb");
  });

  it("applies hover styles on every device, as v3 did", () => {
    const css = build(["hover:bg-gray-50", "group-hover:opacity-100"]);
    expect(css).not.toContain("@media (hover: hover)");
  });

  it("keeps the class-based dark variant", () => {
    expect(build(["dark:bg-black"])).toContain(":is(.dark *)");
  });

  it("keeps the project radius and shadow overrides", () => {
    const css = build(["rounded-sm", "rounded-md", "rounded-lg", "shadow-sm"]);
    expect(css).toContain("border-radius: calc(var(--radius) - 4px)");
    expect(css).toContain("border-radius: calc(var(--radius) - 2px)");
    expect(css).toMatch(/\.rounded-lg \{\s*border-radius: var\(--radius\);/);
    expect(css).toMatch(/\.shadow-sm \{[^}]*--tw-shadow: 0px 1px 2px 0px[^;]*0px 1px 3px 0px/);
  });

  it("keeps the sRGB gradient interpolation modifier available", () => {
    expect(build(["bg-linear-to-r/srgb", "from-blue-600", "to-purple-600"])).toContain("in srgb");
  });
});

describe("spacing convention (issue #562)", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === "node_modules" || e.name === "__tests__" ? [] : sourceFiles(p);
      return /\.tsx$/.test(e.name) ? [p] : [];
    });
  }

  it("uses gap, not space-x/space-y, on flex and grid containers", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcDir)) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        for (const m of line.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)) {
          const tokens = m[2].split(/\s+/);
          const spacing = tokens.some((t) => /(^|:)space-[xy]-/.test(t));
          const display = tokens.some((t) => ["flex", "inline-flex", "grid"].includes(t));
          // space-* margins are not applied to flex/grid items the way v3 did (and ignore hidden items); use gap-*
          if (spacing && display) offenders.push(`${path.relative(srcDir, file)}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the shadcn FormItem a grid with a row gap", () => {
    const form = readFileSync(path.join(srcDir, "components/ui/form.tsx"), "utf8");
    expect(form).toContain('cn("grid gap-y-2", className)');
  });
});
