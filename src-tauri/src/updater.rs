use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Clone, Serialize)]
pub struct UpdateCheck {
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub date: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<UpdateCheck, String> {
    let current_version = app.package_info().version.to_string();
    let update = app
        .updater()
        .map_err(|error| format!("No se pudo inicializar el actualizador: {error}"))?
        .check()
        .await
        .map_err(|error| format!("No se pudo buscar actualizaciones: {error}"))?;

    Ok(match update {
        Some(update) => UpdateCheck {
            available: true,
            current_version: update.current_version.clone(),
            version: Some(update.version.clone()),
            notes: update.body.clone(),
            date: update.date.map(|date| date.unix_timestamp()),
        },
        None => UpdateCheck {
            available: false,
            current_version,
            version: None,
            notes: None,
            date: None,
        },
    })
}

#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    if tauri::is_dev() {
        return Err(
            "La instalación de actualizaciones solo está disponible en la app instalada."
                .to_string(),
        );
    }

    let update = app
        .updater()
        .map_err(|error| format!("No se pudo inicializar el actualizador: {error}"))?
        .check()
        .await
        .map_err(|error| format!("No se pudo buscar actualizaciones: {error}"))?
        .ok_or_else(|| "No hay una actualización disponible.".to_string())?;

    let progress_app = app.clone();
    let install_app = app.clone();
    let mut downloaded = 0u64;

    update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded += chunk_length as u64;
                let _ = progress_app.emit(
                    "update-progress",
                    UpdateProgress {
                        downloaded,
                        total: content_length,
                    },
                );
            },
            move || {
                let _ = install_app.emit("update-installing", ());
            },
        )
        .await
        .map_err(|error| format!("No se pudo instalar la actualización: {error}"))?;

    Ok(())
}
