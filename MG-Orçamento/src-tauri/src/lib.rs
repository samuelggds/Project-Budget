#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    {
        let mut updater = tauri_plugin_updater::Builder::new();
        if let Some(public_key) = option_env!("TAURI_UPDATER_PUBLIC_KEY") {
            if !public_key.trim().is_empty() {
                updater = updater.pubkey(public_key);
            }
        }
        builder = builder.plugin(updater.build());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
