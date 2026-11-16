use draft_engine::model::{DraftState, Phase, Side};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct LcuStatus {
    pub state: String,
    pub connected: bool,
    pub phase: Option<String>,
    pub queue_id: Option<i64>,
    pub queue_name: Option<String>,
    pub template_id: Option<String>,
    pub side: Option<Side>,
    pub local_player: Option<String>,
    pub current_action: Option<LcuActionView>,
    pub last_error: Option<String>,
    pub last_sync_ms: Option<u64>,
    pub auto: bool,
}

impl Default for LcuStatus {
    fn default() -> Self {
        Self {
            state: "not_found".into(),
            connected: false,
            phase: None,
            queue_id: None,
            queue_name: None,
            template_id: None,
            side: None,
            local_player: None,
            current_action: None,
            last_error: None,
            last_sync_ms: None,
            auto: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct LcuActionView {
    pub phase: Phase,
    pub acting_side: Side,
    pub player_id: Option<String>,
    pub player_name: Option<String>,
    pub pick_number: Option<u8>,
    pub label: String,
    pub action_id: i64,
    pub seconds_left: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LcuSnapshot {
    pub status: LcuStatus,
    pub draft: Option<DraftState>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct GameflowSession {
    #[serde(rename = "gameData", default)]
    pub game_data: Option<GameflowGameData>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct GameflowGameData {
    #[serde(default)]
    pub queue: Option<GameflowQueue>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct GameflowQueue {
    #[serde(default)]
    pub id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct Lobby {
    #[serde(rename = "gameConfig", default)]
    pub game_config: Option<LobbyGameConfig>,
    #[serde(default)]
    pub members: Vec<LobbyMember>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct LobbyGameConfig {
    #[serde(rename = "queueId", default)]
    pub queue_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct LobbyMember {
    #[serde(rename = "summonerName", default)]
    pub summoner_name: Option<String>,
    #[serde(rename = "summonerId", default)]
    pub summoner_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ChampSelectSession {
    #[serde(rename = "localPlayerCellId", default)]
    pub local_player_cell_id: i64,
    #[serde(default)]
    pub actions: Vec<Vec<ChampSelectAction>>,
    #[serde(default)]
    pub bans: ChampSelectBans,
    #[serde(rename = "myTeam", default)]
    pub my_team: Vec<ChampSelectPlayer>,
    #[serde(rename = "theirTeam", default)]
    pub their_team: Vec<ChampSelectPlayer>,
    #[serde(rename = "hasSimultaneousBans", default)]
    pub has_simultaneous_bans: Option<bool>,
    #[serde(default)]
    pub timer: Option<ChampSelectTimer>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ChampSelectAction {
    #[serde(rename = "actorCellId", default)]
    pub actor_cell_id: i64,
    #[serde(rename = "championId", default)]
    pub champion_id: i64,
    #[serde(default)]
    pub completed: bool,
    #[serde(default)]
    pub id: i64,
    #[serde(rename = "isInProgress", default)]
    pub is_in_progress: bool,
    #[serde(rename = "pickTurn", default)]
    pub pick_turn: i64,
    #[serde(rename = "type", default)]
    pub action_type: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ChampSelectPlayer {
    #[serde(rename = "assignedPosition", default)]
    pub assigned_position: String,
    #[serde(rename = "cellId", default)]
    pub cell_id: i64,
    #[serde(rename = "championId", default)]
    pub champion_id: i64,
    #[serde(rename = "summonerId", default)]
    pub summoner_id: Option<i64>,
    #[serde(default)]
    pub team: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ChampSelectBans {
    #[serde(rename = "myTeamBans", default)]
    pub my_team_bans: Vec<i64>,
    #[serde(rename = "theirTeamBans", default)]
    pub their_team_bans: Vec<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ChampSelectTimer {
    #[serde(rename = "adjustedTimeLeftInPhase", default)]
    pub adjusted_time_left_in_phase: i64,
}
