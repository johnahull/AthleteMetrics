// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { compile } from "@tailwindcss/node";

/**
 * Guards the Tailwind v3 parity shims in index.css (issue #523). Compiles the real stylesheet and
 * checks the generated CSS, so an upstream Tailwind change to the built-ins these shims override
 * turns into a red test instead of a silent visual regression.
 */
const srcDir = path.resolve(__dirname, "..");

let build: (candidates: string[]) => string;

beforeAll(async () => {
  const css = readFileSync(path.join(srcDir, "index.css"), "utf8");
  const compiler = await compile(css, { base: srcDir, onDependency: () => {} });
  build = (candidates) => compiler.build(candidates);
});

describe("tailwind v3 parity shims", () => {
  it("keeps the v3 sibling combinator for space-y/space-x", () => {
    const css = build(["space-y-2", "space-x-3"]);
    expect(css).toContain("> :not([hidden]) ~ :not([hidden])");
    expect(css).toMatch(/margin-top: calc\(calc\(var\(--spacing\) \* 2\)/);
    expect(css).toMatch(/margin-left: calc\(calc\(var\(--spacing\) \* 3\)/);
  });

  it("does not let the space reset override a child's own margin class", () => {
    const css = build(["space-y-2"]);
    expect(css).toContain(":not([class*='mb-'])");
  });

  it("pins the v3 default palette", () => {
    const css = build(["bg-blue-600", "text-gray-500"]);
    expect(css).toContain("--color-blue-600: #2563eb");
    expect(css).toContain("--color-gray-500: #6b7280");
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
});
