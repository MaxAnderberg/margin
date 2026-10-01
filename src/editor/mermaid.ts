import { findTheme, THEMES } from "../themes";

// Mermaid is large, so it is loaded lazily the first time a diagram appears.
type Mermaid = typeof import("mermaid").default;

let mermaidPromise: Promise<Mermaid> | null = null;
let configuredTheme: string | null = null;
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

const cache = new Map<string, string>();
const CACHE_LIMIT = 64;

function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import("mermaid").then((m) => m.default);
  return mermaidPromise;
}

/** Mermaid's "base" theme derives its whole palette from a few colors,
 *  so diagrams pick up the editor theme's personality. */
function themeVariables(themeId: string) {
  const theme = findTheme(themeId) ?? THEMES[0];
  const c = theme.colors;
  return {
    darkMode: theme.kind === "dark",
    background: c.bg,
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif",
    primaryColor: c.codeBg,
    primaryTextColor: c.text,
    primaryBorderColor: c.accent,
    secondaryColor: c.panel,
    tertiaryColor: c.bg,
    lineColor: c.muted,
    textColor: c.text,
    mainBkg: c.codeBg,
    nodeBorder: c.accent,
    clusterBkg: c.panel,
    clusterBorder: c.rule,
    edgeLabelBackground: c.bg,
    titleColor: c.heading,
    noteBkgColor: c.panel,
    noteTextColor: c.text,
    noteBorderColor: c.rule,
    actorBkg: c.codeBg,
    actorBorder: c.accent,
    actorTextColor: c.text,
    actorLineColor: c.muted,
    signalColor: c.text,
    signalTextColor: c.text,
    labelBoxBkgColor: c.codeBg,
    labelBoxBorderColor: c.accent,
    labelTextColor: c.text,
    loopTextColor: c.text,
    activationBkgColor: c.panel,
    activationBorderColor: c.accent,
  };
}

/** An already rendered diagram, if there is one (lets widgets paint it synchronously). */
export function cachedMermaid(source: string, themeId: string): string | undefined {
  return cache.get(`${themeId}\n${source}`);
}

/** Renders a Mermaid diagram to an SVG string. Renders are serialized because
 *  mermaid keeps global state, and results are cached by theme + source. */
export function renderMermaid(source: string, themeId: string): Promise<string> {
  const key = `${themeId}\n${source}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  const job = queue.then(async () => {
    const mermaid = await loadMermaid();
    if (configuredTheme !== themeId) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        themeVariables: themeVariables(themeId),
        fontFamily: "Inter Variable, Inter, system-ui, sans-serif",
      });
      configuredTheme = themeId;
    }
    // parse() throws on invalid input without leaving error nodes in the DOM.
    await mermaid.parse(source);
    const { svg } = await mermaid.render(`margin-mermaid-${counter++}`, source);
    cache.set(key, svg);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    return svg;
  });
  queue = job.catch(() => undefined);
  return job;
}
