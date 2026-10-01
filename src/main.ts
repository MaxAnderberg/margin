import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { LanguageDescription, syntaxHighlighting } from "@codemirror/language";
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
import { enterBlockKeymap, headingLines, livePreview } from "./editor/livePreview";
import { mermaidLanguage } from "./editor/mermaidLanguage";
import { editorTheme, markdownHighlight } from "./editor/theme";
import { baseName, resolveRelative } from "./paths";
import { openThemePicker } from "./themePicker";
import { AUTO, applyThemeVars, resolveTheme } from "./themes";

const appWindow = getCurrentWindow();
const statusEl = document.getElementById("status")!;
const toastEl = document.getElementById("toast")!;

// ---------------------------------------------------------------- settings

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

// Older versions stored "system" | "light" | "dark".
const LEGACY_THEMES: Record<string, string> = { system: AUTO, light: "margin-light", dark: "margin-dark" };
let themePref = store.get("theme") ?? AUTO;
themePref = LEGACY_THEMES[themePref] ?? themePref;
let fontScale = Number(store.get("fontScale")) || 1;
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

const effectiveTheme = (pref = themePref) => resolveTheme(pref, systemDark.matches);

// ---------------------------------------------------------------- document state

let currentPath: string | null = null;
let savedDoc: Text = Text.empty;
/** The file's modification time when we last read or wrote it. */
let diskMtime: number | null = null;
let dirty = false;

const previewMode = new Compartment();
const pathConfig = new Compartment();
const themeConfig = new Compartment();
let sourceMode = false;

function fileName(path: string | null) {
  return path ? baseName(path) : "Untitled";
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
function toast(message: string, kind: "info" | "error" = "info", ms?: number) {
  toastEl.textContent = message;
  toastEl.dataset.kind = kind;
  toastEl.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => toastEl.classList.remove("is-visible"),
    ms ?? (kind === "error" ? 5000 : 1600),
  );
}

// ---------------------------------------------------------------- file operations
//
// Documents with a path autosave shortly after typing stops (and when the
// window loses focus). Untitled documents are kept as a recovery draft that
// is restored on the next launch. Before every write we check that nobody
// else changed the file since we last saw it, so autosave never silently
// overwrites edits made in another program.

const MD_FILTER = [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "txt"] }];
const AUTOSAVE_DELAY = 1000;
const DRAFT_DELAY = 400;

interface FileContents {
  text: string;
  mtime: number | null;
}
type SaveError = { kind: "conflict" } | { kind: "io"; message: string };

let autosaveTimer: number | undefined;
let draftTimer: number | undefined;
let conflictOpen = false;
let reloading = false;
let writesInFlight = 0;
let saveChain: Promise<boolean> = Promise.resolve(true);

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  if (currentPath && !conflictOpen) autosaveTimer = window.setTimeout(() => persist(), AUTOSAVE_DELAY);
}

function saveDraftNow() {
  clearTimeout(draftTimer);
  if (currentPath) return;
  const text = view.state.doc.toString();
  store.set("draft", text.trim() ? text : null);
}

function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = window.setTimeout(saveDraftNow, DRAFT_DELAY);
}

/** Saves the current document. Saves run one at a time, in order. */
function persist(opts: { path?: string; force?: boolean } = {}): Promise<boolean> {
  clearTimeout(autosaveTimer);
  const job = () => writeNow(opts.path ?? currentPath, opts.force ?? false);
  saveChain = saveChain.then(job, job);
  return saveChain;
}

async function writeNow(path: string | null, force: boolean): Promise<boolean> {
  if (!path) return false;
  const samePath = path === currentPath;
  const doc = view.state.doc;
  if (samePath && !force && doc.eq(savedDoc)) return true;
  writesInFlight++;
  try {
    const mtime = await invoke<number>("write_file", {
      path,
      contents: doc.toString(),
      expectedMtime: samePath ? diskMtime : null,
      force: force || !samePath,
    });
    if (!samePath) {
      if (!currentPath) store.set("draft", null);
      currentPath = path;
      store.set("lastFile", path);
      view.dispatch({ effects: pathConfig.reconfigure(docPath.of(path)) });
    }
    diskMtime = mtime;
    savedDoc = doc;
    dirty = !view.state.doc.eq(savedDoc);
    updateTitle();
    return true;
  } catch (err) {
    const e = err as SaveError;
    if (e?.kind === "conflict") return resolveConflict(path);
    toast(e?.kind === "io" ? e.message : String(err), "error");
    return false;
  } finally {
    writesInFlight--;
  }
}

/** The file changed on disk while we had unsaved edits: let the user choose. */
async function resolveConflict(path: string): Promise<boolean> {
  if (conflictOpen) return false;
  conflictOpen = true;
  clearTimeout(autosaveTimer);
  try {
    const keepMine = await ask(
      `“${fileName(path)}” was changed by another program while you were editing it.\n\n` +
        `Keep your version (overwriting the file), or load the version on disk?`,
      { title: "File changed on disk", kind: "warning", okLabel: "Keep mine", cancelLabel: "Load from disk" },
    );
    if (keepMine) return await writeNow(path, true);
    const file = await invoke<FileContents>("read_file", { path });
    replaceFromDisk(file);
    toast("Loaded the version on disk. Press Ctrl+Z to get yours back.", "info", 5000);
    return true;
  } finally {
    conflictOpen = false;
  }
}

/** Swaps in text from disk as an undoable edit, keeping the cursor roughly in place. */
function replaceFromDisk(file: FileContents) {
  clearTimeout(autosaveTimer);
  const head = Math.min(view.state.selection.main.head, file.text.length);
  reloading = true;
  try {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: file.text },
      selection: { anchor: head },
      userEvent: "reload",
    });
  } finally {
    reloading = false;
  }
  savedDoc = view.state.doc;
  diskMtime = file.mtime;
  dirty = false;
  updateTitle();
}

/** Called when the window regains focus: pick up changes made elsewhere. */
async function checkDisk() {
  const path = currentPath;
  // A write of our own in progress would look like an outside change.
  if (!path || conflictOpen || writesInFlight > 0) return;
  const mtime = await invoke<number | null>("file_mtime", { path });
  if (mtime === null || mtime === diskMtime || path !== currentPath) return;
  if (dirty) {
    await persist(); // detects the conflict and asks
  } else {
    replaceFromDisk(await invoke<FileContents>("read_file", { path }));
    toast("Reloaded: the file changed on disk");
  }
}

/** Before switching documents: save a file, or confirm discarding an untitled draft. */
async function readyToLeave(): Promise<boolean> {
  if (!dirty) return true;
  if (currentPath) return persist();
  const discard = await ask("This untitled document has not been saved. Discard it?", {
    title: "Unsaved document",
    kind: "warning",
    okLabel: "Discard",
    cancelLabel: "Keep editing",
  });
  if (discard) store.set("draft", null);
  return discard;
}

function loadDocument(text: string, path: string | null, mtime: number | null = null) {
  clearTimeout(autosaveTimer);
  clearTimeout(draftTimer);
  currentPath = path;
  diskMtime = mtime;
  if (path) store.set("lastFile", path);
  view.setState(createState(text, path));
  savedDoc = view.state.doc;
  dirty = false;
  updateTitle();
  updateStatus();
  view.focus();
}

async function openPath(path: string) {
  try {
    const file = await invoke<FileContents>("read_file", { path });
    loadDocument(file.text, path, file.mtime);
  } catch (err) {
    toast(String(err), "error");
  }
}

async function openFile() {
  if (!(await readyToLeave())) return;
  const path = await openDialog({ multiple: false, directory: false, filters: MD_FILTER });
  if (typeof path === "string") await openPath(path);
}

async function newFile() {
  if (!(await readyToLeave())) return;
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
  const ok = await persist({ path });
  if (ok && !dirty) toast("Saved");
  return ok;
}

// ---------------------------------------------------------------- view toggles

function applyTheme(pref = themePref) {
  const theme = effectiveTheme(pref);
  applyThemeVars(theme);
  if (view) view.dispatch({ effects: themeConfig.reconfigure(colorTheme.of(theme.id)) });
}

function chooseTheme() {
  openThemePicker({
    current: themePref,
    preview: (id) => applyTheme(id),
    commit: (id) => {
      themePref = id;
      store.set("theme", id);
      applyTheme();
    },
    onClose: () => view.focus(),
  });
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
  ...enterBlockKeymap,
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
  { key: "Mod-Shift-l", run: run(chooseTheme) },
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
    const target = resolveRelative(currentPath, href.replace(/#.*$/, ""));
    if (await readyToLeave()) await openPath(target);
  }
}

const trackChanges = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return;
  updateStatus();
  if (reloading) return;
  const nowDirty = !update.state.doc.eq(savedDoc);
  if (nowDirty !== dirty) {
    dirty = nowDirty;
    updateTitle();
  }
  if (currentPath) scheduleAutosave();
  else scheduleDraft();
});

function codeLanguages(info: string) {
  if (/^mermaid$/i.test(info.trim())) return mermaidLanguage;
  return LanguageDescription.matchLanguageName(languages, info, true);
}

function createState(text: string, path: string | null) {
  return EditorState.create({
    doc: text,
    extensions: [
      history(),
      drawSelection(),
      rectangularSelection(),
      EditorView.lineWrapping,
      EditorState.allowMultipleSelections.of(true),
      markdown({ base: markdownLanguage, codeLanguages }),
      syntaxHighlighting(markdownHighlight),
      search({ top: true }),
      highlightSelectionMatches(),
      placeholder("Start writing…"),
      appKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      previewMode.of(sourceMode ? headingLines : livePreview),
      pathConfig.of(docPath.of(path)),
      themeConfig.of(colorTheme.of(effectiveTheme().id)),
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

// Lets the browser tests (tests/e2e) read the editor. Not in release builds.
if (import.meta.env.DEV) (window as unknown as { __marginView: EditorView }).__marginView = view;

// ---------------------------------------------------------------- startup

// Links become clickable-looking while Ctrl/Cmd is held.
const setCtrlHeld = (e: KeyboardEvent | MouseEvent) => document.body.classList.toggle("ctrl-held", e.ctrlKey || e.metaKey);
window.addEventListener("keydown", setCtrlHeld);
window.addEventListener("keyup", setCtrlHeld);
window.addEventListener("blur", () => document.body.classList.remove("ctrl-held"));

applyTheme();
applyFontScale();
systemDark.addEventListener("change", () => themePref === AUTO && applyTheme());

// Save on the way out. Untitled text is kept as a draft for next launch.
appWindow.onCloseRequested(async (event) => {
  if (!currentPath) return saveDraftNow();
  if (!dirty || (await persist())) return;
  const close = await ask("Margin could not save your changes. Close anyway and lose them?", {
    title: "Unsaved changes",
    kind: "warning",
    okLabel: "Close anyway",
    cancelLabel: "Keep editing",
  });
  if (!close) event.preventDefault();
});

// Leaving the window saves; coming back picks up changes made elsewhere.
window.addEventListener("blur", () => {
  if (currentPath && dirty) persist();
  else if (!currentPath) saveDraftNow();
});
window.addEventListener("focus", () => void checkDisk());

// Drop a Markdown file onto the window to open it.
getCurrentWebview().onDragDropEvent(async (event) => {
  if (event.payload.type !== "drop") return;
  const path = event.payload.paths.find((p) => /\.(md|markdown|mdown|mkd|txt)$/i.test(p));
  if (path && (await readyToLeave())) await openPath(path);
});

// Open, in order of preference: the file named on the command line, an
// untitled draft left from last time, or the last file you had open.
(async () => {
  const launch = await invoke<string | null>("launch_file");
  const draft = store.get("draft");
  const last = store.get("lastFile");
  if (launch) {
    await openPath(launch);
  } else if (draft) {
    loadDocument("", null);
    view.dispatch({ changes: { from: 0, insert: draft } });
    toast("Restored your unsaved draft");
  } else if (last && (await invoke<boolean>("file_exists", { path: last }))) {
    await openPath(last);
  } else {
    loadDocument("", null);
  }
})();
