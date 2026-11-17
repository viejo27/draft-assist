use crate::RuntimeState;
use crate::lcu::{LcuStatus, TrackingConfig, validate_roster};
use crate::{load_engine, persistence};
use draft_engine::data::example_state;
use draft_engine::history::{
    BanStarter, Confidence, HistoryPick, HistoryStore, LegacyImport, MatchQueue, MatchRecord,
    MatchResult, MatchSource, history_to_clean_text, parse_legacy,
};
use draft_engine::model::{
    ChampionView, DataStats, DraftTemplate, Phase, RecommendRequest, RecommendationResponse,
    Settings, ValidationReport,
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
    pub history_dir: String,
    pub stats: DataStats,
}

#[derive(Debug, Clone, Serialize)]
pub struct HistorySaveResult {
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct HistoryExportResult {
    pub json_path: String,
    pub text_path: String,
    pub dir: String,
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

#[tauri::command]
pub fn history_load(state: State<'_, RuntimeState>) -> Result<HistoryStore, String> {
    persistence::load_history(&state.data_dir)
}

#[tauri::command]
pub fn history_save(
    state: State<'_, RuntimeState>,
    history: HistoryStore,
) -> Result<HistorySaveResult, String> {
    let path = persistence::save_history(&state.data_dir, &history)?;
    Ok(HistorySaveResult {
        path: path.display().to_string(),
    })
}

#[tauri::command]
pub fn history_import_legacy(
    state: State<'_, RuntimeState>,
    text: String,
) -> Result<LegacyImport, String> {
    let engine = state
        .engine
        .lock()
        .map_err(|_| "El motor está bloqueado; reinicia la aplicación.".to_string())?;
    Ok(parse_legacy(&text, engine.data()))
}

#[tauri::command]
pub fn history_export(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    history: HistoryStore,
) -> Result<HistoryExportResult, String> {
    let dir = state.data_dir.join("exports");
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("No se pudo crear {}: {error}", dir.display()))?;
    let stamp = now_millis();
    let json_path = dir.join(format!("history-{stamp}.json"));
    let text_path = dir.join(format!("history-{stamp}.txt"));

    let engine = state
        .engine
        .lock()
        .map_err(|_| "El motor está bloqueado; reinicia la aplicación.".to_string())?;
    let json = serde_json::to_string_pretty(&history)
        .map_err(|error| format!("No se pudo serializar el historial: {error}"))?;
    std::fs::write(&json_path, format!("{json}\n"))
        .map_err(|error| format!("No se pudo escribir {}: {error}", json_path.display()))?;
    std::fs::write(&text_path, history_to_clean_text(&history, engine.data()))
        .map_err(|error| format!("No se pudo escribir {}: {error}", text_path.display()))?;

    let _ = app
        .opener()
        .open_path(dir.display().to_string(), None::<&str>);

    Ok(HistoryExportResult {
        json_path: json_path.display().to_string(),
        text_path: text_path.display().to_string(),
        dir: dir.display().to_string(),
    })
}

#[tauri::command]
pub fn history_match_from_draft(
    state: State<'_, RuntimeState>,
    app_state: PersistedState,
) -> Result<MatchRecord, String> {
    let engine = state
        .engine
        .lock()
        .map_err(|_| "El motor está bloqueado; reinicia la aplicación.".to_string())?;
    let draft = &app_state.draft;
    let template = engine.data().template(&draft.template_id);
    let first_ban = template
        .and_then(|template| template.steps.first())
        .and_then(|step| {
            if step.kind != Phase::Ban {
                return None;
            }
            step.team.map(|team| {
                if team == draft.side {
                    BanStarter::Us
                } else {
                    BanStarter::Them
                }
            })
        });
    let queue = match draft.template_id.as_str() {
        "tournament" => MatchQueue::Clash,
        "ranked" => MatchQueue::RankedSolo,
        _ => MatchQueue::Unknown,
    };

    let our_picks = draft
        .our_picks
        .iter()
        .enumerate()
        .map(|(index, pick)| HistoryPick {
            champion_id: pick.champion_id.clone(),
            role: Some(pick.role),
            player_name: app_state
                .roster
                .player(&pick.player_id)
                .map(|player| player.name.clone()),
            order: (index + 1) as u8,
            turn: None,
        })
        .collect();
    let enemy_picks = draft
        .enemy_picks
        .iter()
        .enumerate()
        .map(|(index, pick)| HistoryPick {
            champion_id: pick.champion_id.clone(),
            role: pick.role,
            player_name: None,
            order: (index + 1) as u8,
            turn: None,
        })
        .collect();

    let complete = draft.our_picks.len() >= 5
        && draft.enemy_picks.len() >= 5
        && draft.our_bans.len() >= 4
        && draft.enemy_bans.len() >= 4;
    let mut warnings = Vec::new();
    if !complete {
        warnings.push("Partida guardada con picks o bans incompletos.".into());
    }

    Ok(MatchRecord {
        id: MatchRecord::new_id("manual"),
        source: MatchSource::Manual,
        played_at: None,
        queue,
        result: MatchResult::Unknown,
        result_note: None,
        side: Some(draft.side),
        side_inferred: false,
        first_ban,
        first_ban_inferred: first_ban.is_some(),
        our_bans: draft.our_bans.clone(),
        enemy_bans: draft.enemy_bans.clone(),
        our_picks,
        enemy_picks,
        rivals: Vec::new(),
        notes: vec!["Guardada desde el draft actual.".into()],
        warnings,
        confidence: if complete {
            Confidence::High
        } else {
            Confidence::Medium
        },
        rebalanced: false,
        legacy_index: None,
    })
}

#[tauri::command]
pub fn history_open_dir(app: AppHandle, state: State<'_, RuntimeState>) -> Result<(), String> {
    let path = persistence::history_dir(&state.data_dir);
    std::fs::create_dir_all(&path)
        .map_err(|error| format!("No se pudo crear {}: {error}", path.display()))?;
    app.opener()
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|error| format!("No se pudo abrir la carpeta de historial: {error}"))
}

fn build_data_info(data_dir: &Path, engine: &Engine) -> DataInfo {
    let data_path = data_dir.join("data");
    DataInfo {
        data_dir: data_path.display().to_string(),
        state_path: persistence::state_path(data_dir).display().to_string(),
        history_dir: persistence::history_dir(data_dir).display().to_string(),
        stats: engine.data().stats(),
    }
}

fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}
