// Color themes. Each theme is a set of CSS variables applied to :root,
// so switching is instant and everything (editor, diagrams, UI) follows.

export interface Theme {
  id: string;
  name: string;
  kind: "light" | "dark";
  colors: {
    bg: string;
    text: string;
    heading: string;
    muted: string;
    faintText: string;
    rule: string;
    accent: string;
    quote: string;
    codeBg: string;
    panel: string;
    selection: string;
    danger: string;
    codeKeyword: string;
    codeString: string;
    codeNumber: string;
    codeFunction: string;
    codeType: string;
    codeProperty: string;
  };
}

export const THEMES: Theme[] = [
  {
    id: "margin-light",
    name: "Margin Light",
    kind: "light",
    colors: {
      bg: "#fbfaf7", text: "#25241f", heading: "#25241f", muted: "#8d897e", faintText: "#b9b4a8",
      rule: "#e6e2d8", accent: "#33679f", quote: "#5f5b52", codeBg: "#f2efe8", panel: "#f4f2ec",
      selection: "rgba(51, 103, 159, 0.17)", danger: "#b5463b",
      codeKeyword: "#8a3f9e", codeString: "#3e7a3a", codeNumber: "#a4561c",
      codeFunction: "#2d63a8", codeType: "#9a6b10", codeProperty: "#2f6f7a",
    },
  },
  {
    id: "margin-dark",
    name: "Margin Dark",
    kind: "dark",
    colors: {
      bg: "#1a1b1e", text: "#dddad2", heading: "#dddad2", muted: "#86837b", faintText: "#5d5b56",
      rule: "#303136", accent: "#82abdb", quote: "#a9a59b", codeBg: "#232428", panel: "#202125",
      selection: "rgba(130, 171, 219, 0.24)", danger: "#e0786d",
      codeKeyword: "#c792df", codeString: "#9ccc88", codeNumber: "#e7a268",
      codeFunction: "#82b1e8", codeType: "#e3c07a", codeProperty: "#7fc6cf",
    },
  },
  {
    id: "github-light",
    name: "GitHub Light",
    kind: "light",
    colors: {
      bg: "#ffffff", text: "#1f2328", heading: "#1f2328", muted: "#59636e", faintText: "#8c959f",
      rule: "#d1d9e0", accent: "#0969da", quote: "#59636e", codeBg: "#f6f8fa", panel: "#f6f8fa",
      selection: "rgba(9, 105, 218, 0.18)", danger: "#d1242f",
      codeKeyword: "#cf222e", codeString: "#0a3069", codeNumber: "#0550ae",
      codeFunction: "#8250df", codeType: "#953800", codeProperty: "#0550ae",
    },
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    kind: "dark",
    colors: {
      bg: "#0d1117", text: "#e6edf3", heading: "#f0f6fc", muted: "#9198a1", faintText: "#656c76",
      rule: "#30363d", accent: "#4493f8", quote: "#9198a1", codeBg: "#151b23", panel: "#151b23",
      selection: "rgba(68, 147, 248, 0.25)", danger: "#f85149",
      codeKeyword: "#ff7b72", codeString: "#a5d6ff", codeNumber: "#79c0ff",
      codeFunction: "#d2a8ff", codeType: "#ffa657", codeProperty: "#79c0ff",
    },
  },
  {
    id: "catppuccin-latte",
    name: "Catppuccin Latte",
    kind: "light",
    colors: {
      bg: "#eff1f5", text: "#4c4f69", heading: "#8839ef", muted: "#8c8fa1", faintText: "#acb0be",
      rule: "#ccd0da", accent: "#1e66f5", quote: "#5c5f77", codeBg: "#e6e9ef", panel: "#e6e9ef",
      selection: "rgba(114, 135, 253, 0.2)", danger: "#d20f39",
      // Green/peach/yellow darkened from the official Latte palette so code
      // stays readable on the pale background (official values: #40a02b,
      // #fe640b, #df8e1d fall below 3:1 contrast).
      codeKeyword: "#8839ef", codeString: "#2f7d20", codeNumber: "#c24a0a",
      codeFunction: "#1e66f5", codeType: "#a2650c", codeProperty: "#179299",
    },
  },
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    kind: "dark",
    colors: {
      bg: "#1e1e2e", text: "#cdd6f4", heading: "#cba6f7", muted: "#7f849c", faintText: "#585b70",
      rule: "#313244", accent: "#89b4fa", quote: "#a6adc8", codeBg: "#181825", panel: "#181825",
      selection: "rgba(180, 190, 254, 0.2)", danger: "#f38ba8",
      codeKeyword: "#cba6f7", codeString: "#a6e3a1", codeNumber: "#fab387",
      codeFunction: "#89b4fa", codeType: "#f9e2af", codeProperty: "#94e2d5",
    },
  },
  {
    id: "gruvbox-light",
    name: "Gruvbox Light",
    kind: "light",
    colors: {
      bg: "#fbf1c7", text: "#3c3836", heading: "#af3a03", muted: "#7c6f64", faintText: "#a89984",
      rule: "#d5c4a1", accent: "#076678", quote: "#665c54", codeBg: "#f2e5bc", panel: "#f2e5bc",
      selection: "rgba(7, 102, 120, 0.18)", danger: "#9d0006",
      codeKeyword: "#9d0006", codeString: "#79740e", codeNumber: "#8f3f71",
      codeFunction: "#427b58", codeType: "#b57614", codeProperty: "#076678",
    },
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    kind: "dark",
    colors: {
      bg: "#282828", text: "#ebdbb2", heading: "#fabd2f", muted: "#a89984", faintText: "#665c54",
      rule: "#3c3836", accent: "#83a598", quote: "#bdae93", codeBg: "#32302f", panel: "#32302f",
      selection: "rgba(131, 165, 152, 0.25)", danger: "#fb4934",
      codeKeyword: "#fb4934", codeString: "#b8bb26", codeNumber: "#d3869b",
      codeFunction: "#8ec07c", codeType: "#fabd2f", codeProperty: "#83a598",
    },
  },
  {
    id: "monokai",
    name: "Monokai",
    kind: "dark",
    colors: {
      bg: "#272822", text: "#f8f8f2", heading: "#a6e22e", muted: "#90908a", faintText: "#5f5e56",
      rule: "#3e3d32", accent: "#66d9ef", quote: "#cfcfc2", codeBg: "#1e1f1c", panel: "#1e1f1c",
      selection: "rgba(248, 248, 242, 0.14)", danger: "#f92672",
      codeKeyword: "#f92672", codeString: "#e6db74", codeNumber: "#ae81ff",
      codeFunction: "#a6e22e", codeType: "#66d9ef", codeProperty: "#fd971f",
    },
  },
];

/** "auto" follows the system light/dark setting using the Margin pair. */
export const AUTO = "auto";

export function findTheme(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

export function resolveTheme(pref: string, systemDark: boolean): Theme {
  if (pref !== AUTO) {
    const theme = findTheme(pref);
    if (theme) return theme;
  }
  return findTheme(systemDark ? "margin-dark" : "margin-light")!;
}

const toCssVar = (key: string) => "--" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

export function applyThemeVars(theme: Theme) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) root.style.setProperty(toCssVar(key), value);
  root.style.setProperty("--check", theme.colors.accent);
  root.style.colorScheme = theme.kind;
  root.dataset.theme = theme.id;
  root.dataset.kind = theme.kind;
}
