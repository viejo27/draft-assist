//! Models for the Live Client Data API and the normalized live snapshot.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LiveGamePayload {
    #[serde(rename = "activePlayer", default)]
    pub active_player: LiveActivePlayer,
    #[serde(rename = "allPlayers", default)]
    pub all_players: Vec<LivePlayer>,
    #[serde(default)]
    pub events: LiveEvents,
    #[serde(rename = "gameData", default)]
    pub game_data: LiveGameInfo,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LiveActivePlayer {
    #[serde(rename = "riotIdGameName", default)]
    pub riot_id_game_name: Option<String>,
    #[serde(rename = "riotId", default)]
    pub riot_id: Option<String>,
    #[serde(rename = "summonerName", default)]
    pub summoner_name: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LivePlayer {
    #[serde(rename = "championName", default)]
    pub champion_name: Option<String>,
    #[serde(rename = "isDead", default)]
    pub is_dead: bool,
    #[serde(default)]
    pub level: u32,
    #[serde(default)]
    pub position: String,
    #[serde(rename = "respawnTimer", default)]
    pub respawn_timer: f64,
    #[serde(rename = "riotId", default)]
    pub riot_id: Option<String>,
    #[serde(rename = "riotIdGameName", default)]
    pub riot_id_game_name: Option<String>,
    #[serde(rename = "summonerName", default)]
    pub summoner_name: String,
    #[serde(default)]
    pub team: String,
    #[serde(default)]
    pub scores: LiveScores,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LiveScores {
    #[serde(default)]
    pub kills: u32,
    #[serde(default)]
    pub deaths: u32,
    #[serde(default)]
    pub assists: u32,
    #[serde(rename = "creepScore", default)]
    pub creep_score: u32,
    #[serde(rename = "wardScore", default)]
    pub ward_score: f64,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LiveEvents {
    #[serde(rename = "Events", default)]
    pub events: Vec<LiveEvent>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LiveEvent {
    #[serde(rename = "EventID", default)]
    pub event_id: i64,
    #[serde(rename = "EventName", default)]
    pub event_name: String,
    #[serde(rename = "EventTime", default)]
    pub event_time: f64,
    #[serde(rename = "KillerName", default)]
    pub killer_name: Option<String>,
    #[serde(rename = "VictimName", default)]
    pub victim_name: Option<String>,
    #[serde(rename = "Assisters", default)]
    pub assisters: Option<Vec<String>>,
    #[serde(rename = "DragonType", default)]
    pub dragon_type: Option<String>,
    #[serde(rename = "Stolen", default)]
    pub stolen: Option<String>,
    #[serde(rename = "TurretKilled", default)]
    pub turret_killed: Option<String>,
    #[serde(rename = "InhibKilled", default)]
    pub inhib_killed: Option<String>,
    #[serde(rename = "Result", default)]
    pub result: Option<String>,
    #[serde(rename = "KillStreak", default)]
    pub kill_streak: Option<u32>,
    #[serde(rename = "Recipient", default)]
    pub recipient: Option<String>,
    #[serde(rename = "Acer", default)]
    pub acer: Option<String>,
    #[serde(rename = "AcingTeam", default)]
    pub acing_team: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LiveGameInfo {
    #[serde(rename = "gameMode", default)]
    pub game_mode: String,
    #[serde(rename = "gameTime", default)]
    pub game_time: f64,
    #[serde(rename = "mapName", default)]
    pub map_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LiveSnapshot {
    pub available: bool,
    pub session_id: String,
    pub captured_at_ms: u64,
    pub game_time: f64,
    pub game_mode: String,
    pub map_name: String,
    pub our_team: Option<String>,
    pub active_player_name: Option<String>,
    pub players: Vec<LivePlayerView>,
    pub events: Vec<LiveEventView>,
    pub latest_event_id: i64,
    pub result: Option<String>,
    pub ended: bool,
    pub duration_seconds: f64,
    pub our_stats: Option<LiveTeamStats>,
    pub enemy_stats: Option<LiveTeamStats>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LivePlayerView {
    pub key: String,
    pub player_name: String,
    pub champion_id: Option<String>,
    pub champion_name: String,
    pub team: String,
    pub position: String,
    pub role: Option<String>,
    pub level: u32,
    pub kills: u32,
    pub deaths: u32,
    pub assists: u32,
    pub creep_score: u32,
    pub ward_score: f64,
    pub is_dead: bool,
    pub respawn_timer: f64,
    pub start_x: f32,
    pub start_y: f32,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct LiveEventView {
    pub id: i64,
    pub name: String,
    pub time: f64,
    pub text: String,
    pub participants: Vec<String>,
    pub location: Option<LiveLocationView>,
    pub result: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LiveLocationView {
    pub key: String,
    pub label: String,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct LiveTeamStats {
    pub kills: u32,
    pub towers: u32,
    pub dragons: u32,
    pub barons: u32,
    pub heralds: u32,
}
