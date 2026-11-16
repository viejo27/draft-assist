use super::model::{
    ChampSelectAction, ChampSelectSession, GameflowSession, LcuActionView, LcuSnapshot, LcuStatus,
    Lobby,
};
use draft_engine::data::GameData;
use draft_engine::model::{
    DraftState, DraftTemplate, EnemyPick, LcuTurn, Phase, Role, Roster, Side, TeamNeed, TeamPick,
};
use std::collections::HashSet;

#[derive(Debug, Clone)]
pub struct TrackingConfig {
    pub roster: Roster,
    pub priorities: Vec<TeamNeed>,
    pub side: Side,
}

pub fn validate_roster(roster: &Roster) -> Result<(), String> {
    if roster.players.len() != 5 {
        return Err(format!(
            "El roster debe tener 5 jugadores; ahora tiene {}.",
            roster.players.len()
        ));
    }

    let mut seen = HashSet::new();
    for player in &roster.players {
        if !seen.insert(player.role) {
            return Err(format!(
                "Hay más de un jugador con el rol {}.",
                player.role.label_es()
            ));
        }
    }

    for role in Role::ALL {
        if !seen.contains(&role) {
            return Err(format!("Falta un jugador para el rol {}.", role.label_es()));
        }
    }

    Ok(())
}

pub fn role_from_position(position: &str) -> Option<Role> {
    match position.trim().to_ascii_lowercase().as_str() {
        "top" => Some(Role::Top),
        "jungle" => Some(Role::Jungle),
        "middle" | "mid" => Some(Role::Mid),
        "bottom" | "adc" => Some(Role::Adc),
        "utility" | "support" => Some(Role::Support),
        _ => None,
    }
}

pub fn queue_name(queue_id: Option<i64>) -> Option<String> {
    queue_id.map(|id| match id {
        420 => "Ranked Solo/Duo".to_string(),
        440 => "Ranked Flex".to_string(),
        400 => "Normal Draft".to_string(),
        700 => "Clash".to_string(),
        0 => "Custom".to_string(),
        _ => format!("Cola {id}"),
    })
}

pub fn detect_template(queue_id: Option<i64>, simultaneous_bans: Option<bool>) -> String {
    if let Some(simultaneous) = simultaneous_bans {
        return if simultaneous { "ranked" } else { "tournament" }.into();
    }

    match queue_id {
        Some(420 | 440 | 400) => "ranked",
        Some(700) => "tournament",
        Some(0) => "tournament",
        _ => "ranked",
    }
    .into()
}

pub fn build_snapshot(
    phase: &str,
    gameflow: Option<&GameflowSession>,
    lobby: Option<&Lobby>,
    session: Option<&ChampSelectSession>,
    config: &TrackingConfig,
    data: &GameData,
    auto: bool,
) -> LcuSnapshot {
    let queue_id = gameflow
        .and_then(|gameflow| gameflow.game_data.as_ref())
        .and_then(|game_data| game_data.queue.as_ref())
        .and_then(|queue| queue.id)
        .or_else(|| {
            lobby
                .and_then(|lobby| lobby.game_config.as_ref())
                .and_then(|config| config.queue_id)
        });

    let simultaneous_bans = session.and_then(|session| session.has_simultaneous_bans);
    let template_id = detect_template(queue_id, simultaneous_bans);
    let mut status = LcuStatus {
        state: "connected".into(),
        connected: true,
        phase: Some(phase.to_string()),
        queue_id,
        queue_name: queue_name(queue_id),
        template_id: Some(template_id.clone()),
        side: None,
        local_player: None,
        current_action: None,
        last_error: None,
        last_sync_ms: None,
        auto,
    };

    let draft = if phase == "ChampSelect" {
        match session {
            Some(session) => {
                match draft_from_session(session, queue_id, &template_id, config, data, lobby) {
                    Ok((draft, action, local_player)) => {
                        status.side = Some(draft.side);
                        status.current_action = action;
                        status.local_player = local_player;
                        Some(draft)
                    }
                    Err(error) => {
                        status.last_error = Some(error);
                        None
                    }
                }
            }
            None => None,
        }
    } else if phase == "Lobby" {
        Some(prepared_lobby_draft(&template_id, config))
    } else {
        None
    };

    LcuSnapshot { status, draft }
}

fn prepared_lobby_draft(template_id: &str, config: &TrackingConfig) -> DraftState {
    DraftState {
        version: 1,
        side: config.side,
        template_id: template_id.to_string(),
        step_index: 0,
        our_bans: vec![],
        enemy_bans: vec![],
        our_picks: vec![],
        enemy_picks: vec![],
        priorities: config.priorities.clone(),
        current_player_id: None,
        manual: None,
        lcu_turn: None,
    }
}

fn draft_from_session(
    session: &ChampSelectSession,
    queue_id: Option<i64>,
    template_id: &str,
    config: &TrackingConfig,
    data: &GameData,
    lobby: Option<&Lobby>,
) -> Result<(DraftState, Option<LcuActionView>, Option<String>), String> {
    validate_roster(&config.roster)?;

    let local_player = session
        .my_team
        .iter()
        .find(|player| player.cell_id == session.local_player_cell_id)
        .ok_or_else(|| "No se encontró al jugador local en el champ select.".to_string())?;

    let side = match local_player.team {
        Some(1) => Side::Blue,
        Some(2) => Side::Red,
        _ => infer_side(session)?,
    };

    let our_picks = map_our_picks(&session.my_team, &config.roster, data)?;
    let enemy_picks = map_enemy_picks(&session.their_team, data)?;
    let mut our_bans = map_bans(&session.bans.my_team_bans, data);
    let mut enemy_bans = map_bans(&session.bans.their_team_bans, data);
    let all_actions: Vec<&ChampSelectAction> = session.actions.iter().flatten().collect();
    merge_action_bans(session, &all_actions, data, &mut our_bans, &mut enemy_bans);
    let local_action = all_actions.iter().copied().find(|action| {
        action.is_in_progress && action.actor_cell_id == session.local_player_cell_id
    });
    let any_action = all_actions
        .iter()
        .copied()
        .find(|action| action.is_in_progress);
    let active_action = local_action.or(any_action);

    let (lcu_turn, current_action) =
        build_turn(session, active_action, side, &our_picks, &config.roster)?;
    let current_player_id = lcu_turn.as_ref().and_then(|turn| turn.player_id.clone());

    let template = data
        .template(template_id)
        .ok_or_else(|| format!("La plantilla {template_id} no existe."))?;
    let step_index = compute_step_index(
        template,
        active_action,
        session,
        our_bans.len() + enemy_bans.len(),
        our_picks.len() + enemy_picks.len(),
    );

    let local_player_name = local_player_name(session, lobby);

    let draft = DraftState {
        version: 1,
        side,
        template_id: template_id.to_string(),
        step_index,
        our_bans,
        enemy_bans,
        our_picks,
        enemy_picks,
        priorities: config.priorities.clone(),
        current_player_id,
        manual: None,
        lcu_turn,
    };

    let _ = queue_id;
    Ok((draft, current_action, local_player_name))
}

fn infer_side(session: &ChampSelectSession) -> Result<Side, String> {
    let first_pick = session
        .actions
        .iter()
        .flatten()
        .filter(|action| action.action_type == "pick")
        .min_by_key(|action| action.pick_turn);
    let Some(first_pick) = first_pick else {
        return Err("No se pudo inferir el lado del mapa.".into());
    };
    let is_ours = session
        .my_team
        .iter()
        .any(|player| player.cell_id == first_pick.actor_cell_id);
    Ok(if is_ours { Side::Blue } else { Side::Red })
}

fn map_our_picks(
    players: &[super::model::ChampSelectPlayer],
    roster: &Roster,
    data: &GameData,
) -> Result<Vec<TeamPick>, String> {
    let mut picks = Vec::new();
    for player in players {
        if player.champion_id <= 0 {
            continue;
        }
        let role = role_from_position(&player.assigned_position).ok_or_else(|| {
            format!(
                "El cliente no expuso una posición válida para el jugador de la celda {}.",
                player.cell_id
            )
        })?;
        let roster_player = roster
            .players
            .iter()
            .find(|candidate| candidate.role == role)
            .ok_or_else(|| format!("El roster no tiene jugador para {}.", role.label_es()))?;
        let champion_id = champion_id_for_key(data, player.champion_id)
            .ok_or_else(|| format!("Campeón LCU desconocido: {}.", player.champion_id))?;
        picks.push(TeamPick {
            player_id: roster_player.id.clone(),
            champion_id,
            role,
        });
    }
    picks.sort_by_key(|pick| role_rank(pick.role));
    Ok(picks)
}

fn map_enemy_picks(
    players: &[super::model::ChampSelectPlayer],
    data: &GameData,
) -> Result<Vec<EnemyPick>, String> {
    let mut picks = Vec::new();
    for player in players {
        if player.champion_id <= 0 {
            continue;
        }
        let champion_id = champion_id_for_key(data, player.champion_id)
            .ok_or_else(|| format!("Campeón LCU desconocido: {}.", player.champion_id))?;
        picks.push(EnemyPick {
            champion_id,
            role: role_from_position(&player.assigned_position),
        });
    }
    picks.sort_by_key(|pick| pick.role.map_or(u8::MAX, role_rank));
    Ok(picks)
}

fn merge_action_bans(
    session: &ChampSelectSession,
    actions: &[&ChampSelectAction],
    data: &GameData,
    our_bans: &mut Vec<String>,
    enemy_bans: &mut Vec<String>,
) {
    for action in actions {
        if action.action_type != "ban" || !action.completed || action.champion_id <= 0 {
            continue;
        }
        let Some(champion_id) = champion_id_for_key(data, action.champion_id) else {
            continue;
        };
        let is_ours = session
            .my_team
            .iter()
            .any(|player| player.cell_id == action.actor_cell_id);
        let target: &mut Vec<String> = if is_ours {
            &mut *our_bans
        } else {
            &mut *enemy_bans
        };
        if !target.contains(&champion_id) {
            target.push(champion_id);
        }
    }
}

fn map_bans(values: &[i64], data: &GameData) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut bans = Vec::new();
    for value in values {
        if *value <= 0 {
            continue;
        }
        if let Some(champion_id) = champion_id_for_key(data, *value)
            && seen.insert(champion_id.clone())
        {
            bans.push(champion_id);
        }
    }
    bans
}

fn build_turn(
    session: &ChampSelectSession,
    active_action: Option<&ChampSelectAction>,
    side: Side,
    our_picks: &[TeamPick],
    roster: &Roster,
) -> Result<(Option<LcuTurn>, Option<LcuActionView>), String> {
    let Some(action) = active_action else {
        return Ok((None, None));
    };

    let phase = match action.action_type.as_str() {
        "ban" => Phase::Ban,
        "pick" => Phase::Pick,
        _ => return Ok((None, None)),
    };

    let actor_is_ours = session
        .my_team
        .iter()
        .any(|player| player.cell_id == action.actor_cell_id);
    let acting_side = if actor_is_ours { side } else { side.other() };
    let player = if actor_is_ours {
        session
            .my_team
            .iter()
            .find(|player| player.cell_id == action.actor_cell_id)
    } else {
        None
    };
    let role = player.and_then(|player| role_from_position(&player.assigned_position));
    let roster_player =
        role.and_then(|role| roster.players.iter().find(|player| player.role == role));
    let player_id = roster_player.map(|player| player.id.clone());
    let player_name = roster_player.map(|player| player.name.clone());
    let pick_number = if phase == Phase::Pick && acting_side == side {
        Some((our_picks.len() as u8).saturating_add(1))
    } else {
        None
    };

    let label = match phase {
        Phase::Ban => {
            if acting_side == side {
                "Ban aliado".to_string()
            } else {
                "Ban rival".to_string()
            }
        }
        Phase::Pick => {
            if acting_side == side {
                format!("Pick {} {}", side.label_es(), pick_number.unwrap_or(1))
            } else {
                format!("Pick {}", side.other().label_es())
            }
        }
    };

    let seconds_left = session
        .timer
        .as_ref()
        .map(|timer| (timer.adjusted_time_left_in_phase / 1000).max(0));

    let turn = LcuTurn {
        phase,
        acting_side,
        player_id: player_id.clone(),
        pick_number,
        label: label.clone(),
    };
    let view = LcuActionView {
        phase,
        acting_side,
        player_id,
        player_name,
        pick_number,
        label,
        action_id: action.id,
        seconds_left,
    };

    Ok((Some(turn), Some(view)))
}

fn compute_step_index(
    template: &DraftTemplate,
    active_action: Option<&ChampSelectAction>,
    session: &ChampSelectSession,
    completed_bans: usize,
    completed_picks: usize,
) -> usize {
    let ban_steps: Vec<usize> = template
        .steps
        .iter()
        .enumerate()
        .filter_map(|(index, step)| (step.kind == Phase::Ban).then_some(index))
        .collect();
    let pick_steps: Vec<usize> = template
        .steps
        .iter()
        .enumerate()
        .filter_map(|(index, step)| (step.kind == Phase::Pick).then_some(index))
        .collect();

    if let Some(action) = active_action {
        match action.action_type.as_str() {
            "ban" => {
                if session.has_simultaneous_bans == Some(true) {
                    return ban_steps.first().copied().unwrap_or(0);
                }
                let index = completed_bans.min(ban_steps.len().saturating_sub(1));
                return ban_steps.get(index).copied().unwrap_or(0);
            }
            "pick" => {
                let index = completed_picks.min(pick_steps.len().saturating_sub(1));
                return pick_steps.get(index).copied().unwrap_or(0);
            }
            _ => {}
        }
    }

    if completed_picks >= 10 {
        return template.steps.len();
    }

    if completed_bans < 10 {
        return ban_steps.first().copied().unwrap_or(0);
    }

    let index = completed_picks.min(pick_steps.len().saturating_sub(1));
    pick_steps.get(index).copied().unwrap_or(0)
}

fn local_player_name(session: &ChampSelectSession, lobby: Option<&Lobby>) -> Option<String> {
    let local = session
        .my_team
        .iter()
        .find(|player| player.cell_id == session.local_player_cell_id)?;
    let summoner_id = local.summoner_id?;
    lobby?
        .members
        .iter()
        .find(|member| member.summoner_id == Some(summoner_id))
        .and_then(|member| member.summoner_name.clone())
}

fn champion_id_for_key(data: &GameData, key: i64) -> Option<String> {
    if key <= 0 {
        return None;
    }
    let key = key.to_string();
    data.champions
        .iter()
        .find(|champion| champion.key == key)
        .map(|champion| champion.id.clone())
}

fn role_rank(role: Role) -> u8 {
    match role {
        Role::Top => 0,
        Role::Jungle => 1,
        Role::Mid => 2,
        Role::Adc => 3,
        Role::Support => 4,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        TrackingConfig, build_snapshot, detect_template, role_from_position, validate_roster,
    };
    use crate::lcu::model::{
        ChampSelectAction, ChampSelectBans, ChampSelectPlayer, ChampSelectSession,
        ChampSelectTimer, Lobby, LobbyGameConfig, LobbyMember,
    };
    use draft_engine::data::{GameData, example_state};
    use draft_engine::model::{Phase, Role, Side};

    fn data() -> GameData {
        GameData::embedded().expect("datos embebidos")
    }

    fn key(data: &GameData, id: &str) -> i64 {
        data.champion(id)
            .expect("campeón")
            .key
            .parse()
            .expect("key numérica")
    }

    fn config() -> TrackingConfig {
        let state = example_state().expect("ejemplo");
        TrackingConfig {
            roster: state.roster,
            priorities: vec![],
            side: Side::Blue,
        }
    }

    fn player(cell: i64, team: i64, position: &str, champion_id: i64) -> ChampSelectPlayer {
        ChampSelectPlayer {
            assigned_position: position.into(),
            cell_id: cell,
            champion_id,
            team: Some(team),
            summoner_id: Some(cell + 100),
        }
    }

    #[test]
    fn maps_positions_to_roles() {
        assert_eq!(role_from_position("top"), Some(Role::Top));
        assert_eq!(role_from_position("jungle"), Some(Role::Jungle));
        assert_eq!(role_from_position("middle"), Some(Role::Mid));
        assert_eq!(role_from_position("bottom"), Some(Role::Adc));
        assert_eq!(role_from_position("utility"), Some(Role::Support));
        assert_eq!(role_from_position(""), None);
    }

    #[test]
    fn detects_ranked_and_tournament_templates() {
        assert_eq!(detect_template(Some(420), None), "ranked");
        assert_eq!(detect_template(Some(440), None), "ranked");
        assert_eq!(detect_template(Some(400), None), "ranked");
        assert_eq!(detect_template(Some(700), None), "tournament");
        assert_eq!(detect_template(Some(0), Some(false)), "tournament");
        assert_eq!(detect_template(Some(0), Some(true)), "ranked");
    }

    #[test]
    fn rejects_incomplete_rosters() {
        let mut config = config();
        config.roster.players.pop();

        assert!(validate_roster(&config.roster).is_err());
    }

    #[test]
    fn maps_a_ranked_champ_select_from_the_blue_side() {
        let data = data();
        let config = config();
        let session = ChampSelectSession {
            local_player_cell_id: 3,
            has_simultaneous_bans: Some(true),
            bans: ChampSelectBans {
                my_team_bans: vec![key(&data, "Yuumi"), 0],
                their_team_bans: vec![key(&data, "Malphite")],
            },
            my_team: vec![
                player(0, 1, "top", key(&data, "Ornn")),
                player(1, 1, "jungle", key(&data, "Sejuani")),
                player(2, 1, "middle", key(&data, "Orianna")),
                player(3, 1, "bottom", key(&data, "Jinx")),
                player(4, 1, "utility", 0),
            ],
            their_team: vec![player(5, 2, "top", key(&data, "Rumble"))],
            actions: vec![vec![ChampSelectAction {
                actor_cell_id: 3,
                action_type: "pick".into(),
                id: 17,
                is_in_progress: true,
                pick_turn: 7,
                ..ChampSelectAction::default()
            }]],
            timer: Some(ChampSelectTimer {
                adjusted_time_left_in_phase: 25_000,
            }),
        };
        let lobby = Lobby {
            game_config: Some(LobbyGameConfig {
                queue_id: Some(420),
            }),
            members: vec![LobbyMember {
                summoner_id: Some(103),
                summoner_name: Some("Pablo".into()),
            }],
        };

        let snapshot = build_snapshot(
            "ChampSelect",
            None,
            Some(&lobby),
            Some(&session),
            &config,
            &data,
            true,
        );
        let draft = snapshot.draft.expect("draft mapeado");

        assert_eq!(draft.side, Side::Blue);
        assert_eq!(draft.template_id, "ranked");
        assert_eq!(draft.our_picks.len(), 4);
        assert_eq!(draft.our_picks[3].player_id, "adc");
        assert_eq!(draft.our_bans, vec!["Yuumi"]);
        assert_eq!(draft.enemy_bans, vec!["Malphite"]);
        assert_eq!(
            draft.lcu_turn.as_ref().map(|turn| turn.phase),
            Some(Phase::Pick)
        );
        assert_eq!(
            snapshot.status.current_action.expect("acción").action_id,
            17
        );
        assert_eq!(snapshot.status.local_player.as_deref(), Some("Pablo"));
    }

    #[test]
    fn merges_completed_ban_actions_when_bans_arrays_are_empty() {
        let data = data();
        let config = config();
        let session = ChampSelectSession {
            local_player_cell_id: 0,
            has_simultaneous_bans: Some(true),
            my_team: vec![player(0, 1, "top", 0)],
            actions: vec![vec![ChampSelectAction {
                actor_cell_id: 0,
                champion_id: key(&data, "Yuumi"),
                completed: true,
                id: 1,
                action_type: "ban".into(),
                ..ChampSelectAction::default()
            }]],
            ..ChampSelectSession::default()
        };

        let snapshot = build_snapshot(
            "ChampSelect",
            None,
            None,
            Some(&session),
            &config,
            &data,
            true,
        );
        let draft = snapshot.draft.expect("draft mapeado");

        assert_eq!(draft.our_bans, vec!["Yuumi"]);
    }

    #[test]
    fn missing_champ_select_session_is_not_reported_as_a_connection_error() {
        let data = data();
        let config = config();

        let snapshot = build_snapshot("ChampSelect", None, None, None, &config, &data, true);

        assert!(snapshot.status.connected);
        assert!(snapshot.status.last_error.is_none());
        assert!(snapshot.draft.is_none());
    }

    #[test]
    fn preloads_the_template_when_the_client_is_in_a_lobby() {
        let data = data();
        let config = config();
        let lobby = Lobby {
            game_config: Some(LobbyGameConfig {
                queue_id: Some(420),
            }),
            members: vec![],
        };

        let snapshot = build_snapshot("Lobby", None, Some(&lobby), None, &config, &data, true);
        let draft = snapshot.draft.expect("lobby preparado");

        assert_eq!(draft.template_id, "ranked");
        assert!(draft.our_picks.is_empty());
        assert!(draft.our_bans.is_empty());
        assert_eq!(
            snapshot.status.queue_name.as_deref(),
            Some("Ranked Solo/Duo")
        );
    }

    #[test]
    fn maps_a_custom_tournament_draft_from_the_red_side() {
        let data = data();
        let config = config();
        let session = ChampSelectSession {
            local_player_cell_id: 7,
            has_simultaneous_bans: Some(false),
            my_team: (0..5)
                .map(|index| {
                    let positions = ["top", "jungle", "middle", "bottom", "utility"];
                    player(5 + index, 2, positions[index as usize], 0)
                })
                .collect(),
            ..ChampSelectSession::default()
        };

        let snapshot = build_snapshot(
            "ChampSelect",
            None,
            None,
            Some(&session),
            &config,
            &data,
            true,
        );
        let draft = snapshot.draft.expect("draft mapeado");

        assert_eq!(draft.side, Side::Red);
        assert_eq!(draft.template_id, "tournament");
        assert!(draft.lcu_turn.is_none());
    }
}
