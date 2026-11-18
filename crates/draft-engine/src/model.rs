use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub type ChampionId = String;
pub type PlayerId = String;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Side {
    Blue,
    Red,
}

impl Side {
    pub fn other(self) -> Self {
        match self {
            Self::Blue => Self::Red,
            Self::Red => Self::Blue,
        }
    }

    pub fn label_es(self) -> &'static str {
        match self {
            Self::Blue => "Azul",
            Self::Red => "Rojo",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Role {
    Top,
    Jungle,
    Mid,
    Adc,
    Support,
}

impl Role {
    pub const ALL: [Self; 5] = [Self::Top, Self::Jungle, Self::Mid, Self::Adc, Self::Support];

    pub fn label_es(self) -> &'static str {
        match self {
            Self::Top => "Top",
            Self::Jungle => "Jungla",
            Self::Mid => "Mid",
            Self::Adc => "ADC",
            Self::Support => "Support",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum DamageType {
    Physical,
    Magic,
    Mixed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Phase {
    Ban,
    Pick,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamNeed {
    Frontline,
    Engage,
    Peel,
    Cc,
    ApDamage,
    AdDamage,
    Poke,
    Splitpush,
    Early,
    Scaling,
    Waveclear,
    AntiTank,
}

impl TeamNeed {
    pub fn label_es(self) -> &'static str {
        match self {
            Self::Frontline => "Falta frontline",
            Self::Engage => "Falta engage",
            Self::Peel => "Falta peel",
            Self::Cc => "Falta CC",
            Self::ApDamage => "Falta daño AP",
            Self::AdDamage => "Falta daño AD",
            Self::Poke => "Falta poke",
            Self::Splitpush => "Falta splitpush",
            Self::Early => "Falta presión temprana",
            Self::Scaling => "Falta escalado",
            Self::Waveclear => "Falta waveclear",
            Self::AntiTank => "Falta anti-tanque",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Archetype {
    Engage,
    Poke,
    FrontToBack,
    Splitpush,
    Pick,
    Balanced,
}

impl Archetype {
    pub fn label_es(self) -> &'static str {
        match self {
            Self::Engage => "Engage / wombo",
            Self::Poke => "Poke / siege",
            Self::FrontToBack => "Front-to-back",
            Self::Splitpush => "Splitpush",
            Self::Pick => "Pick / dive",
            Self::Balanced => "Balanceada",
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Traits {
    pub frontline: f32,
    pub engage: f32,
    pub peel: f32,
    pub cc: f32,
    pub carry: f32,
    pub scaling: f32,
    pub early: f32,
    pub splitpush: f32,
    pub poke: f32,
    pub sustain: f32,
    pub waveclear: f32,
    pub mobility: f32,
    pub anti_tank: f32,
    pub anti_heal: f32,
    pub shield: f32,
    pub utility: f32,
    pub aoe: f32,
}

impl Traits {
    pub fn get(&self, need: TeamNeed) -> f32 {
        match need {
            TeamNeed::Frontline => self.frontline,
            TeamNeed::Engage => self.engage,
            TeamNeed::Peel => self.peel,
            TeamNeed::Cc => self.cc,
            TeamNeed::ApDamage | TeamNeed::AdDamage => self.carry,
            TeamNeed::Poke => self.poke,
            TeamNeed::Splitpush => self.splitpush,
            TeamNeed::Early => self.early,
            TeamNeed::Scaling => self.scaling,
            TeamNeed::Waveclear => self.waveclear,
            TeamNeed::AntiTank => self.anti_tank,
        }
    }

    pub fn as_map(&self) -> BTreeMap<String, f32> {
        BTreeMap::from([
            ("frontline".into(), self.frontline),
            ("engage".into(), self.engage),
            ("peel".into(), self.peel),
            ("cc".into(), self.cc),
            ("carry".into(), self.carry),
            ("scaling".into(), self.scaling),
            ("early".into(), self.early),
            ("splitpush".into(), self.splitpush),
            ("poke".into(), self.poke),
            ("sustain".into(), self.sustain),
            ("waveclear".into(), self.waveclear),
            ("mobility".into(), self.mobility),
            ("anti_tank".into(), self.anti_tank),
            ("anti_heal".into(), self.anti_heal),
            ("shield".into(), self.shield),
            ("utility".into(), self.utility),
            ("aoe".into(), self.aoe),
        ])
    }

    pub fn add(&mut self, other: &Self) {
        self.frontline += other.frontline;
        self.engage += other.engage;
        self.peel += other.peel;
        self.cc += other.cc;
        self.carry += other.carry;
        self.scaling += other.scaling;
        self.early += other.early;
        self.splitpush += other.splitpush;
        self.poke += other.poke;
        self.sustain += other.sustain;
        self.waveclear += other.waveclear;
        self.mobility += other.mobility;
        self.anti_tank += other.anti_tank;
        self.anti_heal += other.anti_heal;
        self.shield += other.shield;
        self.utility += other.utility;
        self.aoe += other.aoe;
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ChampionInfo {
    #[serde(default)]
    pub attack: u8,
    #[serde(default)]
    pub defense: u8,
    #[serde(default)]
    pub magic: u8,
    #[serde(default)]
    pub difficulty: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Champion {
    pub id: ChampionId,
    pub key: String,
    pub name: String,
    #[serde(default)]
    pub title: String,
    pub image: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub info: ChampionInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChampionMeta {
    pub roles: Vec<Role>,
    #[serde(default)]
    pub flex: bool,
    pub damage: DamageType,
    pub traits: Traits,
    #[serde(default = "default_priority")]
    pub priority: u8,
}

impl ChampionMeta {
    pub fn primary_role(&self) -> Role {
        self.roles.first().copied().unwrap_or(Role::Top)
    }
}

fn default_priority() -> u8 {
    3
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolEntry {
    pub champion_id: ChampionId,
    #[serde(default = "default_comfort")]
    pub comfort: u8,
    #[serde(default)]
    pub winrate: Option<f32>,
}

fn default_comfort() -> u8 {
    3
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Player {
    pub id: PlayerId,
    pub name: String,
    pub role: Role,
    #[serde(default)]
    pub pool: Vec<PoolEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Roster {
    pub players: Vec<Player>,
    #[serde(default)]
    pub pick_order: Vec<PlayerId>,
}

impl Roster {
    pub fn player(&self, id: &str) -> Option<&Player> {
        self.players.iter().find(|player| player.id == id)
    }

    pub fn ordered_players(&self) -> Vec<&Player> {
        if self.pick_order.is_empty() {
            return self.players.iter().collect();
        }

        let mut ordered: Vec<&Player> = self
            .pick_order
            .iter()
            .filter_map(|id| self.player(id))
            .collect();
        for player in &self.players {
            if !ordered.iter().any(|existing| existing.id == player.id) {
                ordered.push(player);
            }
        }
        ordered
    }

    pub fn player_for_pick(&self, pick_number: u8) -> Option<&Player> {
        self.ordered_players()
            .get(usize::from(pick_number.saturating_sub(1)))
            .copied()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamPick {
    pub player_id: PlayerId,
    pub champion_id: ChampionId,
    pub role: Role,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnemyPick {
    pub champion_id: ChampionId,
    #[serde(default)]
    pub role: Option<Role>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManualTurn {
    pub phase: Phase,
    pub acting_side: Side,
    #[serde(default)]
    pub player_id: Option<PlayerId>,
}

/// Turno autoritativo cuando el draft viene del cliente de League.
/// Permite que el motor recomiende sin depender de que `step_index` coincida
/// exactamente con la secuencia de la plantilla.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LcuTurn {
    pub phase: Phase,
    pub acting_side: Side,
    #[serde(default)]
    pub player_id: Option<PlayerId>,
    #[serde(default)]
    pub pick_number: Option<u8>,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftState {
    #[serde(default = "default_version")]
    pub version: u32,
    pub side: Side,
    pub template_id: String,
    #[serde(default)]
    pub step_index: usize,
    #[serde(default)]
    pub our_bans: Vec<ChampionId>,
    #[serde(default)]
    pub enemy_bans: Vec<ChampionId>,
    #[serde(default)]
    pub our_picks: Vec<TeamPick>,
    #[serde(default)]
    pub enemy_picks: Vec<EnemyPick>,
    #[serde(default)]
    pub priorities: Vec<TeamNeed>,
    #[serde(default)]
    pub current_player_id: Option<PlayerId>,
    #[serde(default)]
    pub manual: Option<ManualTurn>,
    #[serde(default)]
    pub lcu_turn: Option<LcuTurn>,
}

fn default_version() -> u32 {
    1
}

impl DraftState {
    pub fn all_bans(&self) -> impl Iterator<Item = &ChampionId> {
        self.our_bans.iter().chain(self.enemy_bans.iter())
    }

    pub fn all_pick_ids(&self) -> impl Iterator<Item = &ChampionId> {
        self.our_picks
            .iter()
            .map(|pick| &pick.champion_id)
            .chain(self.enemy_picks.iter().map(|pick| &pick.champion_id))
    }

    pub fn unavailable(&self) -> std::collections::HashSet<&str> {
        self.all_bans()
            .map(String::as_str)
            .chain(self.all_pick_ids().map(String::as_str))
            .collect()
    }

    pub fn enemy_side(&self) -> Side {
        self.side.other()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftStep {
    pub kind: Phase,
    #[serde(default)]
    pub team: Option<Side>,
    #[serde(default)]
    pub pick_number: Option<u8>,
    #[serde(default)]
    pub simultaneous: bool,
    #[serde(default)]
    pub ban_slots_per_team: u8,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftTemplate {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub steps: Vec<DraftStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Matchup {
    pub champion: ChampionId,
    pub opponent: ChampionId,
    #[serde(default)]
    pub role: Option<Role>,
    pub value: f32,
    #[serde(default = "default_severity")]
    pub severity: u8,
    #[serde(default)]
    pub note: String,
}

fn default_severity() -> u8 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Synergy {
    pub a: ChampionId,
    pub b: ChampionId,
    pub value: f32,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileWeights {
    pub matchup: f32,
    pub synergy: f32,
    pub needs: f32,
    pub comfort: f32,
    pub meta: f32,
    pub flex: f32,
    pub risk: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BanWeights {
    pub meta: f32,
    pub threat: f32,
    pub flex: f32,
    pub denial: f32,
    pub contested: f32,
    pub self_ban: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeedThresholds {
    pub frontline_min: f32,
    pub engage_min: f32,
    pub cc_min: f32,
    pub peel_min: f32,
    pub waveclear_min: f32,
    pub ap_min_share: f32,
    pub ad_min_share: f32,
    pub anti_tank_min: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TierThresholds {
    #[serde(rename = "S")]
    pub s: f32,
    #[serde(rename = "A")]
    pub a: f32,
    #[serde(rename = "B")]
    pub b: f32,
    #[serde(rename = "C")]
    pub c: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoringConfig {
    pub profiles: BTreeMap<String, ProfileWeights>,
    pub ban_weights: BanWeights,
    pub off_pool_multiplier: f32,
    pub off_pool_penalty: f32,
    #[serde(default = "default_true")]
    pub pool_precedence_default: bool,
    pub tiers: TierThresholds,
    pub needs: NeedThresholds,
    #[serde(default = "default_early_max")]
    pub early_pick_max: u8,
    #[serde(default = "default_late_min")]
    pub late_pick_min: u8,
    #[serde(default = "default_history_weight")]
    pub history_weight: f32,
    #[serde(default = "default_history_min_games")]
    pub history_min_games: u32,
}

fn default_history_weight() -> f32 {
    0.02
}

fn default_history_min_games() -> u32 {
    3
}

fn default_true() -> bool {
    true
}

fn default_early_max() -> u8 {
    2
}

fn default_late_min() -> u8 {
    4
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default = "default_top_n")]
    pub top_n: usize,
    #[serde(default)]
    pub allow_offrole_flex: bool,
    #[serde(default = "default_true")]
    pub pool_precedence: bool,
    #[serde(default)]
    pub use_history: bool,
}

fn default_top_n() -> usize {
    5
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            top_n: 5,
            allow_offrole_flex: false,
            pool_precedence: true,
            use_history: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    #[serde(default = "default_version")]
    pub version: u32,
    pub roster: Roster,
    pub draft: DraftState,
    #[serde(default)]
    pub settings: Settings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendOptions {
    #[serde(default = "default_top_n")]
    pub top_n: usize,
    #[serde(default)]
    pub allow_offrole_flex: bool,
    #[serde(default = "default_true")]
    pub pool_precedence: bool,
    #[serde(default = "default_true")]
    pub include_next_picks: bool,
    #[serde(default)]
    pub use_history: bool,
}

impl Default for RecommendOptions {
    fn default() -> Self {
        Self {
            top_n: 5,
            allow_offrole_flex: false,
            pool_precedence: true,
            include_next_picks: true,
            use_history: false,
        }
    }
}

impl From<&Settings> for RecommendOptions {
    fn from(settings: &Settings) -> Self {
        Self {
            top_n: settings.top_n,
            allow_offrole_flex: settings.allow_offrole_flex,
            pool_precedence: settings.pool_precedence,
            include_next_picks: true,
            use_history: settings.use_history,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendRequest {
    pub draft: DraftState,
    pub roster: Roster,
    #[serde(default)]
    pub options: RecommendOptions,
    #[serde(default)]
    pub history: Option<HistorySignals>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HistoryLine {
    #[serde(default)]
    pub games: u32,
    #[serde(default)]
    pub wins: u32,
    #[serde(default)]
    pub losses: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HistorySignals {
    #[serde(default)]
    pub sample_matches: u32,
    #[serde(default)]
    pub our_picks: BTreeMap<ChampionId, HistoryLine>,
    #[serde(default)]
    pub enemy_picks: BTreeMap<ChampionId, HistoryLine>,
    #[serde(default)]
    pub our_bans: BTreeMap<ChampionId, u32>,
    #[serde(default)]
    pub enemy_bans: BTreeMap<ChampionId, u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HistoryEvidence {
    pub points: f32,
    pub games: u32,
    pub wins: u32,
    pub losses: u32,
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChampionView {
    pub id: ChampionId,
    pub name: String,
    pub title: String,
    pub image: String,
    pub roles: Vec<Role>,
    pub tags: Vec<String>,
    pub damage: DamageType,
    pub priority: u8,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChampionRef {
    pub id: ChampionId,
    pub name: String,
    pub image: String,
    pub roles: Vec<Role>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlayerView {
    pub id: PlayerId,
    pub name: String,
    pub role: Role,
}

#[derive(Debug, Clone, Serialize)]
pub struct TeamPickView {
    pub player: PlayerView,
    pub role: Role,
    pub champion: ChampionRef,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnemyPickView {
    pub champion: ChampionRef,
    pub role: Option<Role>,
    pub inferred_role: Role,
}

#[derive(Debug, Clone, Serialize)]
pub struct DamageSplit {
    pub physical: f32,
    pub magic: f32,
    pub mixed: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct NeedAssessment {
    pub id: TeamNeed,
    pub label: String,
    pub severity: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompositionSummary {
    pub damage_split: DamageSplit,
    pub traits: BTreeMap<String, f32>,
    pub archetype: Archetype,
    pub archetype_label: String,
    pub needs: Vec<NeedAssessment>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DraftSummary {
    pub side: Side,
    pub side_label: String,
    pub phase: Phase,
    pub turn_label: String,
    pub template_name: String,
    pub our_bans: Vec<ChampionRef>,
    pub enemy_bans: Vec<ChampionRef>,
    pub our_picks: Vec<TeamPickView>,
    pub enemy_picks: Vec<EnemyPickView>,
    pub composition: CompositionSummary,
}

#[derive(Debug, Clone, Serialize)]
pub struct TurnInfo {
    pub step_index: usize,
    pub phase: Phase,
    pub acting_side: Option<Side>,
    pub acting_side_label: String,
    pub is_our_turn: bool,
    pub current_player: Option<PlayerView>,
    pub pick_number: Option<u8>,
    pub label: String,
    pub our_picks_made: usize,
    pub enemy_picks_made: usize,
    pub our_bans_made: usize,
    pub enemy_bans_made: usize,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ScoreBreakdown {
    pub matchup: f32,
    pub synergy: f32,
    pub needs: f32,
    pub comfort: f32,
    pub meta: f32,
    pub flex: f32,
    pub counter_risk: f32,
    pub pool_penalty: f32,
    pub threat: f32,
    pub denial: f32,
    pub self_ban: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct Recommendation {
    pub rank: usize,
    pub champion: ChampionView,
    pub role: Role,
    pub action: Phase,
    pub score: f32,
    pub tier: String,
    pub in_pool: bool,
    pub comfort: Option<u8>,
    pub off_pool_warning: Option<String>,
    pub justification: String,
    pub reasons: Vec<String>,
    pub risks: Vec<String>,
    pub breakdown: ScoreBreakdown,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history: Option<HistoryEvidence>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NextPickSuggestions {
    pub step_index: usize,
    pub turn_label: String,
    pub player: Option<PlayerView>,
    pub suggestions: Vec<Recommendation>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecommendationResponse {
    pub summary: DraftSummary,
    pub turn: Option<TurnInfo>,
    pub recommendations: Vec<Recommendation>,
    pub next_picks: Vec<NextPickSuggestions>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ValidationReport {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DataStats {
    pub version: String,
    pub champions: usize,
    pub meta_entries: usize,
    pub matchups: usize,
    pub synergies: usize,
    pub templates: usize,
}
