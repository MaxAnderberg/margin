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

/** The folder part of `path`, without a trailing separator. */
export const dirName = (path: string) => path.slice(0, Math.max(0, lastSeparator(path)));

/** A folder path for comparison: no trailing separator, and case- and separator-insensitive on Windows. */
function comparable(path: string, windows: boolean): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  return windows ? trimmed.toLowerCase().replace(/\//g, "\\") : trimmed;
}

/** `path` relative to `folder`, e.g. `ideas/c.md`, or `null` if it is not inside it. */
export function relativeTo(folder: string, path: string): string | null {
  const windows = WINDOWS_ABSOLUTE.test(folder);
  const f = comparable(folder, windows);
  const p = comparable(path, windows);
  if (p.length <= f.length || !p.startsWith(f) || !/[\\/]/.test(p.charAt(f.length))) return null;
  return path.slice(f.length + 1);
}

/** The folder of `path` for display, with the home folder shortened to `~`. */
export function displayFolder(path: string, home: string | null): string {
  const dir = dirName(path) || path.charAt(0);
  if (home) {
    const windows = WINDOWS_ABSOLUTE.test(home);
    const h = comparable(home, windows);
    if (comparable(dir, windows) === h) return "~";
    if (relativeTo(home, dir) !== null) return "~" + dir.slice(h.length);
  }
  return dir;
}
