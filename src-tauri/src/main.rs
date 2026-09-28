// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // On NVIDIA with Wayland, WebKitGTK's DMA-BUF renderer crashes with
    // "Error 71 (Protocol error) dispatching to Wayland display" because of
    // the driver's explicit sync. Turning explicit sync off avoids the crash
    // and keeps the fast renderer; disabling DMA-BUF instead makes scrolling
    // choppy. Set WEBKIT_DISABLE_DMABUF_RENDERER=1 to fall back if needed.
    #[cfg(target_os = "linux")]
    if std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none() {
        // SAFETY: called at startup before any other threads exist.
        unsafe { std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1") };
    }

    margin_lib::run()
}
