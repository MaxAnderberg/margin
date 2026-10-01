import { describe, expect, it } from "vitest";
import { AUTO, resolveTheme, THEMES } from "../../src/themes";

// WCAG relative luminance and contrast ratio for #rrggbb colors.
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255]
    .map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const HEX = /^#[0-9a-f]{6}$/i;
const COLOR_KEYS = Object.keys(THEMES[0].colors);

describe("theme definitions", () => {
  it("have unique ids", () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
  });

  it("include both light and dark themes", () => {
    expect(THEMES.some((t) => t.kind === "light")).toBe(true);
    expect(THEMES.some((t) => t.kind === "dark")).toBe(true);
  });

  it.each(THEMES.map((t) => [t.name, t] as const))("%s defines every color", (_, theme) => {
    expect(Object.keys(theme.colors).sort()).toEqual([...COLOR_KEYS].sort());
    for (const [key, value] of Object.entries(theme.colors)) {
      // selection is translucent so text stays readable underneath
      if (key === "selection") expect(value).toMatch(/^rgba\(/);
      else expect(value, key).toMatch(HEX);
    }
  });
});

describe("theme contrast (WCAG)", () => {
  // Reading text needs 4.5:1; headings, links and code tokens are large or
  // short and need 3:1; muted UI text (labels, word count) is decorative.
  const rules: [string, keyof (typeof THEMES)[0]["colors"], "bg" | "codeBg", number][] = [
    ["body text", "text", "bg", 4.5],
    ["quotes", "quote", "bg", 4.5],
    ["headings", "heading", "bg", 3],
    ["links", "accent", "bg", 3],
    ["muted text", "muted", "bg", 2.5],
    ["code keywords", "codeKeyword", "codeBg", 3],
    ["code strings", "codeString", "codeBg", 3],
    ["code numbers", "codeNumber", "codeBg", 3],
    ["code functions", "codeFunction", "codeBg", 3],
    ["code types", "codeType", "codeBg", 3],
    ["code properties", "codeProperty", "codeBg", 3],
  ];

  for (const theme of THEMES) {
    it.each(rules)(`${theme.name}: %s`, (_, fg, bg, min) => {
      expect(contrast(theme.colors[fg], theme.colors[bg])).toBeGreaterThanOrEqual(min);
    });
  }
});

describe("resolveTheme", () => {
  it("auto follows the system setting with the Margin pair", () => {
    expect(resolveTheme(AUTO, false).id).toBe("margin-light");
    expect(resolveTheme(AUTO, true).id).toBe("margin-dark");
  });

  it("returns a chosen theme regardless of the system setting", () => {
    expect(resolveTheme("gruvbox-dark", false).id).toBe("gruvbox-dark");
  });

  it("falls back to auto for an unknown id", () => {
    expect(resolveTheme("no-such-theme", true).id).toBe("margin-dark");
  });
});
