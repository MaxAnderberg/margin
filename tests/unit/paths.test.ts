import { describe, expect, it } from "vitest";
import { baseName, dirName, displayFolder, isAbsolute, relativeTo, resolveRelative } from "../../src/paths";

describe("resolveRelative", () => {
  it.each([
    ["/home/max/notes/a.md", "img/pic.png", "/home/max/notes/img/pic.png"],
    ["/home/max/notes/a.md", "./img/pic.png", "/home/max/notes/img/pic.png"],
    ["/home/max/notes/a.md", "../other.md", "/home/max/other.md"],
    ["/home/max/my notes/a.md", "my%20pic.png", "/home/max/my notes/my pic.png"],
    ["C:\\Users\\max\\notes\\a.md", "img/pic.png", "C:\\Users\\max\\notes\\img\\pic.png"],
    ["C:\\Users\\max\\notes\\a.md", "..\\other.md", "C:\\Users\\max\\other.md"],
  ])("%s + %s", (from, relative, expected) => {
    expect(resolveRelative(from, relative)).toBe(expected);
  });
});

describe("baseName", () => {
  it("handles both separators", () => {
    expect(baseName("/home/max/a.md")).toBe("a.md");
    expect(baseName("C:\\Users\\max\\a.md")).toBe("a.md");
    expect(baseName("a.md")).toBe("a.md");
  });
});

describe("isAbsolute", () => {
  it("recognises POSIX and Windows absolute paths", () => {
    expect(isAbsolute("/tmp/x.png")).toBe(true);
    expect(isAbsolute("D:/x.png")).toBe(true);
    expect(isAbsolute("C:\\x.png")).toBe(true);
    expect(isAbsolute("img/x.png")).toBe(false);
  });
});

describe("dirName", () => {
  it("handles both separators", () => {
    expect(dirName("/home/max/a.md")).toBe("/home/max");
    expect(dirName("C:\\Users\\max\\a.md")).toBe("C:\\Users\\max");
    expect(dirName("a.md")).toBe("");
  });
});

describe("relativeTo", () => {
  it.each([
    ["/notes", "/notes/a.md", "a.md"],
    ["/notes", "/notes/ideas/c.md", "ideas/c.md"],
    ["/notes/", "/notes/ideas/c.md", "ideas/c.md"],
    ["/notes", "/notes-old/a.md", null],
    ["/notes", "/other/a.md", null],
    ["C:\\Users\\max\\notes", "C:\\Users\\max\\notes\\ideas\\c.md", "ideas\\c.md"],
    ["C:\\Users\\max\\notes", "c:\\users\\MAX\\notes\\a.md", "a.md"],
    ["C:\\Users\\max\\notes", "C:\\Users\\max\\notes2\\a.md", null],
  ])("%s ∋ %s", (folder, path, expected) => {
    expect(relativeTo(folder, path)).toBe(expected);
  });
});

describe("displayFolder", () => {
  it.each([
    ["/home/max/work/plan.md", "/home/max", "~/work"],
    ["/home/max/plan.md", "/home/max", "~"],
    ["/home/max/plan.md", "/home/max/", "~"],
    ["/home/maxine/plan.md", "/home/max", "/home/maxine"],
    ["/srv/notes/plan.md", "/home/max", "/srv/notes"],
    ["/srv/notes/plan.md", null, "/srv/notes"],
    ["/plan.md", "/home/max", "/"],
    ["C:\\Users\\max\\notes\\todo.md", "C:\\Users\\max", "~\\notes"],
    ["D:\\notes\\todo.md", "C:\\Users\\max", "D:\\notes"],
  ])("%s (home %s)", (path, home, expected) => {
    expect(displayFolder(path, home)).toBe(expected);
  });
});
