import { type Match, rankFiles } from "./fuzzy";
import { openPalette } from "./palette";
import { baseName, dirName, displayFolder, relativeTo } from "./paths";

// Quick open (Ctrl+P): jump to a recent file or a Markdown file in the open
// document's folder by typing part of its name. Recent files show at once;
// the folder listing arrives a moment later from the backend.

/** What the backend's `quick_open_files` command returns. */
export interface QuickOpenFiles {
  files: string[];
  truncated: boolean;
  recent: string[];
  home: string | null;
}

interface Entry {
  path: string;
  /** What the filter matches: the path relative to the folder, or location + name for files elsewhere. */
  key: string;
  name: string;
  /** Position in the recent files, or Infinity. */
  recent: number;
}

const LIMIT_NOTE = "Not all files in this folder are listed";

export function openQuickOpen(opts: {
  currentPath: string | null;
  recent: string[];
  list: (folder: string | null, recent: string[]) => Promise<QuickOpenFiles>;
  open: (path: string) => void;
  onCancel: () => void;
}) {
  const folder = opts.currentPath ? dirName(opts.currentPath) : null;
  const recentIndex = new Map(opts.recent.map((p, i) => [p, i]));
  const entries = new Map<string, Entry>();
  let home: string | null = null;
  let loading = true;
  let truncated = false;
  let matches = new Map<Entry, Match>();

  function entryFor(path: string): Entry {
    const name = baseName(path);
    const relative = folder === null ? null : relativeTo(folder, path);
    const separator = path.includes("\\") && !path.includes("/") ? "\\" : "/";
    const key = relative ?? `${displayFolder(path, home)}${separator}${name}`.replace(/^([\\/])\1/, "$1");
    // Reuse the same object so the palette keeps the selection across updates.
    const entry = entries.get(path) ?? { path, key, name, recent: Infinity };
    entry.key = key;
    entry.recent = recentIndex.get(path) ?? Infinity;
    return entry;
  }

  function setPaths(paths: string[]) {
    const next = new Map<string, Entry>();
    for (const path of paths) {
      if (path !== opts.currentPath && !next.has(path)) next.set(path, entryFor(path));
    }
    entries.clear();
    next.forEach((entry, path) => entries.set(path, entry));
  }

  setPaths(opts.recent);

  const palette = openPalette<Entry>({
    label: "Quick open",
    placeholder: "Open a file…",
    className: "quick-open",
    filter: (query) => {
      const ranked = rankFiles([...entries.values()], query);
      matches = new Map(ranked.map((r) => [r.item, r.match]));
      return ranked.map((r) => r.item);
    },
    renderItem: (li, entry) => {
      const nameStart = entry.key.length - entry.name.length;
      const positions = matches.get(entry)?.positions ?? [];
      const name = highlighted(entry.name, positions, nameStart, "quick-open-name");
      li.append(name);
      if (nameStart > 0) li.append(highlighted(entry.key.slice(0, nameStart - 1), positions, 0, "quick-open-location"));
      li.title = entry.path;
    },
    message: (query, items) => {
      if (items.length) return truncated ? LIMIT_NOTE : null;
      if (loading) return "Looking for files…";
      return query.trim() ? "No matching files" : "No files to open";
    },
    onChoose: (entry) => opts.open(entry.path),
    onCancel: opts.onCancel,
  });
  if (!palette) return;

  opts
    .list(folder, opts.recent)
    .then((result) => {
      home = result.home;
      truncated = result.truncated;
      setPaths([...result.recent, ...result.files]);
    })
    .catch(() => {
      // Keep showing the recent files; the folder just isn't listed.
    })
    .finally(() => {
      loading = false;
      palette.refresh();
    });
}

/** `text` as a span, with the characters at `positions` (offset by `offset`) emphasized. */
function highlighted(text: string, positions: number[], offset: number, className: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className;
  const marked = new Set(positions.map((p) => p - offset).filter((p) => p >= 0 && p < text.length));
  let run = "";
  let runMarked = false;
  const flush = () => {
    if (!run) return;
    if (runMarked) {
      const b = document.createElement("b");
      b.className = "palette-match";
      b.textContent = run;
      span.append(b);
    } else {
      span.append(run);
    }
    run = "";
  };
  for (let i = 0; i < text.length; i++) {
    if (marked.has(i) !== runMarked) {
      flush();
      runMarked = !runMarked;
    }
    run += text[i];
  }
  flush();
  return span;
}
