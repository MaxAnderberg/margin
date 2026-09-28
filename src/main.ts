import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, Text } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder, rectangularSelection } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

import { insertFence, insertLink, setHeading, toggleInline, toggleTask } from "./editor/commands";
import { colorTheme, docPath } from "./editor/context";
import { headingLines, livePreview } from "./editor/livePreview";
import { editorTheme, markdownHighlight } from "./editor/theme";

const appWindow = getCurrentWindow();
const statusEl = document.getElementById("status")!;
const toastEl = document.getElementById("toast")!;

// ---------------------------------------------------------------- settings

type ThemePref = "system" | "light" | "dark";

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`margin.${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(`margin.${key}`);
      else localStorage.setItem(`margin.${key}`, value);
    } catch {
      /* storage unavailable */
    }
  },
};

let themePref = (store.get("theme") as ThemePref) ?? "system";
let fontScale = Number(store.get("fontScale")) || 1;
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function effectiveTheme(): "light" | "dark" {
  if (themePref === "system") return systemDark.matches ? "dark" : "light";
  return themePref;
}

// ---------------------------------------------------------------- document state

let currentPath: string | null = null;
let savedDoc: Text = Text.empty;
let dirty = false;

const previewMode = new Compartment();
const pathConfig = new Compartment();
const themeConfig = new Compartment();
let sourceMode = false;

function fileName(path: string | null) {
  return path ? path.slice(path.lastIndexOf("/") + 1) : "Untitled";
}

function updateTitle() {
  const title = `${fileName(currentPath)}${dirty ? " •" : ""} — Margin`;
  document.title = title;
  appWindow.setTitle(title).catch(() => {});
}

let countTimer: number | undefined;
function updateStatus() {
  clearTimeout(countTimer);
  countTimer = window.setTimeout(() => {
    const text = view.state.doc.toString();
    const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
    const minutes = Math.max(1, Math.round(words / 230));
    const parts = [`${words.toLocaleString()} ${words === 1 ? "word" : "words"}`];
    if (words > 0) parts.push(`${minutes} min read`);
    if (sourceMode) parts.push("source");
    statusEl.textContent = parts.join("  ·  ");
  }, 150);
}

let toastTimer: number | undefined;
function toast(message: string, kind: "info" | "error" = "info") {
  toastEl.textContent = message;
  toastEl.dataset.kind = kind;
  toastEl.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("is-visible"), kind === "error" ? 5000 : 1600);
}

// ---------------------------------------------------------------- file operations

const MD_FILTER = [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "txt"] }];

async function confirmDiscard(): Promise<boolean> {
  if (!dirty) return true;
  return ask(`“${fileName(currentPath)}” has unsaved changes. Discard them?`, {
    title: "Unsaved changes",
    kind: "warning",
    okLabel: "Discard",
    cancelLabel: "Keep editing",
  });
}

function loadDocument(text: string, path: string | null) {
  currentPath = path;
  store.set("lastFile", path);
  view.setState(createState(text, path));
  savedDoc = view.state.doc;
  dirty = false;
  updateTitle();
  updateStatus();
  view.focus();
}

async function openPath(path: string) {
  try {
    const text = await invoke<string>("read_file", { path });
    loadDocument(text, path);
  } catch (err) {
    toast(String(err), "error");
  }
}

async function openFile() {
  if (!(await confirmDiscard())) return;
  const path = await openDialog({ multiple: false, directory: false, filters: MD_FILTER });
  if (typeof path === "string") await openPath(path);
}

async function newFile() {
  if (!(await confirmDiscard())) return;
  loadDocument("", null);
}

async function saveFile(saveAs = false): Promise<boolean> {
  let path = currentPath;
  if (!path || saveAs) {
    const chosen = await saveDialog({
      filters: MD_FILTER,
      defaultPath: currentPath ?? "Untitled.md",
    });
    if (!chosen) return false;
    path = /\.[^/]+$/.test(chosen) ? chosen : `${chosen}.md`;
  }
  const doc = view.state.doc;
  try {
    await invoke("write_file", { path, contents: doc.toString() });
  } catch (err) {
    toast(String(err), "error");
    return false;
  }
  const pathChanged = path !== currentPath;
  currentPath = path;
  store.set("lastFile", path);
  savedDoc = doc;
  dirty = !view.state.doc.eq(savedDoc);
  if (pathChanged) view.dispatch({ effects: pathConfig.reconfigure(docPath.of(path)) });
  updateTitle();
  toast("Saved");
  return true;
}

// ---------------------------------------------------------------- view toggles

function applyTheme() {
  const theme = effectiveTheme();
  document.documentElement.dataset.theme = theme;
  if (view) view.dispatch({ effects: themeConfig.reconfigure(colorTheme.of(theme)) });
}

function cycleTheme() {
  themePref = themePref === "system" ? "light" : themePref === "light" ? "dark" : "system";
  store.set("theme", themePref);
  applyTheme();
  toast(`Theme: ${themePref}`);
}

function applyFontScale() {
  document.documentElement.style.setProperty("--font-scale", String(fontScale));
  store.set("fontScale", String(fontScale));
  view?.requestMeasure();
}

function zoom(delta: number) {
  fontScale = delta === 0 ? 1 : Math.min(1.8, Math.max(0.7, Math.round((fontScale + delta) * 100) / 100));
  applyFontScale();
  toast(`${Math.round(fontScale * 100)}%`);
}

function toggleSourceMode() {
  sourceMode = !sourceMode;
  document.body.classList.toggle("source-mode", sourceMode);
  view.dispatch({ effects: previewMode.reconfigure(sourceMode ? headingLines : livePreview) });
  updateStatus();
}

async function toggleFullscreen() {
  await appWindow.setFullscreen(!(await appWindow.isFullscreen()));
}

// ---------------------------------------------------------------- editor

const run = (fn: () => unknown) => () => {
  fn();
  return true;
};

const appKeymap = keymap.of([
  { key: "Mod-n", run: run(newFile) },
  { key: "Mod-o", run: run(openFile) },
  { key: "Mod-s", run: run(() => saveFile(false)) },
  { key: "Mod-Shift-s", run: run(() => saveFile(true)) },
  { key: "Mod-b", run: toggleInline("**") },
  { key: "Mod-i", run: toggleInline("*") },
  { key: "Mod-e", run: toggleInline("`") },
  { key: "Mod-Shift-x", run: toggleInline("~~") },
  { key: "Mod-k", run: insertLink },
  { key: "Mod-Enter", run: toggleTask },
  { key: "Mod-Shift-k", run: insertFence("") },
  { key: "Mod-Shift-m", run: insertFence("mermaid", "flowchart LR\n  A[Idea] --> B[Draft] --> C[Done]") },
  ...[0, 1, 2, 3, 4, 5, 6].map((level) => ({ key: `Mod-${level}`, run: setHeading(level) })),
  { key: "Mod-/", run: run(toggleSourceMode) },
  { key: "Mod-Shift-l", run: run(cycleTheme) },
  { key: "Mod-=", run: run(() => zoom(0.1)) },
  { key: "Mod-+", run: run(() => zoom(0.1)) },
  { key: "Mod--", run: run(() => zoom(-0.1)) },
  { key: "Mod-Shift-0", run: run(() => zoom(0)) },
  { key: "F11", run: run(toggleFullscreen) },
]);

// Ctrl/Cmd-click a link to open it.
const linkClicks = EditorView.domEventHandlers({
  mousedown(event) {
    if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false;
    const link = (event.target as HTMLElement).closest<HTMLElement>("[data-href]");
    const href = link?.dataset.href;
    if (!href) return false;
    event.preventDefault();
    openLink(href);
    return true;
  },
});

async function openLink(href: string) {
  if (/^(https?:|mailto:)/i.test(href)) {
    openUrl(href).catch((err) => toast(String(err), "error"));
  } else if (/\.(md|markdown)(#.*)?$/i.test(href) && currentPath) {
    const dir = currentPath.slice(0, currentPath.lastIndexOf("/") + 1);
    const target = decodeURIComponent(new URL(href.replace(/#.*$/, ""), "file://" + dir).pathname);
    if (await confirmDiscard()) await openPath(target);
  }
}

const trackChanges = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return;
  const nowDirty = !update.state.doc.eq(savedDoc);
  if (nowDirty !== dirty) {
    dirty = nowDirty;
    updateTitle();
  }
  updateStatus();
});

function createState(text: string, path: string | null) {
  return EditorState.create({
    doc: text,
    extensions: [
      history(),
      drawSelection(),
      rectangularSelection(),
      EditorView.lineWrapping,
      EditorState.allowMultipleSelections.of(true),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(markdownHighlight),
      search({ top: true }),
      highlightSelectionMatches(),
      placeholder("Start writing…"),
      appKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      previewMode.of(sourceMode ? headingLines : livePreview),
      pathConfig.of(docPath.of(path)),
      themeConfig.of(colorTheme.of(effectiveTheme())),
      editorTheme,
      linkClicks,
      trackChanges,
      EditorView.contentAttributes.of({ spellcheck: "true", autocorrect: "off", autocapitalize: "off" }),
    ],
  });
}

const view = new EditorView({
  parent: document.getElementById("editor")!,
  state: createState("", null),
});

// ---------------------------------------------------------------- startup

// Links become clickable-looking while Ctrl/Cmd is held.
const setCtrlHeld = (e: KeyboardEvent | MouseEvent) => document.body.classList.toggle("ctrl-held", e.ctrlKey || e.metaKey);
window.addEventListener("keydown", setCtrlHeld);
window.addEventListener("keyup", setCtrlHeld);
window.addEventListener("blur", () => document.body.classList.remove("ctrl-held"));

applyTheme();
applyFontScale();
systemDark.addEventListener("change", () => themePref === "system" && applyTheme());

appWindow.onCloseRequested(async (event) => {
  if (!(await confirmDiscard())) event.preventDefault();
});

// Drop a Markdown file onto the window to open it.
getCurrentWebview().onDragDropEvent(async (event) => {
  if (event.payload.type !== "drop") return;
  const path = event.payload.paths.find((p) => /\.(md|markdown|mdown|mkd|txt)$/i.test(p));
  if (path && (await confirmDiscard())) await openPath(path);
});

(async () => {
  const launch = await invoke<string | null>("launch_file");
  const last = store.get("lastFile");
  if (launch) await openPath(launch);
  else if (last && (await invoke<boolean>("file_exists", { path: last }))) await openPath(last);
  else loadDocument("", null);
})();
