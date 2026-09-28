import { syntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState, Range, StateField } from "@codemirror/state";
import { Command, Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { convertFileSrc } from "@tauri-apps/api/core";
import { marked } from "marked";
import { colorTheme, docPath, refreshPreview } from "./context";
import { renderMermaid } from "./mermaid";

// Typora/Obsidian-style live preview: Markdown syntax is hidden and rich
// elements are rendered, except where the selection is, so the text you are
// editing always shows its raw source.

const hide = Decoration.replace({});

/** Moves the cursor into the source of a rendered block when it is clicked. */
function editOnClick(el: HTMLElement, view: EditorView, lineOffset = 0) {
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const pos = view.posAtDOM(el);
    const doc = view.state.doc;
    const line = doc.lineAt(pos).number + lineOffset;
    const anchor = doc.line(Math.min(line, doc.lines)).from;
    view.dispatch({ selection: { anchor }, scrollIntoView: true });
    view.focus();
  });
}

class BulletWidget extends WidgetType {
  constructor(readonly depth: number) {
    super();
  }
  eq(other: BulletWidget) {
    return other.depth === this.depth;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-md-bullet";
    el.textContent = ["•", "◦", "▪"][this.depth % 3];
    return el;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("span");
    box.className = "cm-md-checkbox" + (this.checked ? " is-checked" : "");
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(box);
      const marker = view.state.doc.sliceString(pos, pos + 3);
      if (!/^\[[ xX]\]$/.test(marker)) return;
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: this.checked ? " " : "x" } });
    });
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-md-hr";
    return el;
  }
}

class FenceLabelWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(other: FenceLabelWidget) {
    return other.label === this.label;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-md-fence-label";
    el.textContent = this.label;
    return el;
  }
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("span");
    wrap.className = "cm-md-image";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.title = this.alt;
    img.addEventListener("load", () => view.requestMeasure());
    img.addEventListener("error", () => {
      wrap.classList.add("is-broken");
      wrap.textContent = `Image not found: ${this.alt || this.src}`;
    });
    wrap.appendChild(img);
    editOnClick(wrap, view);
    return wrap;
  }
}

marked.use({
  gfm: true,
  // Never inject raw HTML from the document into the preview.
  renderer: { html: ({ text }) => escapeHtml(text) },
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  eq(other: TableWidget) {
    return other.source === this.source;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "cm-md-table";
    el.innerHTML = marked.parse(this.source, { async: false });
    editOnClick(el, view);
    return el;
  }
}

class MermaidWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly theme: string,
    readonly editing: boolean,
  ) {
    super();
  }
  eq(other: MermaidWidget) {
    return other.source === this.source && other.theme === this.theme && other.editing === this.editing;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "cm-md-mermaid" + (this.editing ? " is-editing" : "");
    if (!this.editing) editOnClick(el, view, 1);
    this.render(el, view);
    return el;
  }
  updateDOM(dom: HTMLElement, view: EditorView) {
    if (dom.classList.contains("is-editing") !== this.editing) return false;
    this.render(dom, view);
    return true;
  }
  // Keeps the previous diagram on screen until the new one is ready,
  // so typing inside a diagram does not flicker.
  private render(el: HTMLElement, view: EditorView) {
    const token = Symbol();
    (el as any).__renderToken = token;
    const current = () => (el as any).__renderToken === token;
    if (!this.source.trim()) {
      el.innerHTML = `<div class="cm-md-mermaid-empty">Empty diagram</div>`;
      return;
    }
    renderMermaid(this.source, this.theme).then(
      (svg) => {
        if (!current()) return;
        el.innerHTML = svg;
        el.classList.remove("has-error");
        view.requestMeasure();
      },
      (err) => {
        if (!current()) return;
        // Mermaid errors look like "Parse error on line 2:\n<source>\n---^\nExpecting …".
        const lines = String(err?.message ?? err).split("\n").filter((l) => l.trim());
        const message = lines.slice(0, 4).join("\n");
        let note = el.querySelector(".cm-md-mermaid-error");
        if (!el.querySelector("svg")) el.innerHTML = "";
        if (!note) {
          note = document.createElement("div");
          note.className = "cm-md-mermaid-error";
          el.appendChild(note);
        }
        note.textContent = message;
        el.classList.add("has-error");
        view.requestMeasure();
      },
    );
  }
  get estimatedHeight() {
    return 240;
  }
}

function resolveImageSrc(src: string, path: string | null): string {
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  let abs: string;
  if (src.startsWith("file://")) {
    abs = decodeURIComponent(new URL(src).pathname);
  } else if (src.startsWith("/")) {
    abs = src;
  } else if (path) {
    const dir = path.slice(0, path.lastIndexOf("/") + 1);
    abs = decodeURIComponent(new URL(src, "file://" + dir).pathname);
  } else {
    return src;
  }
  return convertFileSrc(abs);
}

function buildDecorations(state: EditorState): DecorationSet {
  const doc = state.doc;
  const ranges = state.selection.ranges;
  const decos: Range<Decoration>[] = [];
  const theme = state.facet(colorTheme);
  const path = state.facet(docPath);

  const touches = (from: number, to: number) => ranges.some((r) => r.from <= to && r.to >= from);
  const linesTouch = (from: number, to: number) => touches(doc.lineAt(from).from, doc.lineAt(to).to);
  const lineClass = (pos: number, cls: string, attrs?: Record<string, string>) =>
    decos.push(Decoration.line({ class: cls, attributes: attrs }).range(doc.lineAt(pos).from));
  const eachLine = (from: number, to: number, fn: (lineFrom: number, i: number, last: boolean) => void) => {
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(to).number;
    for (let n = first; n <= last; n++) fn(doc.line(n).from, n - first, n === last);
  };
  const isFullLines = (from: number, to: number) => doc.lineAt(from).from === from && doc.lineAt(to).to === to;
  // Hides a syntax mark plus the single space after it (`# `, `> `, `- `).
  const hideWithSpace = (from: number, to: number) => {
    const end = doc.sliceString(to, to + 1) === " " ? to + 1 : to;
    decos.push(hide.range(from, end));
  };
  const listDepth = (node: SyntaxNode) => {
    let depth = 0;
    for (let p = node.parent; p; p = p.parent) if (p.name === "BulletList" || p.name === "OrderedList") depth++;
    return Math.max(0, depth - 1);
  };

  syntaxTree(state).iterate({
    enter: (ref) => {
      const { from, to, name } = ref;
      const node = ref.node;

      const heading = /^(ATX|Setext)Heading(\d)$/.exec(name);
      if (heading) {
        const level = heading[2];
        lineClass(from, `cm-md-h cm-md-h${level}`, { "data-level": `H${level}` });
        if (heading[1] === "ATX" && !linesTouch(from, to)) {
          for (let c = node.firstChild; c; c = c.nextSibling) {
            if (c.name !== "HeaderMark") continue;
            if (c.from === from) hideWithSpace(c.from, c.to);
            else decos.push(hide.range(Math.max(from, c.from - 1), c.to)); // closing ###
          }
        }
        if (heading[1] === "Setext") {
          const mark = node.getChild("HeaderMark");
          if (mark && !linesTouch(from, to)) lineClass(mark.from, "cm-md-setext-underline");
        }
        return;
      }

      switch (name) {
        case "Emphasis":
        case "StrongEmphasis":
        case "Strikethrough":
        case "InlineCode": {
          if (name === "InlineCode") decos.push(Decoration.mark({ class: "cm-md-code" }).range(from, to));
          if (touches(from, to)) return;
          for (let c = node.firstChild; c; c = c.nextSibling) {
            if (/Mark$/.test(c.name)) decos.push(hide.range(c.from, c.to));
          }
          return;
        }

        case "Link": {
          const marks = node.getChildren("LinkMark");
          const url = node.getChild("URL");
          const textEnd = marks[1]?.from;
          if (marks.length < 2 || textEnd === undefined) return;
          const href = url ? doc.sliceString(url.from, url.to) : "";
          if (textEnd > marks[0].to) {
            decos.push(
              Decoration.mark({ class: "cm-md-link", attributes: { "data-href": href, title: href } }).range(
                marks[0].to,
                textEnd,
              ),
            );
          }
          if (!touches(from, to) && url) {
            decos.push(hide.range(from, marks[0].to));
            decos.push(hide.range(textEnd, to));
          }
          return false;
        }

        case "URL": {
          // Bare and <angle> autolinks (links inside [text](url) are handled above).
          const href = doc.sliceString(from, to);
          decos.push(Decoration.mark({ class: "cm-md-link", attributes: { "data-href": href } }).range(from, to));
          return;
        }

        case "Image": {
          const url = node.getChild("URL");
          if (!url) return false;
          const marks = node.getChildren("LinkMark");
          const alt = marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : "";
          const widget = new ImageWidget(resolveImageSrc(doc.sliceString(url.from, url.to), path), alt);
          if (touches(from, to)) {
            decos.push(Decoration.widget({ widget, side: 1 }).range(to));
          } else {
            decos.push(Decoration.replace({ widget }).range(from, to));
          }
          return false;
        }

        case "Blockquote": {
          eachLine(from, to, (lf) => lineClass(lf, "cm-md-quote"));
          return;
        }
        case "QuoteMark": {
          if (!linesTouch(from, to)) hideWithSpace(from, to);
          return;
        }

        case "ListMark": {
          const item = node.parent;
          const task = item?.getChild("Task");
          if (item?.parent?.name !== "BulletList") return;
          if (touches(from, to + 1)) return;
          if (task) hideWithSpace(from, to);
          else decos.push(Decoration.replace({ widget: new BulletWidget(listDepth(node)) }).range(from, to));
          return;
        }

        case "Task": {
          const marker = node.getChild("TaskMarker");
          if (!marker) return;
          const checked = /x/i.test(doc.sliceString(marker.from, marker.to));
          if (checked) decos.push(Decoration.mark({ class: "cm-md-task-done" }).range(marker.to, to));
          if (!touches(marker.from, marker.to)) {
            decos.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(marker.from, marker.to));
          }
          return;
        }

        case "HorizontalRule": {
          if (!linesTouch(from, to)) decos.push(Decoration.replace({ widget: new RuleWidget() }).range(from, to));
          return;
        }

        case "Table": {
          if (!linesTouch(from, to) && isFullLines(from, to)) {
            const widget = new TableWidget(doc.sliceString(from, to));
            decos.push(Decoration.replace({ widget, block: true }).range(from, to));
          } else {
            eachLine(from, to, (lf) => lineClass(lf, "cm-md-table-source"));
          }
          return false;
        }

        case "FencedCode": {
          const info = node.getChild("CodeInfo");
          const lang = info ? doc.sliceString(info.from, info.to).trim().toLowerCase() : "";
          const active = linesTouch(from, to);
          const text = node.getChild("CodeText");
          const source = text ? doc.sliceString(text.from, text.to) : "";

          if (lang === "mermaid") {
            if (!active && isFullLines(from, to)) {
              const widget = new MermaidWidget(source, theme, false);
              decos.push(Decoration.replace({ widget, block: true }).range(from, to));
              return false;
            }
            const widget = new MermaidWidget(source, theme, true);
            decos.push(Decoration.widget({ widget, block: true, side: 1 }).range(doc.lineAt(to).to));
          }

          const firstLine = doc.lineAt(from).number;
          const lastLine = doc.lineAt(to).number;
          const closed = lastLine > firstLine && /^\s*(`{3,}|~{3,})\s*$/.test(doc.line(lastLine).text);
          eachLine(from, to, (lf, i, last) => {
            let cls = "cm-md-codeblock";
            if (i === 0) cls += " cm-md-codeblock-first";
            if (last) cls += " cm-md-codeblock-last";
            lineClass(lf, cls);
          });
          if (!active) {
            const open = doc.lineAt(from);
            decos.push(Decoration.replace({ widget: new FenceLabelWidget(lang) }).range(from, open.to));
            if (closed) {
              const close = doc.line(lastLine);
              decos.push(hide.range(close.from, close.to));
            }
          }
          return false;
        }
      }
    },
  });

  return Decoration.set(decos, true);
}

export const livePreview = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state),
  update(value, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      syntaxTree(tr.state) !== syntaxTree(tr.startState) ||
      tr.startState.facet(colorTheme) !== tr.state.facet(colorTheme) ||
      tr.startState.facet(docPath) !== tr.state.facet(docPath) ||
      tr.effects.some((e) => e.is(refreshPreview))
    ) {
      return buildDecorations(tr.state);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Heading lines keep their size/label even in source mode. */
export const headingLines = StateField.define<DecorationSet>({
  create: (state) => buildHeadingLines(state),
  update(value, tr) {
    if (tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState)) return buildHeadingLines(tr.state);
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildHeadingLines(state: EditorState): DecorationSet {
  const decos: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter: ({ name, from }) => {
      const m = /^(?:ATX|Setext)Heading(\d)$/.exec(name);
      if (!m) return;
      decos.push(
        Decoration.line({ class: `cm-md-h cm-md-h${m[1]}`, attributes: { "data-level": `H${m[1]}` } }).range(
          state.doc.lineAt(from).from,
        ),
      );
      return false;
    },
  });
  return Decoration.set(decos, true);
}

// ---------------------------------------------------------------- keyboard entry

// Rendered blocks (diagrams, tables) replace their source, so the cursor would
// normally skip straight over them. These commands step *into* the block
// instead, which reveals the source (and, for diagrams, a live preview below).

const FENCE = /^\s*(`{3,}|~{3,})/;

/** A rendered block that starts (`edge = "from"`) or ends (`"to"`) at `pos`. */
function renderedBlockAt(state: EditorState, pos: number, edge: "from" | "to") {
  const set = state.field(livePreview, false);
  let found: { from: number; to: number } | null = null;
  set?.between(pos, pos, (from, to, deco) => {
    if (deco.spec.block && to > from && (edge === "from" ? from : to) === pos) {
      found = { from, to };
      return false;
    }
  });
  return found as { from: number; to: number } | null;
}

/** Where the cursor lands: first line of content going forward, end of the last going back. */
function entryPoint(state: EditorState, block: { from: number; to: number }, forward: boolean) {
  const doc = state.doc;
  const first = doc.lineAt(block.from);
  const last = doc.lineAt(block.to);
  const fenced = FENCE.test(first.text) && last.number > first.number;
  if (forward) return (fenced ? doc.line(first.number + 1) : first).from;
  const closed = fenced && /^\s*(`{3,}|~{3,})\s*$/.test(last.text) && last.number - 1 > first.number;
  return (closed ? doc.line(last.number - 1) : last).to;
}

function enterRenderedBlock(forward: boolean, vertical: boolean): Command {
  return (view) => {
    const { state } = view;
    const sel = state.selection;
    if (sel.ranges.length > 1 || !sel.main.empty) return false;
    const head = sel.main.head;
    const line = state.doc.lineAt(head);
    if (vertical) {
      // Only when the motion would leave this line (long lines wrap visually).
      const next = view.moveVertically(sel.main, forward);
      if (forward ? next.head <= line.to : next.head >= line.from) return false;
    } else if (head !== (forward ? line.to : line.from)) {
      return false;
    }
    const pos = forward ? line.to + 1 : line.from - 1;
    if (pos < 0 || pos > state.doc.length) return false;
    const block = renderedBlockAt(state, pos, forward ? "from" : "to");
    if (!block) return false;
    view.dispatch({
      selection: EditorSelection.cursor(entryPoint(state, block, forward)),
      scrollIntoView: true,
      userEvent: "select",
    });
    return true;
  };
}

export const enterBlockKeymap = [
  { key: "ArrowDown", run: enterRenderedBlock(true, true) },
  { key: "ArrowUp", run: enterRenderedBlock(false, true) },
  { key: "ArrowRight", run: enterRenderedBlock(true, false) },
  { key: "ArrowLeft", run: enterRenderedBlock(false, false) },
];
