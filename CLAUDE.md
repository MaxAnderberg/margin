# Margin

A Typora-style Markdown editor: Tauri 2 (small Rust backend) + CodeMirror 6 live preview. The README covers install, shortcuts, file layout and the release process. Read it before larger changes.

The owner doesn't write Rust and relies on Claude to build the app. Explain changes in terms of behavior, not code.

## Commands

```sh
npm run check                           # tsc + Vitest (unit + release-pipeline tests), ~1 s
npx playwright test --project=chromium  # browser tests (WebKit needs Ubuntu/Debian libs; CI runs both)
cd src-tauri && cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test
npm run tauri dev                       # run the app
```

Run `npm run check` and the Chromium e2e tests before calling a front-end change done. Run the cargo commands when touching `src-tauri/`. CI fails on `cargo fmt --check` and clippy warnings.

## Conventions

- **Conventional Commits are required** for commit messages and PR titles (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, optional scope like `fix(mermaid):`). release-please builds versions and the changelog from them, and `feat`/`fix` cut a release.
- Work on a branch and open a PR to `main`. Push after committing.
- Never hand-edit version numbers or `CHANGELOG.md`. release-please owns them, and `tests/release/` checks they agree.
- New keyboard shortcuts go in the keymap in `src/main.ts` **and** the Keyboard table in `README.md`.
- New themes are a single entry in `src/themes.ts`. The theme tests check contrast, so a low-contrast theme fails.
- e2e tests run the front end in a browser with a simulated disk in place of the Rust backend (`tests/e2e/fixtures.ts`). Any new Tauri command needs a fake there too.
- Comments explain *why*, briefly. Match the surrounding style.

## Platform gotchas

- Development happens on Arch + Hyprland (Wayland) with an NVIDIA GPU. `src-tauri/src/main.rs` sets `__NV_DISABLE_EXPLICIT_SYNC=1` to avoid a WebKitGTK crash while keeping smooth scrolling. Don't swap it for `WEBKIT_DISABLE_DMABUF_RENDERER`.
- The app ships on Linux (WebKitGTK), macOS (WKWebView) and Windows (WebView2). Handle Windows paths (`src/paths.ts`) and avoid Chromium-only web APIs.

## Spec-driven development (OpenSpec)

Behavior is specified with [OpenSpec](https://github.com/Fission-AI/OpenSpec), installed globally (`npm i -g @fission-ai/openspec`).

- `openspec/specs/<capability>/spec.md` describes how Margin behaves **now** (the source of truth).
- `openspec/changes/<name>/` holds an in-progress change: `proposal.md`, `design.md`, `tasks.md` and spec deltas.
- Flow: `/opsx:propose <idea>` → review → `/opsx:apply` → `/opsx:archive` (merges the deltas into `openspec/specs/`).

Use it for new features and behavior changes. Small bug fixes and refactors can skip it. Commit spec-only work as `docs:` so it doesn't trigger a release, and ship the archived change in the same PR as the code that implements it.
