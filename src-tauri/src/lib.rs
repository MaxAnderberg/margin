use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

/// The file passed on the command line (`margin notes.md`), if any.
/// Resolved to an absolute path; the file does not need to exist yet.
struct LaunchFile(Option<String>);

#[tauri::command]
fn launch_file(state: tauri::State<LaunchFile>) -> Option<String> {
    state.0.clone()
}

/// A file's modification time in milliseconds, or `None` if it doesn't exist.
/// The front end remembers this to notice when another program changes the file.
fn mtime_of(path: &Path) -> Option<u64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

#[derive(Serialize)]
struct FileContents {
    text: String,
    mtime: Option<u64>,
}

/// Reads a UTF-8 text file. A missing file reads as empty so that
/// `margin new-note.md` starts a fresh document at that path.
#[tauri::command]
fn read_file(path: String) -> Result<FileContents, String> {
    match fs::read_to_string(&path) {
        Ok(text) => Ok(FileContents {
            text,
            mtime: mtime_of(Path::new(&path)),
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(FileContents {
            text: String::new(),
            mtime: None,
        }),
        Err(e) => Err(format!("Could not read {path}: {e}")),
    }
}

#[tauri::command]
fn file_mtime(path: String) -> Option<u64> {
    mtime_of(Path::new(&path))
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum SaveError {
    /// The file changed on disk since `expected_mtime`; nothing was written.
    Conflict,
    Io {
        message: String,
    },
}

/// Saves `contents` to `path` and returns the file's new modification time.
///
/// Unless `force` is set, refuses with `Conflict` if the file was modified by
/// someone else since we last read or wrote it (its mtime differs from
/// `expected_mtime`). A file that was deleted meanwhile is simply recreated.
///
/// Writes atomically (temp file + rename) so a crash mid-save never leaves a
/// half-written document, keeps the original file's permissions, and writes
/// through symlinks instead of replacing them.
#[tauri::command]
fn write_file(
    path: String,
    contents: String,
    expected_mtime: Option<u64>,
    force: bool,
) -> Result<u64, SaveError> {
    let io = |what: &str, e: std::io::Error| SaveError::Io {
        message: format!("Could not {what} {path}: {e}"),
    };

    let requested = PathBuf::from(&path);
    let current = mtime_of(&requested);
    if !force && current.is_some() && current != expected_mtime {
        return Err(SaveError::Conflict);
    }

    let target = fs::canonicalize(&requested).unwrap_or(requested);
    let file_name = target
        .file_name()
        .ok_or_else(|| SaveError::Io {
            message: format!("Invalid file path: {path}"),
        })?
        .to_string_lossy()
        .into_owned();
    let tmp = target.with_file_name(format!(".{file_name}.margin-tmp"));

    fs::write(&tmp, contents).map_err(|e| io("write", e))?;
    if let Ok(meta) = fs::metadata(&target) {
        let _ = fs::set_permissions(&tmp, meta.permissions());
    }
    if let Err(e) = fs::rename(&tmp, &target) {
        let _ = fs::remove_file(&tmp);
        return Err(io("save", e));
    }
    mtime_of(&target).ok_or_else(|| SaveError::Io {
        message: format!("Saved {path} but could not read it back"),
    })
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    PathBuf::from(path).is_file()
}

/// The extensions Margin opens (the front end's `MD_FILTER`).
const MARKDOWN_EXTENSIONS: [&str; 5] = ["md", "markdown", "mdown", "mkd", "txt"];

/// The most files quick open lists from one folder tree.
const QUICK_OPEN_LIMIT: usize = 5000;

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            MARKDOWN_EXTENSIONS
                .iter()
                .any(|m| ext.eq_ignore_ascii_case(m))
        })
}

#[derive(Serialize, Debug, PartialEq)]
struct QuickOpenFiles {
    /// Markdown files under the folder, as absolute paths.
    files: Vec<String>,
    /// True when the folder held more files than `QUICK_OPEN_LIMIT`.
    truncated: bool,
    /// The recent files that still exist, in the order given.
    recent: Vec<String>,
    /// The user's home folder, so the front end can show `~`.
    home: Option<String>,
}

/// Lists Markdown files under `folder`, nearest first, up to `limit`.
///
/// Skips hidden folders and `node_modules`, and never follows a symlink to a
/// folder, so a link back up the tree can't loop. Unreadable folders are
/// skipped rather than failing the whole listing.
fn list_markdown_files(folder: &Path, limit: usize) -> (Vec<String>, bool) {
    let mut files = Vec::new();
    let mut queue = std::collections::VecDeque::from([folder.to_path_buf()]);
    while let Some(dir) = queue.pop_front() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let path = entry.path();
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if !name.starts_with('.') && name != "node_modules" {
                    queue.push_back(path);
                }
            } else if is_markdown(&path) && path.is_file() {
                // `is_file` follows file symlinks and drops dangling ones.
                if files.len() == limit {
                    return (files, true);
                }
                files.push(path.to_string_lossy().into_owned());
            }
        }
    }
    (files, false)
}

fn quick_open_listing(folder: Option<&Path>, recent: Vec<String>, limit: usize) -> QuickOpenFiles {
    let (files, truncated) = folder
        .map(|f| list_markdown_files(f, limit))
        .unwrap_or_default();
    QuickOpenFiles {
        files,
        truncated,
        recent: recent
            .into_iter()
            .filter(|p| Path::new(p).is_file())
            .collect(),
        home: std::env::home_dir().map(|h| h.to_string_lossy().into_owned()),
    }
}

/// Everything the quick open palette lists, in one round trip. Runs off the
/// main thread so a slow or huge folder can't freeze the window.
#[tauri::command]
async fn quick_open_files(
    folder: Option<String>,
    recent: Vec<String>,
) -> Result<QuickOpenFiles, String> {
    tauri::async_runtime::spawn_blocking(move || {
        quick_open_listing(folder.as_deref().map(Path::new), recent, QUICK_OPEN_LIMIT)
    })
    .await
    .map_err(|e| e.to_string())
}

fn resolve_launch_file() -> Option<String> {
    let arg = std::env::args().skip(1).find(|a| !a.starts_with('-'))?;
    let path = PathBuf::from(arg);
    let abs = if path.is_absolute() {
        path
    } else {
        std::env::current_dir().ok()?.join(path)
    };
    Some(abs.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(LaunchFile(resolve_launch_file()))
        .invoke_handler(tauri::generate_handler![
            launch_file,
            read_file,
            file_mtime,
            write_file,
            file_exists,
            quick_open_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running Margin");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    /// A fresh, empty directory for one test.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("margin-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(
        path: &Path,
        text: &str,
        expected: Option<u64>,
        force: bool,
    ) -> Result<u64, SaveError> {
        write_file(path.to_string_lossy().into(), text.into(), expected, force)
    }

    #[test]
    fn creates_a_new_file_and_reports_its_mtime() {
        let file = scratch("new").join("note.md");
        let mtime = write(&file, "hello", None, false).ok().unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "hello");
        assert_eq!(Some(mtime), mtime_of(&file));
    }

    #[test]
    fn saves_when_the_file_is_unchanged_on_disk() {
        let file = scratch("unchanged").join("note.md");
        let first = write(&file, "one", None, false).ok().unwrap();
        write(&file, "two", Some(first), false).ok().unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "two");
    }

    #[test]
    fn refuses_to_overwrite_a_file_changed_elsewhere() {
        let file = scratch("conflict").join("note.md");
        fs::write(&file, "theirs").unwrap();
        let stale = Some(1); // an mtime from long before the file's real one
        assert!(matches!(
            write(&file, "mine", stale, false),
            Err(SaveError::Conflict)
        ));
        assert_eq!(fs::read_to_string(&file).unwrap(), "theirs");
        // A file that appeared after we opened an empty path is also a conflict.
        assert!(matches!(
            write(&file, "mine", None, false),
            Err(SaveError::Conflict)
        ));
    }

    #[test]
    fn force_overwrites_despite_a_conflict() {
        let file = scratch("force").join("note.md");
        fs::write(&file, "theirs").unwrap();
        write(&file, "mine", Some(1), true).ok().unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "mine");
    }

    #[test]
    fn recreates_a_file_deleted_elsewhere() {
        let file = scratch("deleted").join("note.md");
        let mtime = write(&file, "one", None, false).ok().unwrap();
        fs::remove_file(&file).unwrap();
        write(&file, "two", Some(mtime), false).ok().unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "two");
    }

    #[test]
    fn keeps_permissions_and_symlinks() {
        let dir = scratch("links");
        let real = dir.join("real.md");
        let link = dir.join("link.md");
        fs::write(&real, "old").unwrap();
        fs::set_permissions(&real, fs::Permissions::from_mode(0o600)).unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();

        write(&link, "new", mtime_of(&link), false).ok().unwrap();

        assert!(fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(fs::read_to_string(&real).unwrap(), "new");
        assert_eq!(
            fs::metadata(&real).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert!(!dir.join(".real.md.margin-tmp").exists());
    }

    /// Creates `rel` (and its folders) under `dir` with some text.
    fn touch(dir: &Path, rel: &str) -> String {
        let path = dir.join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "x").unwrap();
        path.to_string_lossy().into_owned()
    }

    fn listed(dir: &Path) -> Vec<String> {
        let (files, _) = list_markdown_files(dir, QUICK_OPEN_LIMIT);
        let prefix = format!("{}/", dir.to_string_lossy());
        files
            .iter()
            .map(|f| f.strip_prefix(&prefix).unwrap().to_owned())
            .collect()
    }

    #[test]
    fn quick_open_lists_nested_markdown_nearest_first() {
        let dir = scratch("qo-nested");
        touch(&dir, "ideas/deep/c.md");
        touch(&dir, "ideas/b.markdown");
        touch(&dir, "a.md");
        touch(&dir, "Notes.TXT");
        assert_eq!(
            listed(&dir),
            ["Notes.TXT", "a.md", "ideas/b.markdown", "ideas/deep/c.md"]
        );
    }

    #[test]
    fn quick_open_ignores_other_files() {
        let dir = scratch("qo-other");
        touch(&dir, "a.md");
        touch(&dir, "photo.png");
        touch(&dir, "script.js");
        touch(&dir, "README");
        assert_eq!(listed(&dir), ["a.md"]);
    }

    #[test]
    fn quick_open_skips_hidden_and_dependency_folders() {
        let dir = scratch("qo-hidden");
        touch(&dir, "a.md");
        touch(&dir, ".git/notes.md");
        touch(&dir, "sub/.cache/x.md");
        touch(&dir, "node_modules/pkg/README.md");
        assert_eq!(listed(&dir), ["a.md"]);
    }

    #[test]
    fn quick_open_survives_a_symlink_loop() {
        let dir = scratch("qo-loop");
        touch(&dir, "sub/a.md");
        std::os::unix::fs::symlink(&dir, dir.join("sub/up")).unwrap();
        // A link to a file is listed; one to a missing file is not.
        std::os::unix::fs::symlink(dir.join("sub/a.md"), dir.join("link.md")).unwrap();
        std::os::unix::fs::symlink(dir.join("gone.md"), dir.join("dangling.md")).unwrap();
        assert_eq!(listed(&dir), ["link.md", "sub/a.md"]);
    }

    #[test]
    fn quick_open_stops_at_the_limit() {
        let dir = scratch("qo-limit");
        for i in 0..5 {
            touch(&dir, &format!("{i}.md"));
        }
        let (files, truncated) = list_markdown_files(&dir, 3);
        assert_eq!(files.len(), 3);
        assert!(truncated);
        let (files, truncated) = list_markdown_files(&dir, 5);
        assert_eq!(files.len(), 5);
        assert!(!truncated);
    }

    #[test]
    fn quick_open_drops_deleted_recents_and_keeps_order() {
        let dir = scratch("qo-recent");
        let b = touch(&dir, "b.md");
        let a = touch(&dir, "a.md");
        let gone = dir.join("gone.md").to_string_lossy().into_owned();
        let result = quick_open_listing(None, vec![b.clone(), gone, a.clone()], 10);
        assert_eq!(result.recent, [b, a]);
        assert!(result.files.is_empty());
        assert!(!result.truncated);
    }

    #[test]
    fn quick_open_without_a_folder_lists_only_recents() {
        let dir = scratch("qo-untitled");
        touch(&dir, "other.md");
        let a = touch(&dir, "a.md");
        let result = quick_open_listing(None, vec![a.clone()], 10);
        assert!(result.files.is_empty());
        assert_eq!(result.recent, [a]);
    }

    #[test]
    fn reads_a_missing_file_as_empty() {
        let file = scratch("missing").join("nope.md");
        let contents = read_file(file.to_string_lossy().into()).unwrap();
        assert_eq!(contents.text, "");
        assert_eq!(contents.mtime, None);
    }
}
