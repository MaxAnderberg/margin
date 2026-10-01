import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { livePreview } from "../../src/editor/livePreview";

// Checks which Markdown syntax the live preview hides or replaces for a
// given cursor position, without a browser.

interface Deco {
  text: string;
  kind: "hidden" | "widget" | "line" | "mark";
  className?: string;
  widget?: string;
}

/** Decorations for `doc` with the cursor placed just after the text `cursorAfter`. */
function decorations(doc: string, cursorAfter: string): Deco[] {
  const anchor = doc.indexOf(cursorAfter);
  if (anchor < 0) throw new Error(`"${cursorAfter}" not in document`);
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(anchor + cursorAfter.length),
    extensions: [markdown({ base: markdownLanguage }), livePreview],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  // A selection transaction rebuilds the decorations against the finished parse.
  const ready = state.update({ selection: state.selection }).state;
  const out: Deco[] = [];
  ready.field(livePreview).between(0, ready.doc.length, (from, to, deco) => {
    const spec = deco.spec;
    const text = ready.doc.sliceString(from, to);
    if (spec.widget) out.push({ text, kind: "widget", widget: spec.widget.constructor.name });
    else if (from === to) out.push({ text: ready.doc.lineAt(from).text, kind: "line", className: spec.class });
    else if (spec.class) out.push({ text, kind: "mark", className: spec.class });
    else out.push({ text, kind: "hidden" });
  });
  return out;
}

const hidden = (decos: Deco[]) => decos.filter((d) => d.kind === "hidden").map((d) => d.text);
const widgets = (decos: Deco[]) => decos.filter((d) => d.kind === "widget").map((d) => d.widget);

describe("inline syntax", () => {
  const doc = "Some **bold** and *soft* and `code` here.\n\nOther line.";

  it("is hidden when the cursor is elsewhere", () => {
    expect(hidden(decorations(doc, "Other"))).toEqual(["**", "**", "*", "*", "`", "`"]);
  });

  it("is revealed for the element the cursor is in", () => {
    const h = hidden(decorations(doc, "**bo"));
    expect(h).not.toContain("**");
    expect(h).toEqual(["*", "*", "`", "`"]);
  });
});

describe("headings", () => {
  const doc = "## Section\n\ntext";

  it("hide the # marks away from the cursor and get a margin label", () => {
    const d = decorations(doc, "tex");
    expect(hidden(d)).toEqual(["## "]);
    expect(d).toContainEqual({ text: "## Section", kind: "line", className: "cm-md-h cm-md-h2" });
  });

  it("show the # marks on the cursor's line", () => {
    expect(hidden(decorations(doc, "Sec"))).toEqual([]);
  });
});

describe("links", () => {
  it("show only the link text away from the cursor", () => {
    const d = decorations("See [the docs](https://tauri.app).\n\nx", "x");
    expect(hidden(d)).toEqual(["[", "](https://tauri.app)"]);
    expect(d).toContainEqual(expect.objectContaining({ text: "the docs", kind: "mark", className: "cm-md-link" }));
  });
});

describe("blocks", () => {
  it("render lists, tasks and rules as widgets away from the cursor", () => {
    const d = decorations("- item\n- [ ] task\n\n---\n\nx", "x");
    expect(widgets(d)).toEqual(["BulletWidget", "CheckboxWidget", "RuleWidget"]);
  });

  it("render tables away from the cursor and show source inside", () => {
    const doc = "| a | b |\n| - | - |\n| 1 | 2 |\n\nx";
    expect(widgets(decorations(doc, "x"))).toEqual(["TableWidget"]);
    expect(widgets(decorations(doc, "| 1"))).toEqual([]);
  });

  it("render mermaid as a diagram, and as source + live preview when the cursor is inside", () => {
    const doc = "```mermaid\ngraph TD\n  A --> B\n```\n\nx";
    expect(widgets(decorations(doc, "x"))).toEqual(["MermaidWidget"]);

    const editing = decorations(doc, "graph");
    expect(widgets(editing)).toEqual(["MermaidWidget"]);
    expect(editing.find((d) => d.kind === "widget")!.text).toBe(""); // placed after the block, not replacing it
    expect(editing.filter((d) => d.className?.includes("cm-md-codeblock"))).toHaveLength(4);
  });
});
