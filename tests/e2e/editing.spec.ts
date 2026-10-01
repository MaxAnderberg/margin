import { cursorAfter, docText, expect, lineText, openMargin, test } from "./fixtures";

const DOC = [
  "# Title",
  "",
  "Some **bold** and *soft* text with a [link](https://tauri.app).",
  "",
  "- [ ] a task",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[Write] --> B[Save]",
  "```",
  "",
  "Last line.",
].join("\n");

const FILE = "/notes/doc.md";

test.beforeEach(async ({ page }) => {
  await openMargin(page, { launch: FILE, files: { [FILE]: { text: DOC, mtime: 1 } } });
  await cursorAfter(page, "Last line.");
});

test.describe("live preview", () => {
  test("hides Markdown syntax away from the cursor and reveals it on the cursor's line", async ({ page }) => {
    expect(await lineText(page, "Some")).toBe("Some bold and soft text with a link.");
    await cursorAfter(page, "**bo");
    expect(await lineText(page, "Some")).toContain("**bold**");
  });

  test("labels every heading in the margin", async ({ page }) => {
    const heading = page.locator(".cm-md-h1");
    await expect(heading).toHaveAttribute("data-level", "H1");
    const label = await heading.evaluate((el) => getComputedStyle(el, "::before").content);
    expect(label).toBe('"H1"');
  });

  test("renders tables, and shows the source when the cursor is inside", async ({ page }) => {
    await expect(page.locator(".cm-md-table table td").first()).toHaveText("1");
    await cursorAfter(page, "| 1");
    await expect(page.locator(".cm-md-table")).toHaveCount(0);
  });

  test("clicking a checkbox toggles the task", async ({ page }) => {
    await page.locator(".cm-md-checkbox").click();
    expect(await docText(page)).toContain("- [x] a task");
  });
});

test.describe("diagrams", () => {
  test("render as SVG", async ({ page }) => {
    await expect(page.locator(".cm-md-mermaid svg")).toBeVisible();
    await expect(page.locator(".cm-md-mermaid svg")).toContainText("Write");
  });

  test("arrow keys step into a diagram: highlighted source with a live preview below", async ({ page }) => {
    await expect(page.locator(".cm-md-mermaid svg")).toBeVisible();
    await cursorAfter(page, "| 1 | 2 |");
    await page.keyboard.press("ArrowDown"); // blank line
    await page.keyboard.press("ArrowDown"); // into the diagram
    await expect(page.locator(".cm-md-mermaid.is-editing svg")).toBeVisible();
    await expect(page.locator(".cm-line", { hasText: "flowchart LR" })).toBeVisible();
    // keyword and arrow are syntax-highlighted
    const styled = await page.locator(".cm-line", { hasText: "-->" }).locator("span").allInnerTexts();
    expect(styled).toContain("-->");
  });

  test("the live preview follows edits", async ({ page }) => {
    await cursorAfter(page, "B[Save]");
    await page.keyboard.press("Enter");
    await page.keyboard.type("  B --> C[Ship]");
    await expect(page.locator(".cm-md-mermaid.is-editing svg")).toContainText("Ship");
  });

  test("a syntax error keeps the last good diagram and shows the error", async ({ page }) => {
    await cursorAfter(page, "B[Save]");
    await page.keyboard.type(" -->");
    await expect(page.locator(".cm-md-mermaid-error")).toBeVisible();
    await expect(page.locator(".cm-md-mermaid.is-editing svg")).toBeVisible();
  });
});

test.describe("keyboard shortcuts", () => {
  test("formatting", async ({ page }) => {
    await page.keyboard.press("Enter");
    await page.keyboard.type("Heading");
    await page.keyboard.press("ControlOrMeta+2");
    expect(await docText(page)).toContain("\n## Heading");

    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("word ");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.type("strong");
    await page.keyboard.press("ControlOrMeta+Enter");
    expect(await docText(page)).toContain("\n- [ ] word **strong**");
  });

  test("Ctrl+/ toggles source mode", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+/");
    await expect(page.locator("body")).toHaveClass(/source-mode/);
    expect(await lineText(page, "Some")).toContain("**bold**");
    await page.keyboard.press("ControlOrMeta+/");
    expect(await lineText(page, "Some")).not.toContain("**bold**");
  });
});
