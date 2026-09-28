import { StreamLanguage, StringStream } from "@codemirror/language";
import { Tag } from "@lezer/highlight";

// A lightweight Mermaid highlighter (there is no official CodeMirror mode).
// It is heuristic: it only needs to make diagram source easy to scan.

/** Arrows/edges get their own tag so they can be styled to stand out. */
export const mermaidArrow = Tag.define();

const DIAGRAMS =
  "flowchart graph sequenceDiagram classDiagram stateDiagram stateDiagram-v2 erDiagram gantt pie journey " +
  "gitGraph mindmap timeline quadrantChart requirementDiagram C4Context sankey-beta xychart-beta block-beta " +
  "packet-beta kanban architecture-beta";
const STATEMENTS =
  "subgraph end direction participant actor as note over left right of loop alt else opt par and critical " +
  "break rect activate deactivate autonumber title section class classDef style linkStyle click callback " +
  "state dateFormat axisFormat excludes includes todayMarker commit branch checkout merge accTitle accDescr";

const diagramWords = new Set(DIAGRAMS.split(" "));
const statementWords = new Set(STATEMENTS.split(" "));
const directions = new Set(["TB", "TD", "BT", "RL", "LR"]);

// Flowchart/state/class/ER edges (`-->`, `-.->`, `==>`, `--o`, `<-->`, `||--o{` …)
const EDGE = /^[<ox|}{*]*(?:--|==|-\.|\.-|~~~|\.\.)[-=.~]*[>ox|}{*]*/;
// Sequence diagram messages (`->>`, `-->>`, `-x`, `-)`, `->`)
const MESSAGE = /^-{1,2}(?:>>|[>x)])/;

interface State {
  afterColon: boolean;
}

function token(stream: StringStream, state: State): string | null {
  if (stream.sol()) state.afterColon = false;
  if (stream.eatSpace()) return null;

  if (state.afterColon) {
    stream.skipToEnd();
    return /^\s*-?\d+(\.\d+)?\s*$/.test(stream.current()) ? "number" : "string";
  }

  if (stream.match(/^%%.*/)) return "comment";
  if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
  if (stream.match(/^\|[^|\n]*\|/)) return "string"; // edge label: -->|text|
  if (stream.match(":::")) return "operator";
  if (stream.match(MESSAGE) || stream.match(EDGE)) return "arrow";

  // Node shapes with text: A[text], B(text), C{text}, D((text)), E[[text]] …
  if (stream.match(/^[[({]+(?:"[^"]*"|[^\])}\n])+[\])}]+/)) return "string";

  if (stream.match(":")) {
    state.afterColon = true;
    return "punctuation";
  }
  if (stream.match(/^\d+(\.\d+)?%?/)) return "number";

  const word = stream.match(/^[A-Za-z_][\w-]*/) as RegExpMatchArray | null;
  if (word) {
    // A `-` inside a word may really be the start of an arrow (`A-->B`).
    const text = word[0];
    const cut = text.search(/--|-\.|->/);
    if (cut > 0) stream.backUp(text.length - cut);
    const id = cut > 0 ? text.slice(0, cut) : text;
    if (diagramWords.has(id)) return "keyword";
    if (statementWords.has(id)) return "keyword";
    if (directions.has(id)) return "atom";
    return "variableName";
  }

  stream.next();
  return null;
}

export const mermaidLanguage = StreamLanguage.define<State>({
  name: "mermaid",
  startState: () => ({ afterColon: false }),
  copyState: (s) => ({ ...s }),
  token,
  tokenTable: { arrow: mermaidArrow },
  languageData: { commentTokens: { line: "%%" } },
});
