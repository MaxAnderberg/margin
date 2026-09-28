# Margin

A calm, keyboard-first Markdown editor for the desktop, inspired by Typora.

Markdown syntax fades away as you write and reappears only where your cursor is. Headings get a quiet level label (H1–H6) in the left margin. Mermaid diagrams, tables, images and task lists render inline.

Built with [Tauri 2](https://tauri.app). A small Rust backend handles files and the window, and a [CodeMirror 6](https://codemirror.net) front end does the editing.

## Install (Linux)

```sh
./install.sh              # build a release and install for your user
./install.sh --default    # …and make Margin the default app for .md files
./install.sh --uninstall  # remove it again
```

This puts `margin` in `~/.local/bin` and adds a launcher entry and icon. You can then open Margin from your app launcher, run `margin notes.md` from a terminal, or right-click a `.md` file and open it with Margin. To update later, pull the latest code and run `./install.sh` again.

macOS and Windows builds come from `npm run tauri build` on those systems. Each OS gets its own native package (`.dmg`, `.msi`).

## Develop

Requirements: Rust (stable), Node 20+, and on Linux `webkit2gtk-4.1`.

```sh
npm install
npm run tauri dev                                    # dev mode, hot reload
npm run tauri dev -- -- -- "$PWD/path/to/file.md"    # open a specific file
npm run tauri build                                  # release binary + packages in src-tauri/target/release
```

In dev mode the app runs from `src-tauri/`, so pass an absolute path. The three `--` get the file past npm, the Tauri CLI and cargo to the app itself.

`margin notes.md` opens (or starts) that file. With no argument, Margin reopens the last file.

## Keyboard

| Keys | Action |
| --- | --- |
| `Ctrl+N` / `Ctrl+O` | New / open |
| `Ctrl+S` / `Ctrl+Shift+S` | Save / save as |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+E` | Bold / italic / inline code |
| `Ctrl+Shift+X` | Strikethrough |
| `Ctrl+K` | Link |
| `Ctrl+1` … `Ctrl+6`, `Ctrl+0` | Heading level / paragraph |
| `Ctrl+Enter` | Toggle task checkbox |
| `Ctrl+Shift+K` | Code block |
| `Ctrl+Shift+M` | Mermaid diagram |
| `Ctrl+F` | Find / replace |
| `Ctrl+/` | Toggle source mode (raw Markdown) |
| `Ctrl+Shift+L` | Choose a theme (arrows preview live, `Enter` keeps, `Esc` reverts) |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+Shift+0` | Zoom in / out / reset |
| `F11` | Full screen |
| `Ctrl+click` | Open link |

You can also drop a `.md` file onto the window to open it.

## Themes

Margin Light and Dark, GitHub Light and Dark, Catppuccin Latte and Mocha, Gruvbox Light and Dark, and Monokai. There is also **Auto**, which follows your system's light/dark setting. Mermaid diagrams take on each theme's colors. Themes are plain color sets in `src/themes.ts`, so adding one is a single entry.

## Saving

- **Autosave:** files save automatically about a second after you stop typing, and when you switch away from the window. `Ctrl+S` still works.
- **Untitled documents** are kept as a recovery draft and come back the next time you open Margin.
- **Changes made elsewhere:** if the file changes in another program and you have no unsaved edits, Margin reloads it when you return to the window. If you do have unsaved edits, Margin asks whether to keep your version or load the one on disk. Loading from disk is undoable with `Ctrl+Z`.
- Saves are atomic (temp file + rename), keep the file's permissions, and write through symlinks.

## Layout

```
src-tauri/src/lib.rs        Rust: file read, conflict-checked atomic write, CLI argument (tests: cargo test)
src/main.ts                 App wiring: files, shortcuts, theme, title
src/editor/livePreview.ts   Hides syntax and renders widgets away from the cursor
src/editor/commands.ts      Formatting commands
src/editor/mermaid.ts       Lazy, cached Mermaid rendering
src/editor/theme.ts         Syntax colors and editor chrome
src/styles.css              Typography, light/dark palettes, margin labels
examples/welcome.md         A tour of what renders
```

## License

[MIT](LICENSE)
