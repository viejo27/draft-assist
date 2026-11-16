mod commands;
mod lcu;
mod persistence;

use draft_engine::Engine;
use draft_engine::data::GameData;
use lcu::LcuRuntime;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub struct RuntimeState {
    pub engine: Mutex<Engine>,
    pub data_dir: std::path::PathBuf,
    pub warnings: Vec<String>,
    pub lcu: Arc<LcuRuntime>,
}

/// Copies the state and editable data from the old identifier folder once.
/// Best effort: a failed migration must never prevent the app from starting.
fn migrate_legacy_data(app: &tauri::App) {
    let Ok(base) = app.path().data_dir() else {
        return;
    };
    let old_dir = base.join("com.elviejo27.draftlol");
    let Ok(new_dir) = app.path().app_data_dir() else {
        return;
    };
    if !old_dir.exists() || old_dir == new_dir {
        return;
    }

    let _ = std::fs::create_dir_all(&new_dir);

    let old_state = old_dir.join("state.json");
    let new_state = new_dir.join("state.json");
    if old_state.exists() && !new_state.exists() {
        let _ = std::fs::copy(&old_state, &new_state);
    }

    let old_data = old_dir.join("data");
    let new_data = new_dir.join("data");
    if old_data.exists() {
        let _ = std::fs::create_dir_all(&new_data);
        if let Ok(entries) = std::fs::read_dir(&old_data) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                if let Some(name) = path.file_name() {
                    let target = new_data.join(name);
                    if !target.exists() {
                        let _ = std::fs::copy(&path, &target);
                    }
                }
            }
        }
    }
}

/// Updates the template label in the editable data folder created by older
/// versions. The embedded data is already correct; this fixes existing installs.
fn migrate_template_labels(data_dir: &Path) {
    let path = data_dir.join("data").join("templates.json");
    let Ok(content) = std::fs::read_to_string(&path) else {
        return;
    };
    if !content.contains("\"Competitivo / Clash\"") {
        return;
    }
    let updated = content.replace("\"Competitivo / Clash\"", "\"Competitivo\"");
    let _ = std::fs::write(&path, updated);
}

pub fn load_engine(data_dir: &Path) -> Result<(Engine, Vec<String>), String> {
    let data_path = data_dir.join("data");
    let mut warnings = Vec::new();

    if let Err(error) = GameData::ensure_defaults(&data_path) {
        warnings.push(format!(
            "No se pudo preparar la carpeta de datos editables: {error}"
        ));
    }

    match Engine::from_paths(&data_path) {
        Ok(engine) => {
            warnings.extend(engine.data().validate().warnings);
            Ok((engine, warnings))
        }
        Err(error) => {
            warnings.push(format!(
                "Los datos editables no son válidos ({error}). Se usan los datos embebidos."
            ));
            let engine = Engine::embedded().map_err(|error| error.to_string())?;
            Ok((engine, warnings))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            migrate_legacy_data(app);
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            std::fs::create_dir_all(&data_dir)?;
            migrate_template_labels(&data_dir);
            if let Some(window) = app.get_webview_window("main")
                && let Some(icon) = app.default_window_icon().cloned()
            {
                let _ = window.set_icon(icon);
            }
            let (engine, warnings) = load_engine(&data_dir).map_err(std::io::Error::other)?;
            app.manage(RuntimeState {
                engine: Mutex::new(engine),
                data_dir,
                warnings,
                lcu: Arc::new(LcuRuntime::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::recommend,
            commands::validate_state,
            commands::save_app_state,
            commands::load_app_state,
            commands::reload_data,
            commands::data_info,
            commands::load_example,
            commands::open_data_dir,
            commands::lcu_status,
            commands::lcu_start_tracking,
            commands::lcu_stop_tracking,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::migrate_template_labels;

    #[test]
    fn migrates_the_old_competitive_template_label() {
        let dir = std::env::temp_dir().join(format!(
            "draft-assist-template-migration-{}",
            std::process::id()
        ));
        let data_dir = dir.join("data");
        std::fs::create_dir_all(&data_dir).unwrap();
        let path = data_dir.join("templates.json");
        std::fs::write(
            &path,
            r#"{"templates":[{"id":"tournament","name":"Competitivo / Clash"}]}"#,
        )
        .unwrap();

        migrate_template_labels(&dir);

        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains(r#""name":"Competitivo""#));
        assert!(!content.contains("Competitivo / Clash"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
