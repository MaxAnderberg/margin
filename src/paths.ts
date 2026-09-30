// Path helpers that work with both "/" and Windows "\" separators.

const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;

const lastSeparator = (path: string) => Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));

export const baseName = (path: string) => path.slice(lastSeparator(path) + 1);

export const isAbsolute = (path: string) => path.startsWith("/") || WINDOWS_ABSOLUTE.test(path);

/** Resolves `relative` (e.g. `img/a.png`, `../notes.md`, URL-encoded) against the folder of the file `from`. */
export function resolveRelative(from: string, relative: string): string {
  const windows = WINDOWS_ABSOLUTE.test(from);
  const dir = from.slice(0, lastSeparator(from) + 1).replace(/\\/g, "/").replace(/^\//, "");
  const path = decodeURIComponent(new URL(relative, "file:///" + dir).pathname);
  return windows ? path.replace(/^\//, "").replace(/\//g, "\\") : path;
}
