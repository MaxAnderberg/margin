# Tasks

## 1. Backend: list files for quick open

- [ ] 1.1 Add the async `quick_open_files(folder, recent)` command to `src-tauri/src/lib.rs`. It walks Markdown files (same extensions as `MD_FILTER`), skips `.`-folders and `node_modules`, doesn't follow directory symlinks, caps at 5,000 with `truncated`, filters `recent` to existing files and returns `home`. Register it in `generate_handler!`. Verify with `cargo build`.
- [ ] 1.2 Add `cargo test` cases for: nested files found, non-Markdown files ignored, hidden and `node_modules` folders skipped, a symlink loop terminates, the cap sets `truncated`, deleted recents dropped, and `folder = None` returning only recents. Verify that `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` passes.
- [ ] 1.3 Add a `quick_open_files` fake to `tests/e2e/fixtures.ts` that derives the listing from the simulated disk (prefix match on the folder, same skip rules) and supports a `truncated` override. Verify that the existing e2e suite still passes.

## 2. Path display and fuzzy matching

- [ ] 2.1 Add `relativeTo(folder, path)` and `displayFolder(path, home)` to `src/paths.ts`, handling both `/` and `\`. Cover POSIX, Windows and `~` shortening in `tests/unit/paths.test.ts`. Verify with `npm run check`.
- [ ] 2.2 Add `src/fuzzy.ts` with `fuzzyMatch` (subsequence over space-separated parts, case-insensitive, returning a score and positions) and a `rankFiles` sort (score, then recency, then path). Verify with `npm run check`.
- [ ] 2.3 Add `tests/unit/fuzzy.test.ts` covering each "Fuzzy filtering" scenario in the spec (`qkop`, case, file name beats folder, `ideas c`, no match, positions) plus the empty-query order (recents by recency, then folder files by path). Verify with `npm run check`.

## 3. Shared palette shell

- [ ] 3.1 Extract `src/palette.ts` from `src/themePicker.ts`. It holds the backdrop, input, listbox, ↑/↓/`Ctrl+N`/`Ctrl+P` with wrapping, Enter, Esc, outside-click and scroll-into-view, plus a way to replace items after opening. Rename the shared CSS in `src/styles.css` to `.palette*`.
- [ ] 3.2 Rebuild `themePicker.ts` on the shell, keeping live preview and revert. Verify that the theme-picker tests in `tests/e2e/themes.spec.ts` pass (`npx playwright test --project=chromium`), updating selectors only.

## 4. Recent files

- [ ] 4.1 Add a recent-files list in `src/main.ts`, stored as `margin.recentFiles` with a cap of 50, most recent first, and reading a corrupt value as empty. Push in `loadDocument()` and on save-as in `writeNow()`. Add a remove helper.
- [ ] 4.2 Add Playwright tests for "Recent files history": remembered across a reload, save-as adds the file, deleted files are not shown. Verify with `npx playwright test --project=chromium`.

## 5. Quick open palette

- [ ] 5.1 Add `src/quickOpen.ts` built on the palette shell. It shows recents straight away, then merges in the folder scan (deduped, current file excluded). It renders the name, a quiet location and highlighted matches, plus empty, no-match and truncated messages. Results that arrive after close are ignored.
- [ ] 5.2 Wire up the open action: `readyToLeave()` → `file_exists` → `openPath()`. A missing file shows a toast and is removed from recents.
- [ ] 5.3 Bind `Mod-p` in `appKeymap`, and add a window-level `keydown` guard that prevents the default `Ctrl/Cmd+P` (print) outside the editor. Verify by hand in `npm run tauri dev` that `Ctrl+P` opens the palette and no print dialog appears.
- [ ] 5.4 Add styles for entries (name, quiet location, match emphasis, message rows) in `src/styles.css`. Check by eye in one light and one dark theme.
- [ ] 5.5 Add `tests/e2e/quickOpen.spec.ts` covering the spec scenarios: the shortcut opens the palette in normal and source mode, folder files are listed and non-Markdown and hidden files are not, recents come first, the current file is excluded, untitled shows recents only, the empty state, the truncated note, filtering and highlighting, ↑/↓ wrap, Enter/click opens, Esc restores editor focus, pending edits are saved before switching, "Keep editing" on an untitled draft, and a file deleted after listing shows an error. Verify with `npx playwright test --project=chromium`.

## 6. Docs

- [ ] 6.1 Add `Ctrl+P` (Quick open: recent files and Markdown files in this folder) to the README Keyboard table, and `src/palette.ts`, `src/quickOpen.ts` and `src/fuzzy.ts` to the Layout section. Check that the README renders.

## 7. Integration checks

- [ ] 7.1 Run the full local gate: `npm run check`, `npx playwright test --project=chromium`, and the cargo fmt, clippy and test commands. All green.
- [ ] 7.2 Smoke test the installed build (`./install.sh`): open a file in a real notes folder, use `Ctrl+P` to switch files several times, and confirm the recents survive a restart.
- [ ] 7.3 After CI builds the Windows installer for the PR, confirm on Windows that `Ctrl+P` doesn't print and that `C:\…` locations display and open correctly. If no Windows machine is available, note it in the PR.
