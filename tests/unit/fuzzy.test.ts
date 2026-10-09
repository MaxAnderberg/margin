import { describe, expect, it } from "vitest";
import { fuzzyMatch, rankFiles } from "../../src/fuzzy";

const file = (key: string, recent = Infinity) => ({ key, recent });
const keys = (query: string, items: { key: string; recent: number }[]) =>
  rankFiles(items, query).map((r) => r.item.key);

describe("fuzzyMatch", () => {
  it("matches characters in order, not necessarily together", () => {
    expect(fuzzyMatch("qkop", "todo/quick-open.md")).not.toBeNull();
    expect(fuzzyMatch("tqo", "todo/quick-open.md")).not.toBeNull();
    expect(fuzzyMatch("poq", "todo/quick-open.md")).toBeNull();
  });

  it("ignores case", () => {
    expect(fuzzyMatch("readme", "README.md")).not.toBeNull();
    expect(fuzzyMatch("README", "readme.md")).not.toBeNull();
  });

  it("needs every space-separated part, in order", () => {
    expect(fuzzyMatch("ideas c", "ideas/c.md")).not.toBeNull();
    expect(fuzzyMatch("ideas c", "c.md")).toBeNull();
    expect(fuzzyMatch("t qo", "todo/quick-open.md")).not.toBeNull();
    expect(fuzzyMatch("md todo", "todo/quick-open.md")).toBeNull();
  });

  it("does not match text that is absent", () => {
    expect(fuzzyMatch("xyz", "notes/plan.md")).toBeNull();
  });

  it("reports the matched positions for highlighting", () => {
    expect(fuzzyMatch("plan", "notes/plan.md")!.positions).toEqual([6, 7, 8, 9]);
    // Prefers the run in the file name over scattered letters in the folder.
    expect(fuzzyMatch("qo", "quiet/quick-open.md")!.positions).toEqual([6, 12]);
  });

  it("matches everything with an empty query", () => {
    expect(fuzzyMatch("", "a.md")).toEqual({ score: 0, positions: [] });
    expect(fuzzyMatch("   ", "a.md")).toEqual({ score: 0, positions: [] });
  });

  it("handles Windows separators", () => {
    const match = fuzzyMatch("c", "ideas\\c.md")!;
    expect(match.positions).toEqual([6]);
  });
});

describe("rankFiles", () => {
  it("ranks a file-name match above a folder match", () => {
    expect(keys("plan", [file("plan/notes.md"), file("plan.md")])).toEqual(["plan.md", "plan/notes.md"]);
  });

  it("ranks word starts and runs above scattered letters", () => {
    expect(keys("qo", [file("aquaoo.md"), file("quick-open.md")])[0]).toBe("quick-open.md");
    expect(keys("note", [file("anotherone.md"), file("notes.md")])[0]).toBe("notes.md");
  });

  it("breaks ties by recency, then by path", () => {
    expect(keys("a", [file("b/a.md"), file("c/a.md", 1), file("d/a.md", 0)])).toEqual([
      "d/a.md",
      "c/a.md",
      "b/a.md",
    ]);
  });

  it("drops non-matches", () => {
    expect(keys("zz", [file("a.md"), file("b.md")])).toEqual([]);
  });

  it("with an empty query lists recents by recency, then the rest by path", () => {
    const items = [file("a.md"), file("x.md", 1), file("ideas/b.md"), file("y.md", 0), file("B2.md"), file("b10.md")];
    expect(keys("", items)).toEqual(["y.md", "x.md", "a.md", "B2.md", "b10.md", "ideas/b.md"]);
  });
});
