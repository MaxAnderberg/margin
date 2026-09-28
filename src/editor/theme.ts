import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// Colors come from CSS variables (see styles.css) so light/dark switch instantly.

export const markdownHighlight = HighlightStyle.define([
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "650" },
  { tag: t.strikethrough, textDecoration: "line-through", color: "var(--muted)" },
  { tag: t.link, color: "var(--accent)" },
  { tag: t.url, color: "var(--muted)" },
  { tag: t.monospace, fontFamily: "var(--font-mono)", fontSize: "0.88em" },
  { tag: [t.processingInstruction, t.contentSeparator, t.labelName], color: "var(--faint-text)" },
  { tag: t.quote, color: "var(--quote)" },
  { tag: t.heading, fontWeight: "680" },

  // Code blocks
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword], color: "var(--code-keyword)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--code-string)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--code-number)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--muted)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--code-function)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--code-type)" },
  { tag: [t.propertyName, t.attributeName], color: "var(--code-property)" },
  { tag: [t.meta, t.tagName], color: "var(--code-keyword)" },
]);

export const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", color: "var(--text)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-text)",
    lineHeight: "1.72",
    overflowX: "hidden",
  },
  ".cm-content": {
    caretColor: "var(--accent)",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeft: "2px solid var(--accent)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
    { backgroundColor: "var(--selection) !important" },
  ".cm-placeholder": { color: "var(--faint-text)", fontStyle: "italic" },
  ".cm-searchMatch": { backgroundColor: "var(--search-match)", borderRadius: "2px" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--search-current)" },
  ".cm-panels": {
    backgroundColor: "var(--panel)",
    color: "var(--text)",
    fontFamily: "var(--font-ui)",
  },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--rule)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--rule)" },
});
