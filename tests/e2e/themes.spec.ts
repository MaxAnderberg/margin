import { THEMES } from "../../src/themes";
import { cursorAfter, expect, openMargin, test } from "./fixtures";

const FILE = "/notes/themes.md";
const DOC = [
  "## Heading",
  "",
  "Text with a [link](https://tauri.app) and `code`.",
  "",
  "- [x] done",
  "",
  "```rust",
  'fn main() { let s = "hi"; }',
  "```",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[One] --> B[Two]",
  "```",
  "",
  "End.",
].join("\n");

/** Every color a theme defines, as the browser normalizes it (rgb(...)). */
async function cssColor(page: import("@playwright/test").Page, value: string) {
  return page.evaluate((value) => {
    const probe = document.createElement("i");
    probe.style.color = value;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, value);
}

for (const theme of THEMES) {
  test(`${theme.name} colors the whole editor`, async ({ page }) => {
    await openMargin(page, { launch: FILE, files: { [FILE]: { text: DOC, mtime: 1 } }, theme: theme.id });
    await cursorAfter(page, "End.");
    await expect(page.locator(".cm-md-mermaid svg")).toBeVisible();

    const c = theme.colors;
    const checks: [string, string, string][] = [
      ["body", "backgroundColor", c.bg],
      [".cm-content", "color", c.text],
      [".cm-md-h2", "color", c.heading],
      [".cm-md-link", "color", c.accent],
      [".cm-md-code", "backgroundColor", c.codeBg],
      [".cm-md-codeblock", "backgroundColor", c.codeBg],
      [".cm-md-checkbox.is-checked", "backgroundColor", c.accent],
    ];
    for (const [selector, property, expected] of checks) {
      const actual = await page.locator(selector).first().evaluate((el, p) => (getComputedStyle(el) as any)[p], property);
      expect(actual, `${selector} ${property}`).toBe(await cssColor(page, expected));
    }

    const keyword = page.locator(".cm-md-codeblock span", { hasText: /^fn$/ });
    expect(await keyword.evaluate((el) => getComputedStyle(el).color)).toBe(await cssColor(page, c.codeKeyword));

    // Diagrams use the theme's colors too.
    const node = page.locator(".cm-md-mermaid svg .node rect").first();
    expect(await node.evaluate((el) => getComputedStyle(el).fill)).toBe(await cssColor(page, c.codeBg));
    expect(await node.evaluate((el) => getComputedStyle(el).stroke)).toBe(await cssColor(page, c.accent));
  });
}

test.describe("theme picker", () => {
  const themeId = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.dataset.theme);

  test.beforeEach(async ({ page }) => {
    await openMargin(page, { launch: FILE, files: { [FILE]: { text: DOC, mtime: 1 } }, theme: "margin-light" });
    await cursorAfter(page, "End.");
    await page.keyboard.press("ControlOrMeta+Shift+L");
    await expect(page.locator(".theme-picker")).toBeVisible();
  });

  test("lists every theme plus Auto, marking the current one", async ({ page }) => {
    await expect(page.locator(".theme-picker-item")).toHaveCount(THEMES.length + 1);
    await expect(page.locator(".theme-picker-item", { hasText: "current" })).toContainText("Margin Light");
  });

  test("arrow keys preview themes live; Escape restores the original", async ({ page }) => {
    await page.keyboard.press("ArrowDown");
    expect(await themeId(page)).toBe("margin-dark");
    await page.keyboard.press("Escape");
    await expect(page.locator(".theme-picker")).toHaveCount(0);
    expect(await themeId(page)).toBe("margin-light");
  });

  test("typing filters by every word; Enter keeps the choice across restarts", async ({ page }) => {
    await page.keyboard.type("gruv dark");
    await expect(page.locator(".theme-picker-item")).toHaveCount(1);
    await page.keyboard.press("Enter");
    expect(await themeId(page)).toBe("gruvbox-dark");
    await page.reload();
    await expect.poll(() => themeId(page)).toBe("gruvbox-dark");
  });
});
