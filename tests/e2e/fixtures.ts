import { expect, test as base, type Page } from "@playwright/test";

// The browser tests run the real front end (Vite dev server) without the Rust
// backend. This stands in for Tauri: commands are answered from a simulated
// disk kept in sessionStorage, so it survives reloads ("restarts").

export interface DiskFile {
  text: string;
  mtime: number;
}

export interface MarginOptions {
  /** Files on the simulated disk. */
  files?: Record<string, DiskFile>;
  /** The file passed on the command line, if any. */
  launch?: string | null;
  /** Saved theme preference (localStorage). */
  theme?: string;
  /** How dialogs are answered: true clicks the OK button, false Cancel. */
  dialogAnswer?: boolean;
}

declare global {
  interface Window {
    __disk: Record<string, DiskFile>;
    __calls: { cmd: string; args: any }[];
    __dialogAnswer: boolean;
  }
}

export async function openMargin(page: Page, options: MarginOptions = {}) {
  const { files = {}, launch = null, theme, dialogAnswer = false } = options;
  await page.addInitScript(
    ({ files, launch, theme, dialogAnswer }) => {
      if (!sessionStorage.getItem("test:init")) {
        sessionStorage.setItem("test:init", "1");
        sessionStorage.setItem("test:disk", JSON.stringify(files));
        if (theme) localStorage.setItem("margin.theme", theme);
      }
      window.__disk = JSON.parse(sessionStorage.getItem("test:disk")!);
      window.__calls = [];
      window.__dialogAnswer = dialogAnswer;
      const persist = () => sessionStorage.setItem("test:disk", JSON.stringify(window.__disk));
      let clock = 10_000;
      let callbackId = 0;

      (window as any).__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
        transformCallback: () => ++callbackId,
        unregisterCallback: () => {},
        convertFileSrc: (path: string) => path,
        invoke: async (cmd: string, args: any) => {
          window.__calls.push({ cmd, args });
          const file = window.__disk[args?.path];
          switch (cmd) {
            case "launch_file":
              return launch;
            case "file_exists":
              return !!file;
            case "read_file":
              return file ? { text: file.text, mtime: file.mtime } : { text: "", mtime: null };
            case "file_mtime":
              return file ? file.mtime : null;
            case "write_file":
              if (!args.force && file && file.mtime !== args.expectedMtime) throw { kind: "conflict" };
              window.__disk[args.path] = { text: args.contents, mtime: ++clock };
              persist();
              return clock;
            case "plugin:dialog|message": {
              // ask() passes { OkCancelCustom: [ok, cancel] } and compares the result to ok.
              const [ok, cancel] = args.buttons?.OkCancelCustom ?? ["Ok", "Cancel"];
              return window.__dialogAnswer ? ok : cancel;
            }
            default:
              return null;
          }
        },
      };
      (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    },
    { files, launch, theme, dialogAnswer },
  );
  await page.goto("/");
  await expect(page.locator(".cm-content")).toBeVisible();
  await page.waitForFunction(() => window.__calls.some((c) => c.cmd === "launch_file"));
  await page.waitForTimeout(200);
}

/** The document text, read from the editor. */
export const docText = (page: Page) => page.evaluate(() => (window as any).__marginView.state.doc.toString() as string);

/** Places the cursor right after the first occurrence of `text`. */
export async function cursorAfter(page: Page, text: string) {
  await page.evaluate((text) => {
    const view = (window as any).__marginView;
    const pos = view.state.doc.toString().indexOf(text);
    if (pos < 0) throw new Error(`"${text}" not in document`);
    view.dispatch({ selection: { anchor: pos + text.length } });
    view.focus();
  }, text);
}

/** Text of the rendered line containing `fragment` (what the user sees). */
export const lineText = (page: Page, fragment: string) =>
  page.locator(".cm-line", { hasText: fragment }).first().innerText();

export const diskText = (page: Page, path: string) => page.evaluate((path) => window.__disk[path]?.text, path);

export const writes = (page: Page) => page.evaluate(() => window.__calls.filter((c) => c.cmd === "write_file").length);

// Shortcuts use Playwright's "ControlOrMeta": Ctrl, or Cmd on macOS, like Margin's "Mod".

export const test = base;
export { expect };
