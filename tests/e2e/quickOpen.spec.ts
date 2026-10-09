import type { Page } from "@playwright/test";
import { cursorAfter, diskText, docText, expect, openMargin, test } from "./fixtures";

const file = (text = "") => ({ text, mtime: 1 });

const CURRENT = "/notes/a.md";
const folder = () => ({
  [CURRENT]: file("# A\n\nStart."),
  "/notes/b.md": file("# B"),
  "/notes/ideas/c.md": file("# C"),
  "/notes/todo/quick-open.md": file("# Quick open"),
  "/notes/photo.png": file(),
  "/notes/script.js": file(),
  "/notes/.git/notes.md": file(),
  "/notes/node_modules/pkg/README.md": file(),
  "/elsewhere/far.md": file("# Far"),
});

const palette = (page: Page) => page.locator(".quick-open");
const names = (page: Page) => page.locator(".quick-open .quick-open-name").allInnerTexts();
const message = (page: Page) => page.locator(".quick-open .palette-message");

/** Opens quick open and waits for the folder listing to arrive. */
async function quickOpen(page: Page) {
  await page.keyboard.press("ControlOrMeta+P");
  await expect(palette(page)).toBeVisible();
  await expect(message(page)).not.toHaveText("Looking for files…");
}

const recentFiles = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("margin.recentFiles") ?? "[]") as string[]);

test.describe("opening the palette", () => {
  test("Ctrl+P opens it with an empty, focused filter", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await quickOpen(page);
    await expect(palette(page).locator(".palette-input")).toBeFocused();
    await expect(palette(page).locator(".palette-input")).toHaveValue("");
  });

  test("works in source mode", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await cursorAfter(page, "Start.");
    await page.keyboard.press("ControlOrMeta+/");
    await expect(page.locator("body")).toHaveClass(/source-mode/);
    await quickOpen(page);
  });

  test("Ctrl+P again does not open a second palette", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await quickOpen(page);
    await page.keyboard.press("ControlOrMeta+P");
    await expect(page.locator(".palette")).toHaveCount(1);
  });

  test("Ctrl+P is kept from the browser's print shortcut, even outside the editor", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    const prevented = await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      const event = new KeyboardEvent("keydown", { key: "p", ctrlKey: true, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);
  });
});

test.describe("files listed", () => {
  test("lists Markdown files in the folder and subfolders, but not the open file", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await quickOpen(page);
    expect(await names(page)).toEqual(["b.md", "c.md", "quick-open.md"]);
    await expect(palette(page).locator(".palette-item", { hasText: "c.md" })).toContainText("ideas");
  });

  test("leaves out other files, hidden folders and node_modules", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await quickOpen(page);
    const listed = await names(page);
    for (const name of ["photo.png", "script.js", "notes.md", "README.md", "a.md"]) expect(listed).not.toContain(name);
  });

  test("lists recent files first, most recent first, each file once", async ({ page }) => {
    await openMargin(page, {
      launch: CURRENT,
      files: folder(),
      home: "/home/max",
      recent: ["/notes/todo/quick-open.md", "/elsewhere/far.md", CURRENT],
    });
    await quickOpen(page);
    expect(await names(page)).toEqual(["quick-open.md", "far.md", "b.md", "c.md"]);
    await expect(palette(page).locator(".palette-item", { hasText: "far.md" })).toContainText("/elsewhere");
  });

  test("shortens the home folder to ~ for files elsewhere", async ({ page }) => {
    const files = { ...folder(), "/home/max/work/plan.md": file() };
    await openMargin(page, { launch: CURRENT, files, home: "/home/max", recent: ["/home/max/work/plan.md"] });
    await quickOpen(page);
    await expect(palette(page).locator(".palette-item").first()).toHaveText(/plan\.md\s*~\/work/);
  });

  test("an untitled document lists only recent files", async ({ page }) => {
    await openMargin(page, { files: folder(), recent: ["/notes/b.md"] });
    await quickOpen(page);
    expect(await names(page)).toEqual(["b.md"]);
  });

  test("says so when there is nothing to open", async ({ page }) => {
    await openMargin(page, { launch: "/solo/a.md", files: { "/solo/a.md": file() } });
    await quickOpen(page);
    await expect(message(page)).toHaveText("No files to open");
    await expect(palette(page).locator(".palette-item")).toHaveCount(0);
  });

  test("says so when a huge folder is only partly listed", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder(), quickOpenLimit: 3 }); // a.md (open, so hidden), b.md, c.md
    await quickOpen(page);
    await expect(palette(page).locator(".palette-item")).toHaveCount(2);
    await expect(message(page)).toHaveText("Not all files in this folder are listed");
  });
});

test.describe("filtering", () => {
  test("typing narrows the list fuzzily and highlights the match", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await quickOpen(page);
    await page.keyboard.type("qkop");
    expect(await names(page)).toEqual(["quick-open.md"]);
    await expect(palette(page).locator(".palette-match").first()).toHaveText("q");
  });

  test("space-separated parts each match", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await quickOpen(page);
    await page.keyboard.type("ideas c");
    expect(await names(page)).toEqual(["c.md"]);
  });

  test("no matches: says so, and Enter keeps the palette open", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await quickOpen(page);
    await page.keyboard.type("zzz");
    await expect(message(page)).toHaveText("No matching files");
    await page.keyboard.press("Enter");
    await expect(palette(page)).toBeVisible();
    expect(await docText(page)).toBe("# A\n\nStart.");
  });
});

test.describe("keyboard and mouse", () => {
  test("arrows move the selection and Enter opens the file", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await quickOpen(page);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(palette(page)).toHaveCount(0);
    await expect(page).toHaveTitle("quick-open.md — Margin");
    expect(await docText(page)).toBe("# Quick open");
  });

  test("selection wraps around at the ends", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await quickOpen(page);
    await page.keyboard.press("ArrowUp");
    await expect(palette(page).locator(".palette-item.is-active")).toContainText("quick-open.md");
    await page.keyboard.press("ArrowDown");
    await expect(palette(page).locator(".palette-item.is-active")).toContainText("b.md");
  });

  test("clicking an entry opens it", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await quickOpen(page);
    await palette(page).locator(".palette-item", { hasText: "c.md" }).click();
    await expect(page).toHaveTitle("c.md — Margin");
  });

  test("Escape closes it and returns to the same spot in the editor", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await cursorAfter(page, "Sta");
    await quickOpen(page);
    await page.keyboard.press("Escape");
    await expect(palette(page)).toHaveCount(0);
    await expect(page).toHaveTitle("a.md — Margin");
    await page.keyboard.type("X");
    expect(await docText(page)).toBe("# A\n\nStaXrt.");
  });

  test("clicking outside closes it", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await quickOpen(page);
    await page.mouse.click(10, 800);
    await expect(palette(page)).toHaveCount(0);
    await expect(page).toHaveTitle("a.md — Margin");
  });
});

test.describe("opening a file", () => {
  test("saves pending edits to the current file first", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await cursorAfter(page, "Start.");
    await page.keyboard.type(" Edited.");
    await quickOpen(page);
    await page.keyboard.type("b.md");
    await page.keyboard.press("Enter");
    await expect(page).toHaveTitle("b.md — Margin");
    expect(await diskText(page, CURRENT)).toBe("# A\n\nStart. Edited.");
  });

  test("an untitled draft stays when the user keeps editing", async ({ page }) => {
    await openMargin(page, { files: folder(), recent: ["/notes/b.md"], dialogAnswer: false });
    await page.locator(".cm-content").click();
    await page.keyboard.type("Draft text");
    await quickOpen(page);
    await page.keyboard.press("Enter");
    await expect(palette(page)).toHaveCount(0);
    expect(await docText(page)).toBe("Draft text");
    await expect(page).toHaveTitle(/Untitled/);
  });

  test("a file deleted after listing shows an error and leaves recents", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder(), recent: ["/notes/b.md"] });
    await quickOpen(page);
    await page.evaluate(() => delete window.__disk["/notes/b.md"]);
    await page.keyboard.press("Enter");
    await expect(page.locator("#toast")).toHaveText("“b.md” no longer exists");
    await expect(page).toHaveTitle("a.md — Margin");
    expect(await docText(page)).toBe("# A\n\nStart.");
    expect(await recentFiles(page)).not.toContain("/notes/b.md");
    expect(await diskText(page, "/notes/b.md")).toBeUndefined();
  });
});

test.describe("recent files history", () => {
  test("is remembered across restarts", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder() });
    await quickOpen(page);
    await page.keyboard.type("quick");
    await page.keyboard.press("Enter");
    await expect(page).toHaveTitle("quick-open.md — Margin");
    await page.reload(); // starts again with a.md from the command line
    await expect(page).toHaveTitle("a.md — Margin");
    await quickOpen(page);
    expect((await names(page))[0]).toBe("quick-open.md");
  });

  test("save as adds the new file", async ({ page }) => {
    await openMargin(page, { files: folder(), savePath: "/notes/new.md" });
    await page.locator(".cm-content").click();
    await page.keyboard.type("Fresh");
    await page.keyboard.press("ControlOrMeta+Shift+S");
    await expect(page).toHaveTitle("new.md — Margin");
    await page.keyboard.press("ControlOrMeta+N");
    await quickOpen(page);
    expect(await names(page)).toEqual(["new.md"]);
  });

  test("deleted files are not shown", async ({ page }) => {
    await openMargin(page, { launch: CURRENT, files: folder(), recent: ["/gone/old.md", "/elsewhere/far.md"] });
    await quickOpen(page);
    const listed = await names(page);
    expect(listed).toContain("far.md");
    expect(listed).not.toContain("old.md");
  });

  test("keeps the 50 most recent files", async ({ page }) => {
    const many = Array.from({ length: 50 }, (_, i) => `/old/${i}.md`);
    await openMargin(page, { launch: CURRENT, files: folder(), recent: many });
    const recent = await recentFiles(page);
    expect(recent).toHaveLength(50);
    expect(recent[0]).toBe(CURRENT);
    expect(recent).not.toContain("/old/49.md");
  });
});
