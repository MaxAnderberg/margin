#!/usr/bin/env bash
# Builds Margin and installs it for the current user (Linux).
#
#   ./install.sh              build + install
#   ./install.sh --default    also make Margin the default app for .md files
#   ./install.sh --no-build   install the existing release build
#   ./install.sh --uninstall  remove everything this script installed
#
# Installs into $PREFIX (default ~/.local): bin/margin, a launcher entry and icons.
set -euo pipefail

cd "$(dirname "$0")"
PREFIX="${PREFIX:-$HOME/.local}"
BIN="$PREFIX/bin/margin"
APPS="$PREFIX/share/applications"
ICONS="$PREFIX/share/icons/hicolor"
DESKTOP="$APPS/dev.max.margin.desktop"
ICON_SIZES=(32 64 128 256 512)

build=1 set_default=0
for arg in "$@"; do
  case "$arg" in
    --default) set_default=1 ;;
    --no-build) build=0 ;;
    --uninstall)
      rm -f "$BIN" "$DESKTOP" "$ICONS/scalable/apps/margin.svg"
      for s in "${ICON_SIZES[@]}"; do rm -f "$ICONS/${s}x${s}/apps/margin.png"; done
      update-desktop-database -q "$APPS" 2>/dev/null || true
      gtk-update-icon-cache -q -t "$ICONS" 2>/dev/null || true
      echo "Margin uninstalled."
      exit 0
      ;;
    -h | --help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)" >&2; exit 1 ;;
  esac
done

if [[ $build == 1 ]]; then
  echo "Building Margin (release)… the first build takes a few minutes."
  [[ -d node_modules ]] || npm install
  npm run tauri build -- --no-bundle
fi

RELEASE=src-tauri/target/release/margin
[[ -x $RELEASE ]] || { echo "No release build at $RELEASE. Run without --no-build." >&2; exit 1; }

install -Dm755 "$RELEASE" "$BIN"

icon_src=(src-tauri/icons/32x32.png src-tauri/icons/64x64.png src-tauri/icons/128x128.png
          src-tauri/icons/128x128@2x.png src-tauri/icons/icon.png)
for i in "${!ICON_SIZES[@]}"; do
  s=${ICON_SIZES[$i]}
  install -Dm644 "${icon_src[$i]}" "$ICONS/${s}x${s}/apps/margin.png"
done
install -Dm644 assets/icon.svg "$ICONS/scalable/apps/margin.svg"

mkdir -p "$APPS"
cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Margin
GenericName=Markdown Editor
Comment=A calm, keyboard-first Markdown editor
Exec=$BIN %f
Icon=margin
Terminal=false
Categories=Utility;TextEditor;
MimeType=text/markdown;text/x-markdown;
Keywords=markdown;notes;writing;editor;mermaid;
StartupWMClass=margin
EOF

update-desktop-database -q "$APPS" 2>/dev/null || true
gtk-update-icon-cache -q -t "$ICONS" 2>/dev/null || true

if [[ $set_default == 1 ]]; then
  xdg-mime default dev.max.margin.desktop text/markdown text/x-markdown
  echo "Margin is now the default app for Markdown files."
fi

echo "Installed Margin to $BIN"
case ":$PATH:" in
  *":$PREFIX/bin:"*) ;;
  *) echo "Note: $PREFIX/bin is not on your PATH; add it to run 'margin' from a terminal." ;;
esac
