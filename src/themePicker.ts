import { openPalette } from "./palette";
import { AUTO, THEMES, type Theme } from "./themes";

// The theme chooser, built on the shared palette. Arrow keys preview each theme
// live; Enter keeps it, Escape (or clicking outside) restores the original.

interface Option {
  id: string;
  name: string;
  detail: string;
  swatch: Theme[];
}

const OPTIONS: Option[] = [
  {
    id: AUTO,
    name: "Auto",
    detail: "follows system",
    swatch: THEMES.filter((t) => t.id === "margin-light" || t.id === "margin-dark"),
  },
  ...THEMES.map((t) => ({ id: t.id, name: t.name, detail: t.kind, swatch: [t] })),
];

function swatchHtml(themes: Theme[]) {
  return themes
    .map(
      (t) =>
        `<span class="theme-swatch" style="background:${t.colors.bg};border-color:${t.colors.rule}">` +
        `<i style="background:${t.colors.heading}"></i><i style="background:${t.colors.accent}"></i>` +
        `<i style="background:${t.colors.codeString}"></i></span>`,
    )
    .join("");
}

export function openThemePicker(opts: {
  current: string;
  preview: (id: string) => void;
  commit: (id: string) => void;
  onClose: () => void;
}) {
  const original = opts.current;
  openPalette<Option>({
    label: "Choose a theme",
    placeholder: "Choose a theme…",
    className: "theme-picker",
    // Every typed word must appear somewhere: "gruv dark" finds Gruvbox Dark.
    filter: (query) => {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      return OPTIONS.filter((o) => {
        const haystack = `${o.name} ${o.detail}`.toLowerCase();
        return words.every((w) => haystack.includes(w));
      });
    },
    initialIndex: OPTIONS.findIndex((o) => o.id === original),
    renderItem: (li, option) => {
      li.innerHTML =
        `<span class="theme-swatches">${swatchHtml(option.swatch)}</span>` +
        `<span class="theme-name"></span><span class="theme-detail"></span>` +
        (option.id === original ? `<span class="theme-current">current</span>` : "");
      li.querySelector(".theme-name")!.textContent = option.name;
      li.querySelector(".theme-detail")!.textContent = option.detail;
    },
    onActive: (option) => opts.preview(option.id),
    onChoose: (option) => {
      opts.commit(option.id);
      opts.onClose();
    },
    onCancel: () => {
      opts.preview(original);
      opts.onClose();
    },
  });
}
