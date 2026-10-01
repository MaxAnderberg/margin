import { cursorAfter, diskText, docText, expect, openMargin, test, writes } from "./fixtures";

const FILE = "/notes/a.md";
const disk = () => ({ [FILE]: { text: "# Hello\n\nStart.", mtime: 1 } });

/** Changes the file on the simulated disk, as another program would. */
const editElsewhere = (page: import("@playwright/test").Page, text: string) =>
  page.evaluate(
    ({ path, text }) => {
      window.__disk[path] = { text, mtime: 2 };
    },
    { path: FILE, text },
  );

test.describe("autosave", () => {
  test("saves about a second after typing stops", async ({ page }) => {
    await openMargin(page, { launch: FILE, files: disk() });
    await cursorAfter(page, "Start.");
    await page.keyboard.type(" More.");
    expect(await writes(page)).toBe(0);
    await expect(page).toHaveTitle(/a\.md •/);
    await expect.poll(() => diskText(page, FILE)).toBe("# Hello\n\nStart. More.");
    await expect(page).toHaveTitle("a.md — Margin");
  });

  test("keeps saving: each save expects the file as it last wrote it", async ({ page }) => {
    await openMargin(page, { launch: FILE, files: disk() });
    await cursorAfter(page, "Start.");
    await page.keyboard.type(" One.");
    await expect.poll(() => diskText(page, FILE)).toContain("One.");
    await page.keyboard.type(" Two.");
    await expect.poll(() => diskText(page, FILE)).toBe("# Hello\n\nStart. One. Two.");
  });

  test("saves when the window loses focus", async ({ page }) => {
    await openMargin(page, { launch: FILE, files: disk() });
    await cursorAfter(page, "Start.");
    await page.keyboard.type("!");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect.poll(() => diskText(page, FILE), { timeout: 500 }).toBe("# Hello\n\nStart.!");
  });
});

test.describe("changes made by other programs", () => {
  test("reload quietly when you have no unsaved edits", async ({ page }) => {
    await openMargin(page, { launch: FILE, files: disk() });
    await editElsewhere(page, "# Changed elsewhere");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => docText(page)).toBe("# Changed elsewhere");
    expect(await writes(page)).toBe(0);
  });

  test("never overwrite them silently: 'Load from disk' is undoable", async ({ page }) => {
    await openMargin(page, { launch: FILE, files: disk(), dialogAnswer: false });
    await cursorAfter(page, "Start.");
    await page.keyboard.type(" Mine.");
    await editElsewhere(page, "Theirs.");
    await expect.poll(() => docText(page)).toBe("Theirs.");
    expect(await diskText(page, FILE)).toBe("Theirs.");
    await page.keyboard.press("ControlOrMeta+z");
    expect(await docText(page)).toBe("# Hello\n\nStart. Mine.");
  });

  test("'Keep mine' overwrites the file", async ({ page }) => {
    await openMargin(page, { launch: FILE, files: disk(), dialogAnswer: true });
    await cursorAfter(page, "Start.");
    await page.keyboard.type(" Mine.");
    await editElsewhere(page, "Theirs.");
    await expect.poll(() => diskText(page, FILE)).toBe("# Hello\n\nStart. Mine.");
  });
});

test.describe("untitled documents", () => {
  test("are kept as a draft and restored after a restart", async ({ page }) => {
    await openMargin(page);
    await page.locator(".cm-content").click();
    await page.keyboard.type("An untitled thought");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("margin.draft"))).toBe("An untitled thought");
    await page.reload();
    await expect.poll(() => docText(page)).toBe("An untitled thought");
    await expect(page).toHaveTitle("Untitled • — Margin");
  });
});

test.describe("startup", () => {
  test("reopens the last file", async ({ page }) => {
    await openMargin(page, { launch: FILE, files: disk() });
    // Restart without a command-line file: the last file comes back.
    await page.addInitScript(() => {
      const original = (window as any).__TAURI_INTERNALS__.invoke;
      (window as any).__TAURI_INTERNALS__.invoke = (cmd: string, args: unknown) =>
        cmd === "launch_file" ? Promise.resolve(null) : original(cmd, args);
    });
    await page.reload();
    await expect.poll(() => docText(page)).toBe("# Hello\n\nStart.");
  });
});
