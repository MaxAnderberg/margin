import { AUTO, THEMES, type Theme } from "./themes";

// A small command-palette-style theme chooser. Arrow keys preview each theme
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

export function openThemePicker(opts: {
  current: string;
  preview: (id: string) => void;
  commit: (id: string) => void;
  onClose: () => void;
}) {
  if (document.querySelector(".theme-picker")) return;
  const original = opts.current;

  const backdrop = document.createElement("div");
  backdrop.className = "theme-picker-backdrop";
  const panel = document.createElement("div");
  panel.className = "theme-picker";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Choose a theme");

  const input = document.createElement("input");
  input.className = "theme-picker-input";
  input.placeholder = "Choose a theme…";
  input.setAttribute("aria-label", "Filter themes");
  const list = document.createElement("ul");
  list.className = "theme-picker-list";
  list.setAttribute("role", "listbox");
  panel.append(input, list);
  backdrop.append(panel);
  document.body.append(backdrop);

  let visible = OPTIONS;
  let index = Math.max(0, OPTIONS.findIndex((o) => o.id === original));

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

  function render() {
    list.innerHTML = "";
    visible.forEach((option, i) => {
      const li = document.createElement("li");
      li.className = "theme-picker-item" + (i === index ? " is-active" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === index));
      li.innerHTML =
        `<span class="theme-swatches">${swatchHtml(option.swatch)}</span>` +
        `<span class="theme-name"></span><span class="theme-detail"></span>` +
        (option.id === original ? `<span class="theme-current">current</span>` : "");
      li.querySelector(".theme-name")!.textContent = option.name;
      li.querySelector(".theme-detail")!.textContent = option.detail;
      li.addEventListener("mousemove", () => {
        if (index !== i) select(i);
      });
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        select(i);
        close(true);
      });
      list.append(li);
    });
    list.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  }

  function select(i: number) {
    if (!visible.length) return;
    index = (i + visible.length) % visible.length;
    opts.preview(visible[index].id);
    render();
  }

  function close(keep: boolean) {
    if (keep && visible[index]) opts.commit(visible[index].id);
    else opts.preview(original);
    backdrop.remove();
    opts.onClose();
  }

  input.addEventListener("input", () => {
    // Every typed word must appear somewhere: "gruv dark" finds Gruvbox Dark.
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    visible = OPTIONS.filter((o) => {
      const haystack = `${o.name} ${o.detail}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
    index = 0;
    if (visible.length) opts.preview(visible[0].id);
    render();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) select(index + 1);
    else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) select(index - 1);
    else if (e.key === "Enter") close(true);
    else if (e.key === "Escape") close(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });

  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) {
      e.preventDefault();
      close(false);
    }
  });

  render();
  input.focus();
}
