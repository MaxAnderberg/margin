use std::fs;
use std::path::PathBuf;

/// The file passed on the command line (`margin notes.md`), if any.
/// Resolved to an absolute path; the file does not need to exist yet.
struct LaunchFile(Option<String>);

#[tauri::command]
fn launch_file(state: tauri::State<LaunchFile>) -> Option<String> {
    state.0.clone()
}

/// Reads a UTF-8 text file. A missing file reads as empty so that
/// `margin new-note.md` starts a fresh document at that path.
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    match fs::read_to_string(&path) {
        Ok(text) => Ok(text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("Could not read {path}: {e}")),
    }
}

/// Writes atomically: write to a temp file next to the target, then rename,
/// so a crash mid-save never leaves a half-written document.
#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let file_name = target
        .file_name()
        .ok_or_else(|| format!("Invalid file path: {path}"))?
        .to_string_lossy()
        .into_owned();
    let tmp = target.with_file_name(format!(".{file_name}.margin-tmp"));
    fs::write(&tmp, contents).map_err(|e| format!("Could not write {path}: {e}"))?;
    fs::rename(&tmp, &target).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Could not save {path}: {e}")
    })
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    PathBuf::from(path).is_file()
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
        .invoke_handler(tauri::generate_handler![launch_file, read_file, write_file, file_exists])
        .run(tauri::generate_context!())
        .expect("error while running Margin");
}
