use crate::model::{ChampionId, Role, Side};
use serde::{Deserialize, Serialize};

fn default_version() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryStore {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub matches: Vec<MatchRecord>,
    #[serde(default)]
    pub name_aliases: Vec<NameAlias>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

impl Default for HistoryStore {
    fn default() -> Self {
        Self {
            version: default_version(),
            matches: Vec::new(),
            name_aliases: Vec::new(),
            updated_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NameAlias {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchSource {
    LegacyText,
    #[default]
    Manual,
    Lcu,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchQueue {
    Clash,
    RankedSolo,
    RankedFlex,
    NormalDraft,
    Custom,
    #[default]
    Unknown,
}

impl MatchQueue {
    pub fn label_es(self) -> &'static str {
        match self {
            Self::Clash => "Clash",
            Self::RankedSolo => "Ranked Solo",
            Self::RankedFlex => "Ranked Flex",
            Self::NormalDraft => "Normal Draft",
            Self::Custom => "Custom",
            Self::Unknown => "Sin cola",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchResult {
    Win,
    Loss,
    #[default]
    Unknown,
}

impl MatchResult {
    pub fn label_es(self) -> &'static str {
        match self {
            Self::Win => "Victoria",
            Self::Loss => "Derrota",
            Self::Unknown => "Sin resultado",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BanStarter {
    Us,
    Them,
    #[default]
    Unknown,
}

impl BanStarter {
    pub fn label_es(self) -> &'static str {
        match self {
            Self::Us => "Nosotros",
            Self::Them => "Ellos",
            Self::Unknown => "Sin dato",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Confidence {
    High,
    Medium,
    #[default]
    Low,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchTeam {
    #[default]
    Our,
    Enemy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct MatchTeamStats {
    #[serde(default)]
    pub kills: u32,
    #[serde(default)]
    pub towers: u32,
    #[serde(default)]
    pub dragons: u32,
    #[serde(default)]
    pub barons: u32,
    #[serde(default)]
    pub heralds: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchPlayerStat {
    pub team: MatchTeam,
    pub champion_id: ChampionId,
    #[serde(default)]
    pub player_name: Option<String>,
    #[serde(default)]
    pub role: Option<Role>,
    #[serde(default)]
    pub kills: u32,
    #[serde(default)]
    pub deaths: u32,
    #[serde(default)]
    pub assists: u32,
    #[serde(default)]
    pub creep_score: u32,
    #[serde(default)]
    pub level: u32,
    #[serde(default)]
    pub ward_score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryPick {
    pub champion_id: ChampionId,
    #[serde(default)]
    pub role: Option<Role>,
    #[serde(default)]
    pub player_name: Option<String>,
    #[serde(default)]
    pub order: u8,
    #[serde(default)]
    pub turn: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RivalPlayer {
    pub name: String,
    #[serde(default)]
    pub raw_name: String,
    #[serde(default)]
    pub role: Option<Role>,
    #[serde(default)]
    pub role_label: Option<String>,
    #[serde(default)]
    pub pool_groups: Vec<Vec<ChampionId>>,
    #[serde(default)]
    pub pool_raw: String,
    #[serde(default)]
    pub rank: Option<String>,
    #[serde(default)]
    pub notes: Vec<String>,
}

impl RivalPlayer {
    pub fn primary_pool(&self) -> &[ChampionId] {
        self.pool_groups.first().map(Vec::as_slice).unwrap_or(&[])
    }

    pub fn all_pool(&self) -> Vec<&ChampionId> {
        self.pool_groups.iter().flatten().collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchRecord {
    pub id: String,
    #[serde(default)]
    pub source: MatchSource,
    #[serde(default)]
    pub played_at: Option<String>,
    #[serde(default)]
    pub queue: MatchQueue,
    #[serde(default)]
    pub result: MatchResult,
    #[serde(default)]
    pub result_note: Option<String>,
    #[serde(default)]
    pub side: Option<Side>,
    #[serde(default)]
    pub side_inferred: bool,
    #[serde(default)]
    pub first_ban: Option<BanStarter>,
    #[serde(default)]
    pub first_ban_inferred: bool,
    #[serde(default)]
    pub our_bans: Vec<ChampionId>,
    #[serde(default)]
    pub enemy_bans: Vec<ChampionId>,
    #[serde(default)]
    pub our_picks: Vec<HistoryPick>,
    #[serde(default)]
    pub enemy_picks: Vec<HistoryPick>,
    #[serde(default)]
    pub rivals: Vec<RivalPlayer>,
    #[serde(default)]
    pub notes: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub confidence: Confidence,
    #[serde(default)]
    pub rebalanced: bool,
    #[serde(default)]
    pub legacy_index: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub our_stats: Option<MatchTeamStats>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enemy_stats: Option<MatchTeamStats>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub player_stats: Vec<MatchPlayerStat>,
}

impl MatchRecord {
    pub fn new_id(prefix: &str) -> String {
        let millis = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default();
        format!("{prefix}-{millis}")
    }

    pub fn is_complete(&self) -> bool {
        self.our_picks.len() >= 5
            && self.enemy_picks.len() >= 5
            && self.our_bans.len() >= 4
            && self.enemy_bans.len() >= 4
    }

    pub fn resolved_rival_name<'a>(&'a self, name: &'a str, aliases: &'a [NameAlias]) -> &'a str {
        let lower = name.to_lowercase();
        aliases
            .iter()
            .find(|alias| alias.from.to_lowercase() == lower)
            .map(|alias| alias.to.as_str())
            .unwrap_or(name)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyImport {
    pub matches: Vec<MatchRecord>,
    pub blocks: Vec<BlockReport>,
    pub stats: ImportStats,
    pub unknown_tokens: Vec<UnknownToken>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportStats {
    pub blocks: usize,
    pub matches: usize,
    pub wins: usize,
    pub losses: usize,
    pub unknown_results: usize,
    pub rebalanced_picks: usize,
    pub rebalanced_bans: usize,
    pub unknown_tokens: usize,
    pub missing_names: usize,
    pub fill_players: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockKind {
    Match,
    Incomplete,
    Scratch,
    Broken,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockReport {
    pub index: usize,
    pub line_start: usize,
    pub kind: BlockKind,
    pub confidence: Confidence,
    pub result: MatchResult,
    pub summary: String,
    pub warnings: Vec<String>,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnknownToken {
    pub token: String,
    pub count: usize,
    pub examples: Vec<String>,
}
