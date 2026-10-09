// A small command palette: a filter field over a list, centered over the
// document. The theme picker and quick open are both built on it, so they
// look and behave alike. Arrow keys (or Ctrl+N / Ctrl+P) move the selection
// and wrap; Enter chooses; Escape or a click outside cancels.

export interface PaletteOptions<T> {
  /** Accessible name of the dialog. */
  label: string;
  placeholder: string;
  /** Extra class on the panel, for styling one palette differently. */
  className?: string;
  /** The items to show for `query`, in display order. */
  filter: (query: string) => T[];
  /** Fills in an entry. `li` is empty and already has its classes and role. */
  renderItem: (li: HTMLLIElement, item: T, query: string) => void;
  /** Which item to select first when the palette opens (default 0). */
  initialIndex?: number;
  /** Text under the list, e.g. why it is empty. Null shows nothing. */
  message?: (query: string, items: T[]) => string | null;
  /** Called whenever the selected item changes after opening (live preview). */
  onActive?: (item: T) => void;
  /** Called after the palette closes because the user chose `item`. */
  onChoose: (item: T) => void;
  /** Called after the palette closes without a choice. */
  onCancel?: () => void;
}

export interface Palette {
  /** Re-runs the filter, e.g. after more items arrived, keeping the selected item when it is still listed. */
  refresh(): void;
  readonly isOpen: boolean;
}

export function openPalette<T>(opts: PaletteOptions<T>): Palette | null {
  if (document.querySelector(".palette")) return null;

  const backdrop = document.createElement("div");
  backdrop.className = "palette-backdrop";
  const panel = document.createElement("div");
  panel.className = "palette" + (opts.className ? ` ${opts.className}` : "");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", opts.label);

  const input = document.createElement("input");
  input.className = "palette-input";
  input.placeholder = opts.placeholder;
  input.setAttribute("aria-label", opts.placeholder.replace(/…$/, ""));
  input.spellcheck = false;
  const list = document.createElement("ul");
  list.className = "palette-list";
  list.setAttribute("role", "listbox");
  const message = document.createElement("div");
  message.className = "palette-message";
  panel.append(input, list, message);
  backdrop.append(panel);
  document.body.append(backdrop);

  let open = true;
  let items = opts.filter("");
  let index = Math.min(Math.max(0, opts.initialIndex ?? 0), Math.max(0, items.length - 1));

  function render() {
    list.innerHTML = "";
    items.forEach((item, i) => {
      const li = document.createElement("li");
      li.className = "palette-item" + (i === index ? " is-active" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === index));
      opts.renderItem(li, item, input.value);
      li.addEventListener("mousemove", () => {
        if (index !== i) select(i);
      });
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        index = i;
        close(true);
      });
      list.append(li);
    });
    const text = opts.message?.(input.value, items) ?? null;
    message.textContent = text ?? "";
    message.hidden = text === null;
    list.hidden = items.length === 0;
    list.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  }

  function select(i: number) {
    if (!items.length) return;
    index = (i + items.length) % items.length;
    opts.onActive?.(items[index]);
    render();
  }

  function close(choose: boolean) {
    if (!open) return;
    open = false;
    backdrop.remove();
    const chosen = choose ? items[index] : undefined;
    if (chosen !== undefined) opts.onChoose(chosen);
    else opts.onCancel?.();
  }

  input.addEventListener("input", () => {
    items = opts.filter(input.value);
    index = 0;
    if (items.length) opts.onActive?.(items[0]);
    render();
  });

  input.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === "ArrowDown" || (ctrl && e.key === "n")) select(index + 1);
    else if (e.key === "ArrowUp" || (ctrl && e.key === "p")) select(index - 1);
    else if (e.key === "Enter") {
      if (items.length) close(true);
    } else if (e.key === "Escape") close(false);
    else return;
    // Also keeps Ctrl+P from reaching the webview's print shortcut.
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

  return {
    refresh() {
      if (!open) return;
      const selected = items[index];
      items = opts.filter(input.value);
      const kept = selected === undefined ? -1 : items.indexOf(selected);
      index = kept >= 0 ? kept : 0;
      render();
    },
    get isOpen() {
      return open;
    },
  };
}
