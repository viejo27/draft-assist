use crate::RuntimeState;
use crate::lcu::{LcuStatus, TrackingConfig, validate_roster};
use crate::{load_engine, persistence};
use draft_engine::data::example_state;
use draft_engine::model::{
    ChampionView, DataStats, DraftTemplate, RecommendRequest, RecommendationResponse, Settings,
    ValidationReport,
};
use draft_engine::{AppState as PersistedState, Engine};
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, Serialize)]
pub struct DataInfo {
    pub data_dir: String,
    pub state_path: String,
    pub stats: DataStats,
}

#[derive(Debug, Clone, Serialize)]
pub struct BootstrapPayload {
    pub champions: Vec<ChampionView>,
    pub templates: Vec<DraftTemplate>,
    pub settings: Settings,
    pub data: DataInfo,
    pub example_state: PersistedState,
    pub warnings: Vec<String>,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SaveResult {
    pub path: String,
    pub validation: ValidationReport,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReloadResult {
    pub data: DataInfo,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub fn bootstrap(state: State<'_, RuntimeState>) -> Result<BootstrapPayload, String> {
    let engine = state
        .engine
        .lock()
        .map_err(|_| "El motor está bloqueado; reinicia la aplicación.".to_string())?;
    let data = engine.data();
    let mut champions = Vec::with_capacity(data.champions.len());
    for champion in &data.champions {
        if let Some(meta) = data.meta(&champion.id) {
            champions.push(ChampionView {
                id: champion.id.clone(),
                name: champion.name.clone(),
                title: champion.title.clone(),
                image: champion.image.clone(),
                roles: meta.roles.clone(),
                tags: champion.tags.clone(),
                damage: meta.damage,
                priority: meta.priority,
            });
        }
    }

    Ok(BootstrapPayload {
        champions,
        templates: data.templates.clone(),
        settings: Settings::default(),
        data: build_data_info(&state.data_dir, &engine),
        example_state: example_state().map_err(|error| error.to_string())?,
        warnings: state.warnings.clone(),
        app_version: env!("CARGO_PKG_VERSION").into(),
    })
}

#[tauri::command]
pub fn recommend(
    state: State<'_, RuntimeState>,
    request: RecommendRequest,
) -> Result<RecommendationResponse, String> {
    let engine = state
        .engine
        .lock()
        .map_err(|_| "El motor está bloqueado; reinicia la aplicación.".to_string())?;
    engine
        .recommend(&request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn validate_state(
    state: State<'_, RuntimeState>,
    app_state: PersistedState,
) -> Result<ValidationReport, String> {
    let engine = state
        .engine
        .lock()
        .map_err(|_| "El motor está bloqueado; reinicia la aplicación.".to_string())?;
    Ok(engine.validate_app_state(&app_state))
}

#[tauri::command]
pub fn save_app_state(
    state: State<'_, RuntimeState>,
    app_state: PersistedState,
) -> Result<SaveResult, String> {
    let path = persistence::save_state(&state.data_dir, &app_state)?;
    let engine = state
        .engine
        .lock()
        .map_err(|_| "El motor está bloqueado; reinicia la aplicación.".to_string())?;
    Ok(SaveResult {
        path: path.display().to_string(),
        validation: engine.validate_app_state(&app_state),
    })
}

#[tauri::command]
pub fn load_app_state(state: State<'_, RuntimeState>) -> Result<Option<PersistedState>, String> {
    persistence::load_state(&state.data_dir)
}

#[tauri::command]
pub fn reload_data(state: State<'_, RuntimeState>) -> Result<ReloadResult, String> {
    let (engine, warnings) = load_engine(&state.data_dir)?;
    let data = build_data_info(&state.data_dir, &engine);
    {
        let mut guard = state
            .engine
            .lock()
            .map_err(|_| "El motor está bloqueado; reinicia la aplicación.".to_string())?;
        *guard = engine;
    }
    Ok(ReloadResult { data, warnings })
}

#[tauri::command]
pub fn data_info(state: State<'_, RuntimeState>) -> Result<DataInfo, String> {
    let engine = state
        .engine
        .lock()
        .map_err(|_| "El motor está bloqueado; reinicia la aplicación.".to_string())?;
    Ok(build_data_info(&state.data_dir, &engine))
}

#[tauri::command]
pub fn load_example() -> Result<PersistedState, String> {
    example_state().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_data_dir(app: tauri::AppHandle, state: State<'_, RuntimeState>) -> Result<(), String> {
    let path = state.data_dir.join("data");
    app.opener()
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|error| format!("No se pudo abrir la carpeta de datos: {error}"))
}

#[tauri::command]
pub async fn lcu_status(state: State<'_, RuntimeState>) -> Result<LcuStatus, String> {
    let lcu = state.lcu.clone();
    Ok(lcu.probe().await)
}

#[tauri::command]
pub fn lcu_start_tracking(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    app_state: PersistedState,
) -> Result<LcuStatus, String> {
    validate_roster(&app_state.roster)?;

    let data = {
        let engine = state
            .engine
            .lock()
            .map_err(|_| "El motor está bloqueado; reinicia la aplicación.".to_string())?;
        engine.data().clone()
    };

    let config = TrackingConfig {
        roster: app_state.roster,
        priorities: app_state.draft.priorities.clone(),
        side: app_state.draft.side,
    };
    state.lcu.start(app, config, data);
    Ok(state.lcu.status())
}

#[tauri::command]
pub fn lcu_stop_tracking(state: State<'_, RuntimeState>) -> Result<LcuStatus, String> {
    Ok(state.lcu.stop())
}

fn build_data_info(data_dir: &Path, engine: &Engine) -> DataInfo {
    let data_path = data_dir.join("data");
    DataInfo {
        data_dir: data_path.display().to_string(),
        state_path: persistence::state_path(data_dir).display().to_string(),
        stats: engine.data().stats(),
    }
}
