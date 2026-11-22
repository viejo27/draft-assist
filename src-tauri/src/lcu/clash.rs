use super::client::{LcuClient, LcuError};
use super::scouting::{
    ClashRankView, ClashRecentMatchView, ClashScoutingView, build_scouting, champion_index,
    fetch_ranks, fetch_recent_matches, fetch_scouting, fetch_summoners, json_id_array,
};
use draft_engine::data::GameData;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
pub struct ClashView {
    pub enabled: bool,
    pub tournament: Option<ClashTournamentView>,
    pub roster: Option<ClashRosterView>,
    pub bracket: Option<ClashBracketView>,
    pub next_match: Option<ClashMatchView>,
    pub opponent: Option<ClashOpponentView>,
    pub message: Option<String>,
    pub last_sync_ms: u64,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct ClashOverview {
    pub enabled: bool,
    pub tournament: Option<ClashTournamentView>,
    pub team: Option<ClashTeamView>,
    pub message: Option<String>,
    pub last_sync_ms: u64,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct ClashTeamView {
    pub id: Option<String>,
    pub name: Option<String>,
    pub short_name: Option<String>,
    pub is_registered: bool,
    pub state: Option<String>,
    pub state_label: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClashTournamentView {
    pub id: i64,
    pub name: String,
    pub subtitle: Option<String>,
    pub state: Option<String>,
    pub state_label: String,
    pub next_state_change_ms: Option<i64>,
    pub start_time_ms: Option<i64>,
    pub end_time_ms: Option<i64>,
    pub lockin_start_ms: Option<i64>,
    pub scouting_start_ms: Option<i64>,
    pub queue_id: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClashRosterView {
    pub id: String,
    pub name: Option<String>,
    pub short_name: Option<String>,
    pub tier: Option<i32>,
    pub is_registered: bool,
    pub is_eliminated: bool,
    pub is_active_in_current_phase: bool,
    pub state: Option<String>,
    pub state_label: String,
    pub accepted_count: usize,
    pub pending_count: usize,
    pub wins: i32,
    pub losses: i32,
    pub points: i32,
    pub member_count: usize,
    pub tournament_id: Option<i64>,
    pub members: Vec<ClashRosterMemberView>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct ClashRosterMemberView {
    pub summoner_id: Option<i64>,
    pub puuid: Option<String>,
    pub display_name: String,
    pub tag_line: Option<String>,
    pub level: Option<i32>,
    pub profile_icon_id: Option<i32>,
    pub position: Option<String>,
    pub position_label: String,
    pub state: Option<String>,
    pub state_label: String,
    pub tier: Option<i32>,
    pub is_captain: bool,
    pub is_pending: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClashBracketView {
    pub id: i64,
    pub size: Option<i32>,
    pub period: Option<i32>,
    pub is_complete: bool,
    pub roster_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClashMatchView {
    pub id: i64,
    pub round: Option<i32>,
    pub status: Option<String>,
    pub status_label: String,
    pub game_start_time_ms: Option<i64>,
    pub round_start_time_ms: Option<i64>,
    pub our_roster_id: i64,
    pub our_roster_name: Option<String>,
    pub opponent_roster_id: Option<i64>,
    pub opponent_name: Option<String>,
    pub opponent_short_name: Option<String>,
    pub winner_id: Option<i64>,
    pub result: Option<String>,
    pub is_completed: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClashOpponentView {
    pub roster_id: i64,
    pub name: Option<String>,
    pub short_name: Option<String>,
    pub tier: Option<i32>,
    pub wins: i32,
    pub losses: i32,
    pub players: Vec<ClashPlayerView>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClashPlayerView {
    pub summoner_id: Option<i64>,
    pub puuid: Option<String>,
    pub display_name: String,
    pub tag_line: Option<String>,
    pub level: Option<i32>,
    pub profile_icon_id: Option<i32>,
    pub position: Option<String>,
    pub position_label: String,
    pub member_state: Option<String>,
    pub tier: Option<i32>,
    pub ranks: Vec<ClashRankView>,
    pub scouting: Option<ClashScoutingView>,
    pub recent_matches: Vec<ClashRecentMatchView>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TournamentSummary {
    #[serde(default)]
    tournament_id: Option<i64>,
    #[serde(default)]
    roster_id: Option<String>,
    #[serde(default)]
    bracket_id: Option<i64>,
    #[serde(default)]
    state: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PlayerTier {
    #[serde(default)]
    player_id: Option<i64>,
    #[serde(default)]
    tier: Option<i32>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PlayerTournamentData {
    #[serde(default)]
    bracket_id: Option<i64>,
    #[serde(default)]
    roster_id: Option<String>,
    #[serde(default)]
    state: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ClashTournament {
    #[serde(default)]
    name_loc_key: Option<String>,
    #[serde(default)]
    name_loc_key_secondary: Option<String>,
    #[serde(default)]
    queue_id: Option<i32>,
    #[serde(default)]
    start_time_ms: Option<i64>,
    #[serde(default)]
    end_time_ms: Option<i64>,
    #[serde(default)]
    phases: Vec<TournamentPhase>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TournamentPhase {
    #[serde(default)]
    cancelled: bool,
    #[serde(default)]
    id: Option<i64>,
    #[serde(default)]
    lockin_start_time: Option<i64>,
    #[serde(default)]
    scouting_start_time: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TournamentStateInfo {
    #[serde(default)]
    current_phase_id: Option<i64>,
    #[serde(default)]
    next_phase_id: Option<i64>,
    #[serde(default)]
    next_state_change_time: Option<i64>,
    #[serde(default)]
    state: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TournamentListItem {
    #[serde(default)]
    id: Option<i64>,
    #[serde(default)]
    schedule_time: Option<i64>,
    #[serde(default)]
    schedule_end_time: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PlayerChatRoster {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    short_name: Option<String>,
    #[serde(default)]
    is_registered: bool,
    #[serde(default)]
    player_state: Option<String>,
    #[serde(default)]
    tournament_id: Option<i64>,
    #[serde(default)]
    tournament_state: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ClashBracket {
    #[serde(default)]
    id: Option<i64>,
    #[serde(default)]
    is_complete: bool,
    #[serde(default)]
    matches: Vec<BracketMatch>,
    #[serde(default)]
    period: Option<i32>,
    #[serde(default)]
    rosters: Vec<BracketRoster>,
    #[serde(default)]
    size: Option<i32>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct BracketMatch {
    #[serde(default)]
    id: i64,
    #[serde(default)]
    game_start_time: Option<i64>,
    #[serde(default)]
    round: Option<i32>,
    #[serde(default)]
    round_start_time: Option<i64>,
    #[serde(default)]
    roster_id1: Option<i64>,
    #[serde(default)]
    roster_id2: Option<i64>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    winner_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct BracketRoster {
    #[serde(default)]
    roster_id: i64,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    short_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ClashRoster {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    short_name: Option<String>,
    #[serde(default)]
    tier: Option<i32>,
    #[serde(default)]
    captain_summoner_id: Option<i64>,
    #[serde(default)]
    is_registered: bool,
    #[serde(default)]
    is_eliminated: bool,
    #[serde(default)]
    is_active_in_current_phase: bool,
    #[serde(default)]
    wins: i32,
    #[serde(default)]
    losses: i32,
    #[serde(default)]
    points: i32,
    #[serde(default)]
    tournament_id: Option<i64>,
    #[serde(default)]
    members: Vec<RosterMember>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RosterMember {
    #[serde(default)]
    summoner_id: Option<i64>,
    #[serde(default)]
    position: Option<String>,
    #[serde(default)]
    state: Option<String>,
    #[serde(default)]
    tier: Option<i32>,
}

/// Lightweight Clash check used once when the app opens. It reads the current
/// tournament and team state without opponent scouting or match history.
pub async fn fetch_overview(client: &LcuClient) -> Result<ClashOverview, LcuError> {
    let now = now_ms();
    let enabled = client
        .get_optional_json::<bool>("/lol-clash/v1/enabled")
        .await
        .ok()
        .flatten()
        .unwrap_or(false);
    let current_ids = client
        .get_optional_json::<Vec<i64>>("/lol-clash/v1/currentTournamentIds")
        .await
        .ok()
        .flatten()
        .unwrap_or_default();
    let all_tournaments = if current_ids.is_empty() {
        client
            .get_optional_json::<Vec<TournamentListItem>>("/lol-clash/v1/all-tournaments")
            .await
            .ok()
            .flatten()
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let tournament_id = choose_tournament_id(&current_ids, &all_tournaments, now);
    let tournament = match tournament_id {
        Some(id) => fetch_tournament(client, id).await,
        None => None,
    };
    let chat_rosters = client
        .get_optional_json::<Vec<PlayerChatRoster>>("/lol-clash/v1/player/chat-rosters")
        .await
        .ok()
        .flatten()
        .unwrap_or_default();
    let team = choose_team(&chat_rosters, tournament_id).map(build_team_view);

    let mut overview = ClashOverview {
        enabled: enabled || !all_tournaments.is_empty(),
        tournament,
        team,
        message: None,
        last_sync_ms: now_ms(),
    };
    if !overview.enabled {
        overview.message = Some(
            "Clash no está habilitado en tu región o el cliente todavía no expone el plugin."
                .into(),
        );
    } else if overview.tournament.is_none() {
        overview.message = Some("No hay un torneo de Clash activo en este momento.".into());
    } else if overview.team.is_none() {
        overview.message = Some(
            "Todavía no tenés un equipo de Clash. Creá un equipo o unite a uno desde League of Legends."
                .into(),
        );
    }
    Ok(overview)
}

/// Lightweight Clash roster lookup for the team tab during the scouting phase.
pub(crate) async fn fetch_roster(client: &LcuClient) -> Option<ClashRosterView> {
    let summaries = client
        .get_optional_json::<Vec<TournamentSummary>>("/lol-clash/v1/tournament-summary")
        .await
        .ok()
        .flatten()
        .unwrap_or_default();
    let summary = choose_summary(&summaries)?;
    let roster_id = summary
        .roster_id
        .clone()
        .filter(|id| !id.is_empty() && id != "0");
    let roster = match roster_id.as_deref() {
        Some(id) => client
            .get_optional_json::<ClashRoster>(&format!("/lol-clash/v1/roster/{id}"))
            .await
            .ok()
            .flatten(),
        None => None,
    };
    let mut view = build_roster_view(
        client,
        roster_id.as_deref(),
        roster.as_ref(),
        summary.state.as_deref(),
    )
    .await?;
    if view.tier.is_none() {
        let summoner_ids: Vec<i64> = view
            .members
            .iter()
            .filter_map(|member| member.summoner_id)
            .collect();
        let player_tiers = fetch_player_tiers(client, summary.tournament_id, &summoner_ids).await;
        view.tier = team_tier_from_player_tiers(&player_tiers);
    }
    Some(view)
}

async fn fetch_player_tiers(
    client: &LcuClient,
    tournament_id: Option<i64>,
    summoner_ids: &[i64],
) -> HashMap<i64, i32> {
    let Some(tournament_id) = tournament_id else {
        return HashMap::new();
    };
    if summoner_ids.is_empty() {
        return HashMap::new();
    }
    let query = json_id_array(summoner_ids);
    client
        .get_optional_json_query::<Vec<PlayerTier>>(
            &format!("/lol-clash/v1/tournament/{tournament_id}/get-player-tiers"),
            &[("summonerIds", query)],
        )
        .await
        .ok()
        .flatten()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| Some((entry.player_id?, entry.tier?)))
        .filter(|(_, tier)| *tier > 0)
        .collect()
}

fn team_tier_from_player_tiers(tiers: &HashMap<i64, i32>) -> Option<i32> {
    tiers.values().copied().min()
}

/// Reads Clash bracket, opponent roster and scouting data from the local LCU.
/// This path is read-only and does not call the Riot API or external proxies.
pub async fn fetch(client: &LcuClient, data: &GameData) -> Result<ClashView, LcuError> {
    let champions = champion_index(data);
    let enabled = client
        .get_optional_json::<bool>("/lol-clash/v1/enabled")
        .await
        .ok()
        .flatten()
        .unwrap_or(false);
    let summaries = client
        .get_optional_json::<Vec<TournamentSummary>>("/lol-clash/v1/tournament-summary")
        .await
        .ok()
        .flatten()
        .unwrap_or_default();

    let mut view = ClashView {
        enabled: enabled || !summaries.is_empty(),
        tournament: None,
        roster: None,
        bracket: None,
        next_match: None,
        opponent: None,
        message: None,
        last_sync_ms: now_ms(),
    };

    if !view.enabled {
        view.message = Some(
            "Clash no está habilitado en tu región o el cliente todavía no expone el plugin."
                .into(),
        );
        return Ok(view);
    }

    let Some(summary) = choose_summary(&summaries).cloned() else {
        view.message = Some(
            "No hay un torneo de Clash activo. Cuando tu equipo se registre, aparecerá acá.".into(),
        );
        return Ok(view);
    };

    let tournament_id = summary.tournament_id;
    let tournament = match tournament_id {
        Some(id) => fetch_tournament(client, id).await,
        None => None,
    };

    let roster = match summary
        .roster_id
        .as_deref()
        .filter(|id| !id.is_empty() && *id != "0")
    {
        Some(id) => client
            .get_optional_json::<ClashRoster>(&format!("/lol-clash/v1/roster/{id}"))
            .await
            .ok()
            .flatten(),
        None => None,
    };

    let player_data = match tournament_id {
        Some(id) => client
            .get_optional_json::<PlayerTournamentData>(&format!(
                "/lol-clash/v1/tournament/{id}/player"
            ))
            .await
            .ok()
            .flatten(),
        None => None,
    };

    let bracket_id = summary.bracket_id.filter(|id| *id > 0).or_else(|| {
        player_data
            .as_ref()
            .and_then(|data| data.bracket_id)
            .filter(|id| *id > 0)
    });
    let roster_id = summary
        .roster_id
        .clone()
        .filter(|id| !id.is_empty() && id != "0")
        .or_else(|| {
            player_data
                .as_ref()
                .and_then(|data| data.roster_id.clone())
                .filter(|id| !id.is_empty() && id != "0")
        });
    let roster_state = player_data
        .as_ref()
        .and_then(|data| data.state.clone())
        .or_else(|| summary.state.clone());

    view.tournament = tournament;
    view.roster = build_roster_view(
        client,
        roster_id.as_deref(),
        roster.as_ref(),
        roster_state.as_deref(),
    )
    .await;

    let Some(bracket_id) = bracket_id else {
        view.message = Some(no_bracket_message(view.roster.as_ref()));
        return Ok(view);
    };

    let bracket = client
        .get_optional_json::<ClashBracket>(&format!("/lol-clash/v1/bracket/{bracket_id}"))
        .await
        .ok()
        .flatten();
    let Some(bracket) = bracket else {
        view.message = Some(
            "El bracket existe, pero el cliente todavía no devolvió sus partidas. Reintentá en unos segundos."
                .into(),
        );
        return Ok(view);
    };

    view.bracket = Some(ClashBracketView {
        id: bracket.id.unwrap_or(bracket_id),
        size: bracket.size,
        period: bracket.period,
        is_complete: bracket.is_complete,
        roster_count: bracket.rosters.len(),
    });

    let our_roster_id =
        resolve_our_roster_id(&summary, player_data.as_ref(), roster.as_ref(), &bracket);
    let Some(our_roster_id) = our_roster_id else {
        view.message = Some(
            "El bracket se leyó, pero no se pudo identificar tu roster dentro de las partidas."
                .into(),
        );
        return Ok(view);
    };

    let Some(next_match) = select_next_match(&bracket, our_roster_id) else {
        view.message =
            Some("Tu equipo está en el bracket, pero no hay un partido asignado todavía.".into());
        return Ok(view);
    };

    let opponent_id = if next_match.roster_id1 == Some(our_roster_id) {
        next_match.roster_id2
    } else {
        next_match.roster_id1
    }
    .filter(|id| *id > 0);
    let opponent_bracket =
        opponent_id.and_then(|id| bracket.rosters.iter().find(|roster| roster.roster_id == id));

    let opponent_roster = match opponent_id {
        Some(id) => client
            .get_optional_json::<ClashRoster>(&format!("/lol-clash/v1/roster/{id}"))
            .await
            .ok()
            .flatten(),
        None => None,
    };

    let opponent_member_ids: Vec<i64> = opponent_roster
        .as_ref()
        .map(|roster| {
            roster
                .members
                .iter()
                .filter_map(|member| member.summoner_id)
                .collect()
        })
        .unwrap_or_default();
    let opponent_player_tiers =
        fetch_player_tiers(client, summary.tournament_id, &opponent_member_ids).await;
    let opponent_tier = opponent_roster
        .as_ref()
        .and_then(|roster| roster.tier)
        .filter(|tier| *tier > 0)
        .or_else(|| team_tier_from_player_tiers(&opponent_player_tiers));

    let opponent = match opponent_id {
        Some(id) => {
            let players = build_players(client, &champions, opponent_roster.as_ref()).await;
            Some(ClashOpponentView {
                roster_id: id,
                name: opponent_roster
                    .as_ref()
                    .and_then(|roster| roster.name.clone())
                    .or_else(|| opponent_bracket.and_then(|roster| roster.name.clone())),
                short_name: opponent_roster
                    .as_ref()
                    .and_then(|roster| roster.short_name.clone())
                    .or_else(|| opponent_bracket.and_then(|roster| roster.short_name.clone())),
                tier: opponent_tier,
                wins: opponent_roster.as_ref().map_or(0, |roster| roster.wins),
                losses: opponent_roster.as_ref().map_or(0, |roster| roster.losses),
                players,
            })
        }
        None => None,
    };

    if opponent
        .as_ref()
        .is_some_and(|opponent| opponent.players.is_empty())
    {
        view.message = Some(
            "El partido está asignado, pero el cliente todavía no expone el roster rival.".into(),
        );
    }

    view.next_match = Some(ClashMatchView {
        id: next_match.id,
        round: next_match.round,
        status: next_match.status.clone(),
        status_label: match_status_label(next_match.status.as_deref()),
        game_start_time_ms: next_match
            .game_start_time
            .filter(|value| *value > 0)
            .or(next_match.round_start_time.filter(|value| *value > 0)),
        round_start_time_ms: next_match.round_start_time.filter(|value| *value > 0),
        our_roster_id,
        our_roster_name: bracket
            .rosters
            .iter()
            .find(|roster| roster.roster_id == our_roster_id)
            .and_then(|roster| roster.name.clone())
            .or_else(|| roster.as_ref().and_then(|roster| roster.name.clone())),
        opponent_roster_id: opponent_id,
        opponent_name: opponent
            .as_ref()
            .and_then(|opponent| opponent.name.clone())
            .or_else(|| opponent_bracket.and_then(|roster| roster.name.clone())),
        opponent_short_name: opponent
            .as_ref()
            .and_then(|opponent| opponent.short_name.clone())
            .or_else(|| opponent_bracket.and_then(|roster| roster.short_name.clone())),
        winner_id: next_match.winner_id,
        result: match_result(next_match, our_roster_id),
        is_completed: next_match.status.as_deref() == Some("COMPLETED"),
    });
    view.opponent = opponent;
    view.last_sync_ms = now_ms();
    Ok(view)
}

fn choose_summary(summaries: &[TournamentSummary]) -> Option<&TournamentSummary> {
    summaries.iter().max_by_key(|summary| {
        let bracket = summary.bracket_id.unwrap_or(0) > 0;
        let state = match summary.state.as_deref() {
            Some("BRACKET_ROSTER") => 4,
            Some("REGISTERED_ROSTER") => 3,
            Some("PENDING_ROSTER") => 2,
            Some("NO_ROSTER") => 1,
            Some("ELIMINATED") => 0,
            _ => 0,
        };
        (bracket, state, summary.tournament_id.unwrap_or(0))
    })
}

async fn fetch_tournament(client: &LcuClient, id: i64) -> Option<ClashTournamentView> {
    let details = client
        .get_optional_json::<ClashTournament>(&format!("/lol-clash/v1/tournament/{id}"))
        .await
        .ok()
        .flatten();
    let state = client
        .get_optional_json::<TournamentStateInfo>(&format!(
            "/lol-clash/v1/tournament/{id}/stateInfo"
        ))
        .await
        .ok()
        .flatten();
    Some(build_tournament(id, details.as_ref(), state.as_ref()))
}

fn build_tournament(
    id: i64,
    details: Option<&ClashTournament>,
    state: Option<&TournamentStateInfo>,
) -> ClashTournamentView {
    let name = details
        .and_then(|details| details.name_loc_key.as_deref())
        .map(clean_key)
        .filter(|name| !name.is_empty() && !name.to_lowercase().contains("clash"))
        .unwrap_or_else(|| "Torneo de Clash".into());
    let subtitle = details
        .and_then(|details| details.name_loc_key_secondary.as_deref())
        .map(clean_key)
        .filter(|subtitle| !subtitle.is_empty());
    let phase = details.and_then(|details| {
        let target = state.and_then(|state| state.next_phase_id.or(state.current_phase_id));
        target
            .and_then(|id| details.phases.iter().find(|phase| phase.id == Some(id)))
            .or_else(|| details.phases.iter().find(|phase| !phase.cancelled))
    });
    ClashTournamentView {
        id,
        name,
        subtitle,
        state: state.and_then(|state| state.state.clone()),
        state_label: tournament_state_label(state.and_then(|state| state.state.as_deref())),
        next_state_change_ms: state
            .and_then(|state| state.next_state_change_time)
            .filter(|value| *value > 0),
        start_time_ms: details
            .and_then(|details| details.start_time_ms)
            .filter(|value| *value > 0),
        end_time_ms: details
            .and_then(|details| details.end_time_ms)
            .filter(|value| *value > 0),
        lockin_start_ms: phase
            .and_then(|phase| phase.lockin_start_time)
            .filter(|value| *value > 0),
        scouting_start_ms: phase
            .and_then(|phase| phase.scouting_start_time)
            .filter(|value| *value > 0),
        queue_id: details.and_then(|details| details.queue_id),
    }
}

fn choose_tournament_id(
    current_ids: &[i64],
    all_tournaments: &[TournamentListItem],
    now: u64,
) -> Option<i64> {
    if let Some(id) = current_ids.first() {
        return Some(*id);
    }
    let now = now as i64;
    all_tournaments
        .iter()
        .filter(|tournament| {
            tournament
                .schedule_end_time
                .is_none_or(|end_time| end_time >= now)
        })
        .min_by_key(|tournament| tournament.schedule_time.unwrap_or(i64::MAX))
        .and_then(|tournament| tournament.id)
}

fn choose_team(
    rosters: &[PlayerChatRoster],
    tournament_id: Option<i64>,
) -> Option<&PlayerChatRoster> {
    tournament_id
        .and_then(|id| {
            rosters
                .iter()
                .find(|roster| roster.tournament_id == Some(id))
        })
        .or_else(|| rosters.first())
}

fn build_team_view(roster: &PlayerChatRoster) -> ClashTeamView {
    let state = roster
        .player_state
        .clone()
        .or_else(|| roster.tournament_state.clone());
    ClashTeamView {
        id: roster.id.clone(),
        name: roster.name.clone(),
        short_name: roster.short_name.clone(),
        is_registered: roster.is_registered,
        state_label: roster_state_label(state.as_deref()),
        state,
    }
}

async fn build_roster_view(
    client: &LcuClient,
    id: Option<&str>,
    roster: Option<&ClashRoster>,
    state: Option<&str>,
) -> Option<ClashRosterView> {
    let members = match roster {
        Some(roster) => build_roster_members(client, roster).await,
        None => Vec::new(),
    };
    build_roster_base(id, roster, state, members)
}

fn build_roster_base(
    id: Option<&str>,
    roster: Option<&ClashRoster>,
    state: Option<&str>,
    members: Vec<ClashRosterMemberView>,
) -> Option<ClashRosterView> {
    let id = id
        .map(str::to_string)
        .or_else(|| roster.and_then(|roster| roster.id.clone()))?;
    let accepted_count = members
        .iter()
        .filter(|member| !member.is_pending && member.state.as_deref() != Some("DECLINED"))
        .count();
    let pending_count = members.iter().filter(|member| member.is_pending).count();
    Some(ClashRosterView {
        id,
        name: roster.and_then(|roster| roster.name.clone()),
        short_name: roster.and_then(|roster| roster.short_name.clone()),
        tier: roster
            .and_then(|roster| roster.tier)
            .filter(|tier| *tier > 0),
        is_registered: roster.is_some_and(|roster| roster.is_registered),
        is_eliminated: roster.is_some_and(|roster| roster.is_eliminated),
        is_active_in_current_phase: roster.is_some_and(|roster| roster.is_active_in_current_phase),
        state: state.map(str::to_string),
        state_label: roster_state_label(state),
        accepted_count,
        pending_count,
        wins: roster.map_or(0, |roster| roster.wins),
        losses: roster.map_or(0, |roster| roster.losses),
        points: roster.map_or(0, |roster| roster.points),
        member_count: if members.is_empty() {
            roster.map_or(0, |roster| roster.members.len())
        } else {
            members.len()
        },
        tournament_id: roster.and_then(|roster| roster.tournament_id),
        members,
    })
}

async fn build_roster_members(
    client: &LcuClient,
    roster: &ClashRoster,
) -> Vec<ClashRosterMemberView> {
    let mut members: Vec<&RosterMember> = roster.members.iter().collect();
    members.sort_by_key(|member| position_rank(member.position.as_deref()));
    let summoner_ids: Vec<i64> = members
        .iter()
        .filter_map(|member| member.summoner_id)
        .collect();
    let summoners = fetch_summoners(client, &summoner_ids).await;

    members
        .into_iter()
        .map(|member| {
            let summoner = member
                .summoner_id
                .and_then(|summoner_id| summoners.get(&summoner_id));
            let state = member.state.clone();
            let is_pending = state.as_deref() == Some("PENDING");
            let display_name = summoner
                .and_then(|summoner| summoner.game_name.clone())
                .filter(|name| !name.is_empty())
                .or_else(|| {
                    summoner
                        .and_then(|summoner| summoner.display_name.clone())
                        .filter(|name| !name.is_empty())
                })
                .or_else(|| member.summoner_id.map(|id| format!("Jugador {id}")))
                .unwrap_or_else(|| "Jugador".into());
            ClashRosterMemberView {
                summoner_id: member.summoner_id,
                puuid: summoner.and_then(|summoner| summoner.puuid.clone()),
                display_name,
                tag_line: summoner.and_then(|summoner| summoner.tag_line.clone()),
                level: summoner.and_then(|summoner| summoner.summoner_level),
                profile_icon_id: summoner.and_then(|summoner| summoner.profile_icon_id),
                position: member.position.clone(),
                position_label: position_label(member.position.as_deref()),
                state_label: member_state_label(state.as_deref()),
                state,
                tier: member.tier.filter(|tier| *tier > 0),
                is_captain: member.summoner_id == roster.captain_summoner_id,
                is_pending,
            }
        })
        .collect()
}

fn no_bracket_message(roster: Option<&ClashRosterView>) -> String {
    let Some(roster) = roster else {
        return "Todavía no tenés un equipo de Clash. Creá un equipo o unite a uno desde League of Legends."
            .into();
    };
    if roster.accepted_count < 5 {
        let missing = 5usize.saturating_sub(roster.accepted_count);
        return format!(
            "Tu equipo está formado. Faltan {missing} jugador{} por aceptar.",
            if missing == 1 { "" } else { "es" }
        );
    }
    if !roster.is_registered {
        return "El equipo está completo. Falta registrarse para el torneo.".into();
    }
    "Tu equipo está registrado. Esperando que se forme el bracket.".into()
}

fn tournament_state_label(state: Option<&str>) -> String {
    match state {
        Some("UPCOMING") => "Próximo",
        Some("IDLE") => "En espera",
        Some("LOCK_IN") => "Lock-in",
        Some("SCOUTING") => "Scouting",
        Some("IN_GAME") => "En partida",
        Some("RESULTS") => "Resultados",
        _ => "Sin estado",
    }
    .into()
}

fn roster_state_label(state: Option<&str>) -> String {
    match state {
        Some("PENDING_ROSTER") => "Equipo pendiente",
        Some("REGISTERED_ROSTER") => "Registrado",
        Some("BRACKET_ROSTER") => "En bracket",
        Some("ELIMINATED") => "Eliminado",
        Some("NO_ROSTER") => "Sin equipo",
        Some("IDLE") => "En espera",
        _ => "Sin estado",
    }
    .into()
}

fn member_state_label(state: Option<&str>) -> String {
    match state {
        Some("READY") => "Listo",
        Some("NOT_READY") => "Aceptado",
        Some("FORCED_NOT_READY") => "Aceptado",
        Some("PENDING") => "Pendiente",
        Some("DECLINED") => "Rechazó",
        _ => "Sin estado",
    }
    .into()
}

fn resolve_our_roster_id(
    summary: &TournamentSummary,
    player_data: Option<&PlayerTournamentData>,
    roster: Option<&ClashRoster>,
    bracket: &ClashBracket,
) -> Option<i64> {
    let numeric = summary
        .roster_id
        .as_deref()
        .and_then(parse_roster_id)
        .or_else(|| {
            player_data
                .and_then(|data| data.roster_id.as_deref())
                .and_then(parse_roster_id)
        });
    if let Some(candidate) = numeric
        && bracket
            .matches
            .iter()
            .any(|game| game.roster_id1 == Some(candidate) || game.roster_id2 == Some(candidate))
    {
        return Some(candidate);
    }

    let by_name = roster
        .and_then(|roster| roster.name.as_deref())
        .and_then(|name| find_bracket_roster(bracket, name))
        .or_else(|| {
            roster
                .and_then(|roster| roster.short_name.as_deref())
                .and_then(|name| find_bracket_roster(bracket, name))
        });
    by_name.or(numeric)
}

fn find_bracket_roster(bracket: &ClashBracket, name: &str) -> Option<i64> {
    bracket
        .rosters
        .iter()
        .find(|candidate| {
            candidate
                .name
                .as_deref()
                .is_some_and(|candidate| same_name(candidate, name))
                || candidate
                    .short_name
                    .as_deref()
                    .is_some_and(|candidate| same_name(candidate, name))
        })
        .map(|candidate| candidate.roster_id)
}

fn same_name(left: &str, right: &str) -> bool {
    left.trim().eq_ignore_ascii_case(right.trim())
}

fn parse_roster_id(value: &str) -> Option<i64> {
    value.trim().parse::<i64>().ok()
}

fn select_next_match(bracket: &ClashBracket, our_roster_id: i64) -> Option<&BracketMatch> {
    let mut matches: Vec<&BracketMatch> = bracket
        .matches
        .iter()
        .filter(|game| {
            game.roster_id1 == Some(our_roster_id) || game.roster_id2 == Some(our_roster_id)
        })
        .collect();
    matches.sort_by(|left, right| {
        let left_rank = match_rank(left);
        let right_rank = match_rank(right);
        left_rank.cmp(&right_rank).then_with(|| {
            let left_time = match_time(left);
            let right_time = match_time(right);
            if left_rank == 2 {
                right_time.cmp(&left_time)
            } else {
                left_time.cmp(&right_time)
            }
        })
    });
    matches.into_iter().next()
}

fn match_rank(game: &BracketMatch) -> u8 {
    match game.status.as_deref() {
        Some("STARTED") => 0,
        Some("UPCOMING") => 1,
        Some("COMPLETED") => 2,
        _ => 3,
    }
}

fn match_time(game: &BracketMatch) -> i64 {
    game.game_start_time
        .filter(|value| *value > 0)
        .or(game.round_start_time.filter(|value| *value > 0))
        .unwrap_or(i64::MAX)
}

fn match_status_label(status: Option<&str>) -> String {
    match status {
        Some("UPCOMING") => "Programado",
        Some("STARTED") => "En curso",
        Some("COMPLETED") => "Finalizado",
        _ => "Sin estado",
    }
    .into()
}

fn match_result(game: &BracketMatch, our_roster_id: i64) -> Option<String> {
    if game.status.as_deref() != Some("COMPLETED") {
        return None;
    }
    game.winner_id.filter(|winner| *winner > 0).map(|winner| {
        if winner == our_roster_id {
            "win".into()
        } else {
            "loss".into()
        }
    })
}

async fn build_players(
    client: &LcuClient,
    champions: &HashMap<i32, (String, String)>,
    roster: Option<&ClashRoster>,
) -> Vec<ClashPlayerView> {
    let Some(roster) = roster else {
        return Vec::new();
    };

    let mut members: Vec<&RosterMember> = roster.members.iter().collect();
    members.sort_by_key(|member| position_rank(member.position.as_deref()));

    let summoner_ids: Vec<i64> = members
        .iter()
        .filter_map(|member| member.summoner_id)
        .collect();
    let summoners = fetch_summoners(client, &summoner_ids).await;

    let puuids: Vec<String> = members
        .iter()
        .filter_map(|member| member.summoner_id)
        .filter_map(|id| summoners.get(&id))
        .filter_map(|summoner| summoner.puuid.clone())
        .collect();
    let scouting = fetch_scouting(client, &puuids).await;

    let mut players = Vec::with_capacity(members.len());
    for (index, member) in members.iter().enumerate() {
        let summoner_id = member.summoner_id;
        let summoner = summoner_id.and_then(|id| summoners.get(&id));
        let puuid = summoner.and_then(|summoner| summoner.puuid.clone());
        let display_name = summoner
            .and_then(|summoner| summoner.game_name.clone())
            .filter(|name| !name.is_empty())
            .or_else(|| {
                summoner
                    .and_then(|summoner| summoner.display_name.clone())
                    .filter(|name| !name.is_empty())
            })
            .or_else(|| summoner_id.map(|id| format!("Jugador {id}")))
            .unwrap_or_else(|| format!("Jugador {}", index + 1));
        let tag_line = summoner.and_then(|summoner| summoner.tag_line.clone());
        let ranks = match puuid.as_deref() {
            Some(puuid) => fetch_ranks(client, puuid).await,
            None => Vec::new(),
        };
        let recent_matches = match puuid.as_deref() {
            Some(puuid) => fetch_recent_matches(client, champions, puuid, summoner_id).await,
            None => Vec::new(),
        };
        let scouting = scouting
            .iter()
            .find(|entry| entry.player_id == summoner_id)
            .or_else(|| scouting.get(index))
            .map(|entry| build_scouting(entry, champions));

        players.push(ClashPlayerView {
            summoner_id,
            puuid,
            display_name,
            tag_line,
            level: summoner.and_then(|summoner| summoner.summoner_level),
            profile_icon_id: summoner.and_then(|summoner| summoner.profile_icon_id),
            position: member.position.clone(),
            position_label: position_label(member.position.as_deref()),
            member_state: member.state.clone(),
            tier: member.tier,
            ranks,
            scouting,
            recent_matches,
        });
    }
    players
}

fn position_rank(position: Option<&str>) -> u8 {
    match position {
        Some("TOP") => 0,
        Some("JUNGLE") => 1,
        Some("MIDDLE") => 2,
        Some("BOTTOM") => 3,
        Some("UTILITY") => 4,
        Some("FILL") => 5,
        _ => 6,
    }
}

fn position_label(position: Option<&str>) -> String {
    match position {
        Some("TOP") => "Top",
        Some("JUNGLE") => "Jungla",
        Some("MIDDLE") => "Mid",
        Some("BOTTOM") => "ADC",
        Some("UTILITY") => "Support",
        Some("FILL") => "Fill",
        _ => "Sin rol",
    }
    .into()
}

fn clean_key(key: &str) -> String {
    let key = key.trim();
    if let Some(day) = key.strip_prefix("day_") {
        return format!("Día {day}");
    }
    let cleaned = key.replace('_', " ");
    let mut spaced = String::new();
    let mut previous: Option<char> = None;
    for character in cleaned.chars() {
        if previous.is_some_and(|previous| character.is_ascii_digit() && !previous.is_ascii_digit())
        {
            spaced.push(' ');
        }
        spaced.push(character);
        previous = Some(character);
    }
    let mut chars = spaced.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{
        BracketMatch, BracketRoster, ClashBracket, ClashRoster, ClashRosterMemberView,
        ClashTournament, PlayerChatRoster, TournamentListItem, TournamentPhase,
        TournamentStateInfo, TournamentSummary, build_roster_base, build_team_view,
        build_tournament, choose_summary, choose_tournament_id, match_result, no_bracket_message,
        resolve_our_roster_id, select_next_match,
    };
    use crate::lcu::scouting::{
        MatchHistoryPage, RankedQueueStats, RankedStats, build_ranks, json_id_array,
        json_puuid_array, recent_match,
    };
    use std::collections::HashMap;

    fn summary(bracket_id: Option<i64>, state: &str) -> TournamentSummary {
        TournamentSummary {
            tournament_id: Some(1),
            roster_id: Some("10".into()),
            bracket_id,
            state: Some(state.into()),
        }
    }

    fn bracket() -> ClashBracket {
        ClashBracket {
            id: Some(99),
            is_complete: false,
            matches: vec![
                BracketMatch {
                    id: 1,
                    game_start_time: Some(1_000),
                    round: Some(1),
                    round_start_time: None,
                    roster_id1: Some(10),
                    roster_id2: Some(20),
                    status: Some("COMPLETED".into()),
                    winner_id: Some(10),
                },
                BracketMatch {
                    id: 2,
                    game_start_time: Some(2_000),
                    round: Some(2),
                    round_start_time: None,
                    roster_id1: Some(30),
                    roster_id2: Some(10),
                    status: Some("UPCOMING".into()),
                    winner_id: None,
                },
            ],
            period: Some(1),
            rosters: vec![
                BracketRoster {
                    roster_id: 10,
                    name: Some("Nuestro equipo".into()),
                    short_name: Some("NOS".into()),
                },
                BracketRoster {
                    roster_id: 30,
                    name: Some("Rival".into()),
                    short_name: Some("RIV".into()),
                },
            ],
            size: Some(8),
        }
    }

    #[test]
    fn prefers_a_tournament_with_a_bracket() {
        let summaries = vec![
            summary(None, "REGISTERED_ROSTER"),
            summary(Some(99), "BRACKET_ROSTER"),
        ];
        assert_eq!(choose_summary(&summaries).unwrap().bracket_id, Some(99));
    }

    #[test]
    fn selects_the_upcoming_match_and_identifies_the_opponent() {
        let bracket = bracket();
        let game = select_next_match(&bracket, 10).unwrap();
        assert_eq!(game.id, 2);
        assert_eq!(game.roster_id1, Some(30));
    }

    #[test]
    fn completed_matches_report_the_result() {
        let bracket = bracket();
        let game = &bracket.matches[0];
        assert_eq!(match_result(game, 10).as_deref(), Some("win"));
        assert_eq!(match_result(game, 20).as_deref(), Some("loss"));
    }

    #[test]
    fn builds_tournament_and_roster_views() {
        let tournament = build_tournament(
            7,
            Some(&ClashTournament {
                name_loc_key: Some("freljord".into()),
                name_loc_key_secondary: Some("day_1".into()),
                queue_id: Some(700),
                start_time_ms: Some(1_000),
                end_time_ms: Some(9_000),
                phases: vec![TournamentPhase {
                    id: Some(1),
                    lockin_start_time: Some(5_000),
                    scouting_start_time: Some(6_000),
                    ..Default::default()
                }],
            }),
            Some(&TournamentStateInfo {
                next_state_change_time: Some(5_000),
                state: Some("LOCK_IN".into()),
                next_phase_id: Some(1),
                ..Default::default()
            }),
        );
        assert_eq!(tournament.name, "Freljord");
        assert_eq!(tournament.subtitle.as_deref(), Some("Día 1"));
        assert_eq!(tournament.state_label, "Lock-in");
        assert_eq!(tournament.start_time_ms, Some(1_000));
        assert_eq!(tournament.end_time_ms, Some(9_000));
        assert_eq!(tournament.lockin_start_ms, Some(5_000));
        assert_eq!(tournament.scouting_start_ms, Some(6_000));

        let roster = build_roster_base(
            Some("10"),
            Some(&ClashRoster {
                id: Some("10".into()),
                name: Some("Nuestro equipo".into()),
                short_name: Some("NOS".into()),
                tier: Some(2),
                is_registered: true,
                is_eliminated: false,
                is_active_in_current_phase: true,
                wins: 3,
                losses: 1,
                points: 9,
                tournament_id: Some(7),
                members: Vec::new(),
                ..Default::default()
            }),
            Some("REGISTERED_ROSTER"),
            Vec::new(),
        )
        .unwrap();
        assert_eq!(roster.name.as_deref(), Some("Nuestro equipo"));
        assert!(roster.is_registered);
        assert_eq!(roster.wins, 3);
    }

    #[test]
    fn counts_accepted_and_pending_roster_members() {
        let roster = ClashRoster {
            id: Some("10".into()),
            name: Some("Draft assist".into()),
            short_name: Some("dal".into()),
            captain_summoner_id: Some(1),
            members: Vec::new(),
            ..Default::default()
        };
        let members = vec![
            ClashRosterMemberView {
                summoner_id: Some(1),
                display_name: "TopDemo".into(),
                state: Some("NOT_READY".into()),
                state_label: "Aceptado".into(),
                is_pending: false,
                is_captain: true,
                ..Default::default()
            },
            ClashRosterMemberView {
                summoner_id: Some(2),
                display_name: "JungleDemo".into(),
                state: Some("READY".into()),
                is_pending: false,
                ..Default::default()
            },
            ClashRosterMemberView {
                summoner_id: Some(3),
                display_name: "Pendiente 1".into(),
                state: Some("PENDING".into()),
                is_pending: true,
                ..Default::default()
            },
            ClashRosterMemberView {
                summoner_id: Some(4),
                display_name: "Pendiente 2".into(),
                state: Some("PENDING".into()),
                is_pending: true,
                ..Default::default()
            },
            ClashRosterMemberView {
                summoner_id: Some(5),
                display_name: "Pendiente 3".into(),
                state: Some("PENDING".into()),
                is_pending: true,
                ..Default::default()
            },
        ];
        let view =
            build_roster_base(Some("10"), Some(&roster), Some("PENDING_ROSTER"), members).unwrap();
        assert_eq!(view.accepted_count, 2);
        assert_eq!(view.pending_count, 3);
        assert_eq!(view.member_count, 5);
        assert_eq!(view.state_label, "Equipo pendiente");
        assert!(!view.is_registered);
        assert_eq!(view.members[0].state_label, "Aceptado");
        assert!(view.members[0].is_captain);
    }

    #[test]
    fn explains_the_next_step_when_there_is_no_bracket() {
        let roster = ClashRoster {
            id: Some("10".into()),
            name: Some("Draft assist".into()),
            members: Vec::new(),
            ..Default::default()
        };
        let members = (1..=5)
            .map(|id| ClashRosterMemberView {
                summoner_id: Some(id),
                display_name: format!("Jugador {id}"),
                state: Some(if id <= 2 { "NOT_READY" } else { "PENDING" }.into()),
                is_pending: id > 2,
                ..Default::default()
            })
            .collect();
        let view =
            build_roster_base(Some("10"), Some(&roster), Some("PENDING_ROSTER"), members).unwrap();
        assert!(no_bracket_message(Some(&view)).contains("Faltan 3 jugadores"));
        assert!(no_bracket_message(None).contains("Creá un equipo"));
    }

    #[test]
    fn chooses_the_current_tournament_before_upcoming_ones() {
        let all = vec![TournamentListItem {
            id: Some(22),
            schedule_time: Some(2_000),
            schedule_end_time: Some(3_000),
        }];
        assert_eq!(choose_tournament_id(&[21], &all, 1_000), Some(21));
        assert_eq!(choose_tournament_id(&[], &all, 1_000), Some(22));
        assert_eq!(choose_tournament_id(&[], &all, 4_000), None);
    }

    #[test]
    fn builds_a_team_view_from_chat_rosters() {
        let team = build_team_view(&PlayerChatRoster {
            id: Some("team-id".into()),
            name: Some("Draft assist".into()),
            short_name: Some("dal".into()),
            is_registered: false,
            player_state: Some("PENDING_ROSTER".into()),
            tournament_id: Some(21),
            tournament_state: Some("IDLE".into()),
        });
        assert_eq!(team.name.as_deref(), Some("Draft assist"));
        assert_eq!(team.state_label, "Equipo pendiente");
        assert!(!team.is_registered);
    }

    #[test]
    fn serializes_lcu_query_arrays_for_summoners_and_puuids() {
        assert_eq!(json_id_array(&[1001, 1002]), "[1001,1002]");
        assert_eq!(
            json_puuid_array(&["dbaa-1".into(), "9b90-2".into()]),
            "[\"dbaa-1\",\"9b90-2\"]"
        );
    }

    #[test]
    fn resolves_our_roster_by_name_when_the_id_is_not_usable() {
        let bracket = bracket();
        let summary = TournamentSummary {
            tournament_id: Some(1),
            roster_id: Some("not-a-number".into()),
            bracket_id: Some(99),
            state: Some("BRACKET_ROSTER".into()),
        };
        let roster = ClashRoster {
            id: Some("not-a-number".into()),
            name: Some("Nuestro equipo".into()),
            short_name: Some("NOS".into()),
            ..Default::default()
        };
        assert_eq!(
            resolve_our_roster_id(&summary, None, Some(&roster), &bracket),
            Some(10)
        );
    }

    #[test]
    fn falls_back_to_the_name_when_the_numeric_id_is_not_in_the_bracket() {
        let bracket = bracket();
        let summary = TournamentSummary {
            tournament_id: Some(1),
            roster_id: Some("999".into()),
            bracket_id: Some(99),
            state: Some("BRACKET_ROSTER".into()),
        };
        let roster = ClashRoster {
            id: Some("999".into()),
            name: Some("Nuestro equipo".into()),
            short_name: Some("NOS".into()),
            ..Default::default()
        };
        assert_eq!(
            resolve_our_roster_id(&summary, None, Some(&roster), &bracket),
            Some(10)
        );
    }

    #[test]
    fn parses_ranked_stats_from_the_lcu_payload() {
        let stats: RankedStats = serde_json::from_str(
            r#"{
                "queues": [
                    {
                        "queueType": "RANKED_SOLO_5x5",
                        "tier": "GOLD",
                        "division": "II",
                        "leaguePoints": 42,
                        "wins": 20,
                        "losses": 10,
                        "isProvisional": false
                    }
                ],
                "queueMap": {}
            }"#,
        )
        .unwrap();
        let ranks = build_ranks(&stats);
        assert_eq!(ranks.len(), 1);
        assert_eq!(ranks[0].tier, "GOLD");
        assert_eq!(ranks[0].division.as_deref(), Some("II"));
        assert_eq!(ranks[0].league_points, Some(42));
    }

    #[test]
    fn parses_a_recent_match_for_the_opponent_puuid() {
        let page: MatchHistoryPage = serde_json::from_str(
            r#"{
                "games": {
                    "games": [
                        {
                            "gameId": 123,
                            "gameCreation": 1700000000000,
                            "gameDuration": 1800,
                            "queueId": 420,
                            "participantIdentities": [
                                {
                                    "participantId": 3,
                                    "player": { "puuid": "opponent-puuid", "summonerId": 1001 }
                                }
                            ],
                            "participants": [
                                {
                                    "participantId": 3,
                                    "championId": 103,
                                    "stats": {
                                        "win": true,
                                        "kills": 7,
                                        "deaths": 2,
                                        "assists": 5
                                    },
                                    "timeline": { "lane": "MIDDLE" }
                                }
                            ]
                        }
                    ]
                }
            }"#,
        )
        .unwrap();
        let mut champions = HashMap::new();
        champions.insert(103, ("Ahri".to_string(), "Ahri".to_string()));
        let game = page.games.unwrap().games.pop().unwrap();
        let recent = recent_match(game, &champions, "opponent-puuid", Some(1001)).unwrap();
        assert_eq!(recent.champion_id, "Ahri");
        assert_eq!(recent.win, Some(true));
        assert_eq!((recent.kills, recent.deaths, recent.assists), (7, 2, 5));
        assert_eq!(recent.queue_name, "Ranked Solo/Duo");
        assert_eq!(recent.role.as_deref(), Some("Mid"));
    }

    #[test]
    fn computes_rank_winrate_and_orders_solo_before_flex() {
        let stats = RankedStats {
            queues: vec![
                RankedQueueStats {
                    queue_type: Some("RANKED_FLEX_SR".into()),
                    tier: Some("SILVER".into()),
                    division: Some("I".into()),
                    league_points: Some(10),
                    wins: Some(5),
                    losses: Some(5),
                    is_provisional: None,
                },
                RankedQueueStats {
                    queue_type: Some("RANKED_SOLO_5x5".into()),
                    tier: Some("GOLD".into()),
                    division: Some("II".into()),
                    league_points: Some(42),
                    wins: Some(20),
                    losses: Some(10),
                    is_provisional: None,
                },
            ],
            queue_map: Default::default(),
        };
        let ranks = build_ranks(&stats);
        assert_eq!(ranks.len(), 2);
        assert_eq!(ranks[0].queue_label, "Solo/Duo");
        assert_eq!(ranks[0].tier, "GOLD");
        assert_eq!(ranks[0].winrate, Some(66.66666666666666));
        assert_eq!(ranks[1].queue_label, "Flex");
    }

    #[test]
    fn team_tier_uses_the_best_player_tier() {
        let tiers = std::collections::HashMap::from([(1, 4), (2, 2), (3, 4)]);
        assert_eq!(super::team_tier_from_player_tiers(&tiers), Some(2));
        assert_eq!(
            super::team_tier_from_player_tiers(&std::collections::HashMap::new()),
            None
        );
    }
}
