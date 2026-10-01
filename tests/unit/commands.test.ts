import { describe, expect, it } from "vitest";
import { insertFence, insertLink, setHeading, toggleInline, toggleTask } from "../../src/editor/commands";
import { run } from "./helpers";

// Notation: `|` is the cursor, `[…]` the selection.

describe("toggleInline", () => {
  const bold = toggleInline("**");

  it("wraps the selection", () => {
    expect(run(bold, "say [hi] now")).toBe("say **[hi]** now");
  });

  it("unwraps when the markers are just outside the selection", () => {
    expect(run(bold, "say **[hi]** now")).toBe("say [hi] now");
  });

  it("unwraps when the selection includes the markers", () => {
    expect(run(bold, "say [**hi**] now")).toBe("say [hi] now");
  });

  it("inserts an empty pair at a cursor", () => {
    expect(run(bold, "say |")).toBe("say **|**");
  });

  it("works for other markers", () => {
    expect(run(toggleInline("`"), "run [ls]")).toBe("run `[ls]`");
    expect(run(toggleInline("~~"), "[old]")).toBe("~~[old]~~");
  });
});

describe("setHeading", () => {
  it("turns a paragraph into a heading", () => {
    expect(run(setHeading(2), "Ti|tle")).toBe("## Ti|tle");
  });

  it("changes the level of an existing heading", () => {
    expect(run(setHeading(3), "# Ti|tle")).toBe("### Ti|tle");
  });

  it("toggles off when the level is the same", () => {
    expect(run(setHeading(2), "## Ti|tle")).toBe("Ti|tle");
  });

  it("level 0 makes a paragraph", () => {
    expect(run(setHeading(0), "#### Ti|tle")).toBe("Ti|tle");
  });

  it("applies to every selected line", () => {
    expect(run(setHeading(1), "[one\ntwo]")).toBe("# [one\n# two]");
  });
});

describe("toggleTask", () => {
  it("turns a plain line into a task", () => {
    expect(run(toggleTask, "buy |milk")).toBe("- [ ] buy |milk");
  });

  it("turns a bullet into a task", () => {
    expect(run(toggleTask, "- buy |milk")).toBe("- [ ] buy |milk");
  });

  it("checks and unchecks", () => {
    expect(run(toggleTask, "- [ ] buy |milk")).toBe("- [x] buy |milk");
    expect(run(toggleTask, "- [x] buy |milk")).toBe("- [ ] buy |milk");
  });

  it("keeps indentation", () => {
    expect(run(toggleTask, "  - [ ] nested|")).toBe("  - [x] nested|");
  });
});

describe("insertLink", () => {
  it("wraps text and puts the cursor in the URL", () => {
    expect(run(insertLink, "see [docs]")).toBe("see [docs](|)");
  });

  it("turns a selected URL into the target and puts the cursor in the text", () => {
    expect(run(insertLink, "[https://tauri.app]")).toBe("[|](https://tauri.app)");
  });
});

describe("insertFence", () => {
  it("inserts a fenced block with the placeholder selected", () => {
    expect(run(insertFence("mermaid", "graph TD"), "|")).toBe("```mermaid\n[graph TD]\n```\n");
  });

  it("starts on a new line when the cursor is mid-line", () => {
    expect(run(insertFence(""), "text|")).toBe("text\n```\n|\n```\n");
  });

  it("wraps selected lines", () => {
    expect(run(insertFence("js"), "[let a = 1]")).toBe("```js\n[let a = 1]\n```\n");
  });
});
