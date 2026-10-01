import { EditorSelection, EditorState, Transaction, type Extension, type TransactionSpec } from "@codemirror/state";
import type { Command, EditorView } from "@codemirror/view";

/**
 * Builds an editor state from text with a selection marker:
 * `|` is a cursor, `[…]` a selection. E.g. "say [hi]" or "a |b".
 */
export function stateFrom(marked: string, extensions: Extension = []) {
  const cursor = marked.indexOf("|");
  let doc: string;
  let selection: EditorSelection;
  if (cursor >= 0) {
    doc = marked.slice(0, cursor) + marked.slice(cursor + 1);
    selection = EditorSelection.single(cursor);
  } else {
    const from = marked.indexOf("[");
    const to = marked.indexOf("]", from) - 1;
    if (from < 0 || to < from) throw new Error(`no selection marker in ${JSON.stringify(marked)}`);
    doc = marked.slice(0, from) + marked.slice(from + 1, to + 1) + marked.slice(to + 2);
    selection = EditorSelection.single(from, to);
  }
  return EditorState.create({ doc, selection, extensions });
}

/** Renders a state back to the marker notation used by `stateFrom`. */
export function marked(state: EditorState): string {
  const { from, to, empty } = state.selection.main;
  const doc = state.doc.toString();
  if (empty) return doc.slice(0, from) + "|" + doc.slice(from);
  return doc.slice(0, from) + "[" + doc.slice(from, to) + "]" + doc.slice(to);
}

/** Runs a command against a minimal stand-in for EditorView (commands only use state + dispatch). */
export function run(command: Command, input: string): string {
  const view = {
    state: stateFrom(input),
    dispatch(...specs: (Transaction | TransactionSpec)[]) {
      const tr = specs[0] instanceof Transaction ? specs[0] : this.state.update(...(specs as TransactionSpec[]));
      this.state = tr.state;
    },
  };
  command(view as unknown as EditorView);
  return marked(view.state);
}
