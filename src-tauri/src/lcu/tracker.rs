use super::client::LcuClient;
use super::credentials;
use super::mapping::{self, TrackingConfig};
use super::model::{ChampSelectSession, GameflowSession, LcuSnapshot, LcuStatus, Lobby};
use draft_engine::data::GameData;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

pub struct LcuRuntime {
    status: Mutex<LcuStatus>,
    tracking: AtomicBool,
    generation: AtomicU64,
}

impl Default for LcuRuntime {
    fn default() -> Self {
        Self::new()
    }
}

impl LcuRuntime {
    pub fn new() -> Self {
        Self {
            status: Mutex::new(LcuStatus::default()),
            tracking: AtomicBool::new(false),
            generation: AtomicU64::new(0),
        }
    }

    pub fn status(&self) -> LcuStatus {
        self.status
            .lock()
            .map(|status| status.clone())
            .unwrap_or_default()
    }

    pub fn is_tracking(&self) -> bool {
        self.tracking.load(Ordering::SeqCst)
    }

    pub fn start(self: &Arc<Self>, app: AppHandle, config: TrackingConfig, data: GameData) {
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        self.tracking.store(true, Ordering::SeqCst);
        self.update_status(LcuStatus {
            state: "connecting".into(),
            auto: true,
            ..LcuStatus::default()
        });

        let runtime = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            run_tracker(runtime, app, config, data, generation).await;
        });
    }

    pub fn stop(&self) -> LcuStatus {
        self.tracking.store(false, Ordering::SeqCst);
        self.generation.fetch_add(1, Ordering::SeqCst);

        let mut status = self.status();
        status.auto = false;
        status.current_action = None;
        self.update_status(status.clone());
        status
    }

    pub async fn probe(&self) -> LcuStatus {
        if self.is_tracking() {
            return self.status();
        }

        let status = probe_status().await;
        self.update_status(status.clone());
        status
    }

    fn is_current(&self, generation: u64) -> bool {
        self.tracking.load(Ordering::SeqCst) && self.generation.load(Ordering::SeqCst) == generation
    }

    fn update_status(&self, status: LcuStatus) {
        if let Ok(mut current) = self.status.lock() {
            *current = status;
        }
    }
}

pub async fn probe_status() -> LcuStatus {
    let credentials = match tokio::task::spawn_blocking(credentials::resolve).await {
        Ok(Ok(credentials)) => credentials,
        Ok(Err(error)) => {
            return LcuStatus {
                state: "not_found".into(),
                last_error: Some(error.user_message().into()),
                ..LcuStatus::default()
            };
        }
        Err(_) => {
            return LcuStatus {
                state: "error".into(),
                last_error: Some("No se pudo buscar el cliente. Reintentando…".into()),
                ..LcuStatus::default()
            };
        }
    };

    let client = match LcuClient::new(&credentials) {
        Ok(client) => client,
        Err(error) => {
            return LcuStatus {
                state: "error".into(),
                last_error: Some(error.user_message().into()),
                ..LcuStatus::default()
            };
        }
    };

    match client.get_phase().await {
        Ok(phase) => {
            let gameflow = client
                .get_optional_json::<GameflowSession>("/lol-gameflow/v1/session")
                .await
                .ok()
                .flatten();
            let queue_id = gameflow
                .as_ref()
                .and_then(|session| session.game_data.as_ref())
                .and_then(|data| data.queue.as_ref())
                .and_then(|queue| queue.id);
            LcuStatus {
                state: "connected".into(),
                connected: true,
                phase: Some(phase),
                queue_id,
                queue_name: mapping::queue_name(queue_id),
                template_id: queue_id.map(|id| mapping::detect_template(Some(id), None)),
                auto: false,
                ..LcuStatus::default()
            }
        }
        Err(error) => LcuStatus {
            state: "reconnecting".into(),
            last_error: Some(error.user_message().into()),
            ..LcuStatus::default()
        },
    }
}

async fn run_tracker(
    runtime: Arc<LcuRuntime>,
    app: AppHandle,
    config: TrackingConfig,
    data: GameData,
    generation: u64,
) {
    let mut client: Option<LcuClient> = None;
    let mut last_key = String::new();

    loop {
        if !runtime.is_current(generation) {
            return;
        }

        let result = poll_tracking(&mut client, &config, &data).await;
        if result.is_err() {
            // El puerto/token del LCU cambia cuando el cliente se reinicia.
            client = None;
        }
        let mut snapshot = match result {
            Ok(snapshot) => snapshot,
            Err(error) => {
                let mut status = runtime.status();
                status.auto = true;
                status.connected = false;
                status.state = "reconnecting".into();
                status.current_action = None;
                status.last_error = Some(error);
                LcuSnapshot {
                    status,
                    draft: None,
                    lobby_signature: None,
                }
            }
        };
        snapshot.status.auto = true;

        let key = snapshot_key(&snapshot);
        if key != last_key {
            snapshot.status.last_sync_ms = Some(now_ms());
            runtime.update_status(snapshot.status.clone());
            let _ = app.emit("lcu-snapshot", &snapshot);
            last_key = key;
        }

        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

async fn poll_tracking(
    client: &mut Option<LcuClient>,
    config: &TrackingConfig,
    data: &GameData,
) -> Result<LcuSnapshot, String> {
    if client.is_none() {
        let credentials = tokio::task::spawn_blocking(credentials::resolve)
            .await
            .map_err(|_| "No se pudo buscar el cliente. Reintentando…".to_string())?
            .map_err(|error| error.user_message().to_string())?;
        *client =
            Some(LcuClient::new(&credentials).map_err(|error| error.user_message().to_string())?);
    }

    let lcu = client
        .as_ref()
        .ok_or_else(|| "Cliente de League no disponible. Reintentando…".to_string())?;
    let phase = lcu
        .get_phase()
        .await
        .map_err(|error| error.user_message().to_string())?;
    let gameflow = lcu
        .get_optional_json::<GameflowSession>("/lol-gameflow/v1/session")
        .await
        .ok()
        .flatten();
    let lobby = lcu
        .get_optional_json::<Lobby>("/lol-lobby/v2/lobby")
        .await
        .ok()
        .flatten();
    let session = if phase == "ChampSelect" {
        lcu.get_optional_json::<ChampSelectSession>("/lol-champ-select/v1/session")
            .await
            .ok()
            .flatten()
    } else {
        None
    };

    Ok(mapping::build_snapshot(
        &phase,
        gameflow.as_ref(),
        lobby.as_ref(),
        session.as_ref(),
        config,
        data,
        true,
    ))
}

fn snapshot_key(snapshot: &LcuSnapshot) -> String {
    let mut copy = snapshot.clone();
    copy.status.last_sync_ms = None;
    serde_json::to_string(&copy).unwrap_or_default()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}
