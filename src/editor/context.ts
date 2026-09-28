import { Facet, StateEffect } from "@codemirror/state";

/** Absolute path of the open document (null for an unsaved new document).
 *  Used to resolve relative image paths. */
export const docPath = Facet.define<string | null, string | null>({
  combine: (values) => values[0] ?? null,
});

/** Effective color theme, so diagrams can match it. */
export const colorTheme = Facet.define<"light" | "dark", "light" | "dark">({
  combine: (values) => values[0] ?? "light",
});

/** Dispatched to force live-preview decorations to rebuild. */
export const refreshPreview = StateEffect.define<null>();
