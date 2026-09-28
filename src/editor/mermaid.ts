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

/** Renders a Mermaid diagram to an SVG string. Renders are serialized because
 *  mermaid keeps global state, and results are cached by theme + source. */
export function renderMermaid(source: string, theme: "light" | "dark"): Promise<string> {
  const key = `${theme}\n${source}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);

  const job = queue.then(async () => {
    const mermaid = await loadMermaid();
    if (configuredTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: theme === "dark" ? "dark" : "neutral",
        fontFamily: "Inter Variable, Inter, system-ui, sans-serif",
      });
      configuredTheme = theme;
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
