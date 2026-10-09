# Design

## Context

Margin edits one file at a time. It has no workspace and no file tree. The only history it keeps is `lastFile` in `localStorage` (the `store` helper in `src/main.ts`). Files open through `openPath()`, guarded by `readyToLeave()`. The Rust `read_file` command returns an *empty document* for a missing path, so that `margin new.md` works. Quick open must not fall into that and silently create a file the user thought existed.

The theme picker (`src/themePicker.ts`, `.theme-picker*` styles) is already a small command palette: a backdrop, a filter input and a listbox, with arrow, `Ctrl+N`/`Ctrl+P`, Enter and Esc handling. Quick open is the same interaction with a different data source and an `open` action instead of preview/commit.

The webview can't list directories without a new capability, so scanning has to happen in Rust.

## Goals / Non-Goals

**Goals:**
- The palette appears instantly, and the folder scan stays fast for typical note folders (hundreds to a few thousand files).
- One backend round trip per palette open.
- Fuzzy matching is pure TypeScript and unit-testable without a browser.
- The palette chrome is shared with the theme picker, so the two look and feel identical.

**Non-Goals:**
- Caching or watching the file tree between opens.
- A general command palette (actions, settings). Only files are covered here.
- Moving `lastFile` into the new recents list. Startup behavior stays as it is.

## Decisions

### 1. One Rust command: `quick_open_files`

```
quick_open_files(folder: Option<String>, recent: Vec<String>)
  -> { files: Vec<String>, truncated: bool, recent: Vec<String>, home: Option<String> }
```

- `files`: absolute paths of Markdown files under `folder`, walked depth-first with `std::fs::read_dir`. No new crate. It skips names starting with `.` and `node_modules`, doesn't follow directory symlinks (it checks `symlink_metadata`), and stops at 5,000 files (`truncated = true`). Symlinked *files* are included, since they're just files. Unreadable subfolders are skipped silently.
- `recent`: the input list filtered to paths that are still files.
- `home`: the user's home folder (`std::env::home_dir()`), used to show `~` in locations.

*Alternatives:* `walkdir` or `ignore` would also respect `.gitignore`. But that adds a dependency for little gain in note folders, and gitignore semantics would make the listing harder to predict. Two separate commands (list folder, filter recents) would mean two round trips and two fakes for nothing.

Run it with `async` in Tauri, so a slow disk can't freeze the window. The palette opens right away, shows recents from `localStorage` as soon as they're checked, and fills in when the command returns. In practice that's one render after a few milliseconds.

### 2. The relative paths and display are computed in TypeScript

Rust returns absolute paths. A small helper in `src/paths.ts` (`relativeTo(folder, path)` and `displayFolder(path, home)`) works out the relative path used for matching and the quiet location text. It handles both `/` and `\`, like the existing helpers. Keeping path formatting in one TS module keeps the Windows behavior unit-testable on Linux.

### 3. Fuzzy matcher: `src/fuzzy.ts`

`fuzzyMatch(query, target) -> { score, positions } | null`:
- The query is lowercased and split on whitespace. Each part must match in order as a subsequence of the target. Parts are matched left to right, with no overlap.
- Scoring gives a bonus for consecutive characters, for a match at a word start (after `/ \ - _ . space`, or a camelCase hump), for matches inside the base name, and for a match at the start of the base name. Gaps cost a small penalty.
- `positions` drives the highlighting.

Ranking sorts by score, then by recent-index, then by relative path. That's about 80 lines and easy to tune with unit tests. *Alternatives:* `fzf`/`fuse.js`. Fuse is fuzzy in the wrong way (typo-tolerant, not subsequence), and either one adds a dependency for something this small.

### 4. Shared palette shell, `src/palette.ts`

Pull the generic parts of `themePicker.ts` into `openPalette({ placeholder, label, items, render, onSelect, onActive?, onCancel, onClose })`. That covers the backdrop, input, list, key handling, wrapping selection, scrolling into view and mouse handling. `themePicker` becomes a caller that passes `onActive` for live preview. `quickOpen.ts` is another caller that can replace its items once the scan arrives. The CSS classes move from `.theme-picker*` to `.palette*`, with theme-specific bits like swatches kept separate.

*Alternative:* copying `themePicker.ts`. Faster now, but two copies of the key handling would drift apart. The theme picker's e2e tests guard the refactor.

### 5. Recent files in `localStorage`

`margin.recentFiles` holds a JSON array of up to 50 absolute paths, most recent first. A path is pushed to the front in `loadDocument()` when it has one, and in `writeNow()` when the path changes (save as). It's removed when an open from the palette finds the file missing. A corrupt value reads as an empty list. This follows how `lastFile` and the theme are already kept. Nothing is sent anywhere.

### 6. Opening safely

The palette's open action does `if (await readyToLeave()) ...`, checks `file_exists`, and then calls `openPath()`. If the file is missing, it shows a toast ("… no longer exists"), drops the path from recents and stays put. The current document is left untouched.

### 7. Ctrl+P and printing

`Mod-p` goes in `appKeymap`. CodeMirror calls `preventDefault` on keys it handles, which stops WebView2's built-in `Ctrl+P` print accelerator, and WebKitGTK and WKWebView don't bind it. As a backstop, a window-level `keydown` listener calls `preventDefault` on `Ctrl/Cmd+P` when focus is outside the editor, for example while a dialog is open. Inside the palette, `Ctrl+P` already means "move up", which matches the theme picker.

## Risks / Trade-offs

- [The open file lives in a huge folder, such as `~` itself] → The 5,000-file cap, skipped hidden folders and `node_modules`, and the async command keep the UI responsive. The note tells the user the list is partial.
- [Network or slow drives make the scan slow] → The palette is usable with recents right away, and the scan result arrives later. If it comes back after the palette was closed, it's ignored.
- [Refactoring the theme picker could break it] → The existing `themes.spec.ts` picker tests must pass unchanged, apart from selector renames.
- [The listing goes stale (a file is deleted between scan and Enter)] → Handled by the existence check in Decision 6.
- [WebView2 print accelerator behavior varies by version] → Covered by the key handler's `preventDefault`. Confirm by hand on a Windows build before release (tasks).
- [The folder root is the open file's own folder, so files in sibling folders aren't found] → An accepted limitation for now. A workspace or git-root choice is out of scope (see proposal).
