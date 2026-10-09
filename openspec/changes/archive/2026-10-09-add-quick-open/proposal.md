# Proposal

## Why

Switching documents today means `Ctrl+O` and a native file dialog: slow, mouse-heavy, and at odds with a keyboard-first editor. When notes live side by side in a folder, you should be able to jump to one by typing a few letters of its name, the way `Ctrl+P` works in code editors.

## What Changes

- New **quick open** palette on `Ctrl+P` (`Cmd+P` on macOS). It looks like the existing theme picker: a filter field over a list, centered over the document. There is no persistent chrome.
- The list covers two sources:
  - **Recent files** opened in Margin, most recent first.
  - **Markdown files in the open file's folder and its subfolders**.
- Typing fuzzy-filters the list by file name and relative path. `t qo` or `tqo` finds `todo/quick-open.md`, for example.
- Arrow keys (or `Ctrl+N`/`Ctrl+P`) move the selection, `Enter` opens the file, and `Esc` closes the palette. Opening goes through the same unsaved-changes handling as `Ctrl+O`.
- Margin starts remembering recently opened files across launches.
- `Ctrl+O` keeps opening the native dialog, unchanged.
- The README Keyboard table gains `Ctrl+P`.

### Out of scope

- A folder sidebar or any persistent file tree.
- Searching inside file contents (full-text search).
- Picking a project or workspace root other than the open file's folder, such as a git root or a chosen folder.
- Creating, renaming or deleting files from the palette.
- Jumping to headings or lines inside a file (`@`/`:` modes).
- Clearing or editing the recent-files list by hand.
- Watching the folder for changes while the palette is open. The list is built each time it opens.

## Capabilities

### New Capabilities

- `quick-open`: The keyboard file switcher. Covers which files it lists, how typing filters and ranks them, keyboard and mouse control, opening the chosen file, and the recent-files history it draws on.

### Modified Capabilities

None. No specs exist yet, and the existing open/save behavior is unchanged.

## Impact

- **Front end:** a new palette module alongside `src/themePicker.ts`, a fuzzy-matching helper, a `Mod-p` binding in the keymap in `src/main.ts`, recent-files tracking where documents are opened and saved, and styles in `src/styles.css` (shared with the theme picker where possible).
- **Rust backend (`src-tauri/src/lib.rs`):** a new command that lists Markdown files under a folder (bounded, skipping hidden and dependency folders), and a way to check which recent paths still exist.
- **Tests:** unit tests for fuzzy matching and ranking; Playwright tests for the palette, with the new commands faked in `tests/e2e/fixtures.ts`; `cargo test` for the folder listing.
- **Docs:** README Keyboard table and Layout section.
- **Platforms:** must work on WebKitGTK, WKWebView and WebView2. `Ctrl+P` must not trigger the webview's print dialog. Windows paths must display and open correctly.
