import { EditorSelection, Transaction } from "@codemirror/state";
import type { Command } from "@codemirror/view";

/** Wraps each selection in `marker` (e.g. `**`), or unwraps it if already wrapped. */
export function toggleInline(marker: string): Command {
  const n = marker.length;
  return (view) => {
    const { state } = view;
    const tr = state.changeByRange((range) => {
      const before = state.sliceDoc(range.from - n, range.from);
      const after = state.sliceDoc(range.to, range.to + n);
      if (before === marker && after === marker) {
        return {
          changes: [
            { from: range.from - n, to: range.from },
            { from: range.to, to: range.to + n },
          ],
          range: EditorSelection.range(range.from - n, range.to - n),
        };
      }
      const text = state.sliceDoc(range.from, range.to);
      if (text.length >= 2 * n && text.startsWith(marker) && text.endsWith(marker)) {
        return {
          changes: { from: range.from, to: range.to, insert: text.slice(n, -n) },
          range: EditorSelection.range(range.from, range.to - 2 * n),
        };
      }
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        range: EditorSelection.range(range.from + n, range.to + n),
      };
    });
    view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

/** Sets selected lines to heading `level` (0 = paragraph). Same level toggles off. */
export function setHeading(level: number): Command {
  return (view) => {
    const { state } = view;
    const changes: { from: number; to: number; insert: string }[] = [];
    const seen = new Set<number>();
    for (const range of state.selection.ranges) {
      for (let pos = range.from; pos <= range.to; ) {
        const line = state.doc.lineAt(pos);
        if (!seen.has(line.number)) {
          seen.add(line.number);
          const m = /^(#{1,6})\s+/.exec(line.text);
          const current = m ? m[1].length : 0;
          const target = current === level ? 0 : level;
          changes.push({
            from: line.from,
            to: line.from + (m ? m[0].length : 0),
            insert: target ? "#".repeat(target) + " " : "",
          });
        }
        pos = line.to + 1;
      }
    }
    view.dispatch({ changes, scrollIntoView: true, userEvent: "input" });
    return true;
  };
}

/** Inserts a Markdown link around the selection. A selected URL becomes the target. */
export const insertLink: Command = (view) => {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    if (/^(https?:\/\/|mailto:)\S+$/.test(text)) {
      return {
        changes: { from: range.from, to: range.to, insert: `[](${text})` },
        range: EditorSelection.cursor(range.from + 1),
      };
    }
    const insert = `[${text}]()`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length - 1),
    };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

/** Inserts a fenced block (```lang) around the selection or at the cursor. */
export function insertFence(lang: string, placeholder = ""): Command {
  return (view) => {
    const { state } = view;
    const range = state.selection.main;
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);
    const body = range.empty ? placeholder : state.sliceDoc(startLine.from, endLine.to);
    const from = range.empty ? range.from : startLine.from;
    const to = range.empty ? range.to : endLine.to;
    const prefix = from > 0 && state.sliceDoc(from - 1, from) !== "\n" ? "\n" : "";
    const insert = `${prefix}\`\`\`${lang}\n${body}\n\`\`\`\n`;
    const bodyStart = from + prefix.length + 4 + lang.length;
    view.dispatch({
      changes: { from, to, insert },
      selection: EditorSelection.range(bodyStart, bodyStart + body.length),
      scrollIntoView: true,
      userEvent: "input",
    });
    return true;
  };
}

/** Toggles `- [ ]` / `- [x]` on the current lines, turning plain lines into tasks. */
export const toggleTask: Command = (view) => {
  const { state } = view;
  const changes: { from: number; to: number; insert: string }[] = [];
  const seen = new Set<number>();
  for (const range of state.selection.ranges) {
    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos);
      if (!seen.has(line.number)) {
        seen.add(line.number);
        const task = /^(\s*[-*+]\s+)\[([ xX])\]/.exec(line.text);
        const item = /^(\s*)([-*+]\s+)?/.exec(line.text)!;
        if (task) {
          const at = line.from + task[1].length + 1;
          changes.push({ from: at, to: at + 1, insert: task[2] === " " ? "x" : " " });
        } else {
          const at = line.from + item[0].length;
          changes.push({ from: line.from + item[1].length, to: at, insert: "- [ ] " });
        }
      }
      pos = line.to + 1;
    }
  }
  view.dispatch({ changes, userEvent: "input", annotations: Transaction.addToHistory.of(true) });
  return true;
};
