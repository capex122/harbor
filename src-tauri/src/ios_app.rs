#[tauri::mobile_entry_point]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_harbor_mpv::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            crate::stremio_auth::stremio_auth_start
        ])
        .run(tauri::generate_context!())
        .expect("error while running Harbor on iOS");
}
