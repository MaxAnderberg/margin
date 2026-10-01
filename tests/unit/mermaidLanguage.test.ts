import { highlightTree, tagHighlighter, tags } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { mermaidArrow, mermaidLanguage } from "../../src/editor/mermaidLanguage";

const highlighter = tagHighlighter([
  { tag: tags.keyword, class: "keyword" },
  { tag: mermaidArrow, class: "arrow" },
  { tag: tags.string, class: "string" },
  { tag: tags.comment, class: "comment" },
  { tag: tags.atom, class: "atom" },
  { tag: tags.number, class: "number" },
]);

/** Returns [text, class] pairs for every highlighted token. */
function tokens(source: string) {
  const out: [string, string][] = [];
  highlightTree(mermaidLanguage.parser.parse(source), highlighter, (from, to, cls) =>
    out.push([source.slice(from, to), cls]),
  );
  return out;
}

describe("mermaid highlighting", () => {
  it("flowchart: keyword, direction, node text and arrows", () => {
    const t = tokens("flowchart LR\n  A[Write] --> B{Happy?}");
    expect(t).toContainEqual(["flowchart", "keyword"]);
    expect(t).toContainEqual(["LR", "atom"]);
    expect(t).toContainEqual(["[Write]", "string"]);
    expect(t).toContainEqual(["{Happy?}", "string"]);
    expect(t).toContainEqual(["-->", "arrow"]);
  });

  it("splits arrows from node ids written without spaces", () => {
    expect(tokens("graph TD\nA-->B")).toContainEqual(["-->", "arrow"]);
  });

  it("edge labels", () => {
    expect(tokens("A -->|yes| B")).toContainEqual(["|yes|", "string"]);
  });

  it("sequence diagrams: participants, messages and text", () => {
    const t = tokens("sequenceDiagram\n  participant You\n  You->>Disk: save it");
    expect(t).toContainEqual(["sequenceDiagram", "keyword"]);
    expect(t).toContainEqual(["participant", "keyword"]);
    expect(t).toContainEqual(["->>", "arrow"]);
    expect(t).toContainEqual(["save it", "string"]);
  });

  it("comments", () => {
    expect(tokens("%% a note\ngraph TD")).toContainEqual(["%% a note", "comment"]);
  });

  it("numbers after a colon (pie charts)", () => {
    expect(tokens('pie\n  "Dogs" : 386')).toContainEqual(["386", "number"]);
  });

  it("keeps hyphenated names whole", () => {
    expect(tokens("stateDiagram-v2")).toContainEqual(["stateDiagram-v2", "keyword"]);
    expect(tokens("my-node --> other").filter(([, c]) => c === "arrow")).toEqual([["-->", "arrow"]]);
  });
});
