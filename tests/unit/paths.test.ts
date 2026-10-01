import { describe, expect, it } from "vitest";
import { baseName, isAbsolute, resolveRelative } from "../../src/paths";

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
