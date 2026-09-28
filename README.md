# Margin

A calm, keyboard-first Markdown editor for the desktop, inspired by Typora.

Markdown syntax fades away as you write and reappears only where your cursor is. Headings get a quiet level label (H1–H6) in the left margin. Mermaid diagrams, tables, images and task lists render inline.

Built with [Tauri 2](https://tauri.app). A small Rust backend handles files and the window, and a [CodeMirror 6](https://codemirror.net) front end does the editing.

## Run it

Requirements: Rust (stable), Node 20+, and on Linux `webkit2gtk-4.1`.

```sh
npm install
npm run tauri dev                          # dev mode, hot reload
npm run tauri dev -- -- path/to/file.md    # open a specific file
npm run tauri build                        # release binary + packages in src-tauri/target/release
```

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
| `Ctrl+Shift+L` | Theme: system → light → dark |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+Shift+0` | Zoom in / out / reset |
| `F11` | Full screen |
| `Ctrl+click` | Open link |

You can also drop a `.md` file onto the window to open it.

## Layout

```
src-tauri/src/lib.rs        Rust: file read/atomic write, CLI argument, plugins
src/main.ts                 App wiring: files, shortcuts, theme, title
src/editor/livePreview.ts   Hides syntax and renders widgets away from the cursor
src/editor/commands.ts      Formatting commands
src/editor/mermaid.ts       Lazy, cached Mermaid rendering
src/editor/theme.ts         Syntax colors and editor chrome
src/styles.css              Typography, light/dark palettes, margin labels
examples/welcome.md         A tour of what renders
```
