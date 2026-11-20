//! Background poller for the Live Client Data API.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use draft_engine::data::GameData;
use reqwest::Client;
use tauri::{AppHandle, Emitter};

use super::mapping;
use super::model::{LiveGamePayload, LiveSnapshot};

const LIVE_CLIENT_DATA_URL: &str = "https://127.0.0.1:2999/liveclientdata/allgamedata";
const POLL_INTERVAL: Duration = Duration::from_secs(1);

pub struct LiveRuntime {
    last: Mutex<Option<LiveSnapshot>>,
    running: AtomicBool,
    generation: AtomicU64,
}

impl Default for LiveRuntime {
    fn default() -> Self {
        Self::new()
    }
}

impl LiveRuntime {
    pub fn new() -> Self {
        Self {
            last: Mutex::new(None),
            running: AtomicBool::new(false),
            generation: AtomicU64::new(0),
        }
    }

    pub fn start(self: &Arc<Self>, app: AppHandle, data: GameData) {
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        self.running.store(true, Ordering::SeqCst);
        if let Ok(mut last) = self.last.lock() {
            *last = None;
        }

        let runtime = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            run(runtime, app, data, generation).await;
        });
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        self.generation.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut last) = self.last.lock() {
            *last = None;
        }
    }

    pub fn current(&self) -> Option<LiveSnapshot> {
        self.last.lock().ok().and_then(|last| last.clone())
    }

    fn is_current(&self, generation: u64) -> bool {
        self.running.load(Ordering::SeqCst) && self.generation.load(Ordering::SeqCst) == generation
    }

    fn store(&self, snapshot: LiveSnapshot) {
        if let Ok(mut last) = self.last.lock() {
            *last = Some(snapshot);
        }
    }
}

async fn run(runtime: Arc<LiveRuntime>, app: AppHandle, data: GameData, generation: u64) {
    let client = match Client::builder()
        .danger_accept_invalid_certs(true)
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(3))
        .build()
    {
        Ok(client) => client,
        Err(_) => return,
    };

    let mut session = SessionState::default();
    loop {
        if !runtime.is_current(generation) {
            return;
        }

        match fetch_live_data(&client).await {
            Ok(payload) => {
                let session_id = session.next_session_id(&payload);
                let snapshot = mapping::build_snapshot(&payload, &data, session_id);
                runtime.store(snapshot.clone());
                let _ = app.emit("live-snapshot", &snapshot);
            }
            Err(_) => {
                if let Some(mut last) = runtime.current()
                    && last.available
                {
                    last.available = false;
                    runtime.store(last.clone());
                    let _ = app.emit("live-snapshot", &last);
                }
            }
        }

        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

async fn fetch_live_data(client: &Client) -> Result<LiveGamePayload, reqwest::Error> {
    client
        .get(LIVE_CLIENT_DATA_URL)
        .send()
        .await?
        .error_for_status()?
        .json::<LiveGamePayload>()
        .await
}

#[derive(Default)]
struct SessionState {
    id: String,
    last_game_time: f64,
}

impl SessionState {
    fn next_session_id(&mut self, payload: &LiveGamePayload) -> String {
        let game_time = payload.game_data.game_time;
        let is_new = self.id.is_empty() || game_time + 5.0 < self.last_game_time;
        if is_new {
            self.id = format!("{}-{}", now_ms(), (game_time * 1_000.0).round() as i64);
        }
        self.last_game_time = game_time;
        self.id.clone()
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}
