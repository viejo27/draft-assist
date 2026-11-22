//! Lobby and champ-select scouting from the local LCU.

use draft_engine::data::GameData;
use draft_engine::model::Role;
use serde::Serialize;
use std::collections::HashMap;

use super::client::{LcuClient, LcuError};
use super::mapping;
use super::model::{ChampSelectPlayer, ChampSelectSession, GameflowSession, Lobby, LobbyMember};
use super::scouting::{
    ClashRankView, ClashScoutingView, RecentChampionView, Summoner, build_scouting, champion_index,
    champion_roles, fetch_position_masteries, fetch_ranks, fetch_recent_position_champions,
    fetch_scouting, fetch_summoner_by_puuid, fetch_summoners,
};

#[derive(Debug, Clone, Serialize, Default)]
pub struct LobbyScoutingView {
    pub available: bool,
    pub phase: Option<String>,
    pub queue_id: Option<i64>,
    pub queue_name: Option<String>,
    pub local_player: Option<String>,
    pub members: Vec<LobbyMemberScoutingView>,
    pub message: Option<String>,
    pub last_sync_ms: u64,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct LobbyMemberScoutingView {
    pub summoner_id: Option<i64>,
    pub puuid: Option<String>,
    pub display_name: String,
    pub tag_line: Option<String>,
    pub level: Option<i32>,
    pub profile_icon_id: Option<i32>,
    pub is_bot: bool,
    pub is_local: bool,
    pub is_leader: bool,
    pub ready: bool,
    pub team_id: Option<i64>,
    pub primary_position: Option<Role>,
    pub secondary_position: Option<Role>,
    pub position_inferred: bool,
    pub ranks: Vec<ClashRankView>,
    pub scouting: Option<ClashScoutingView>,
    pub recent_champions: Vec<RecentChampionView>,
    pub message: Option<String>,
}

pub async fn fetch(client: &LcuClient, data: &GameData) -> Result<LobbyScoutingView, LcuError> {
    let phase = client.get_phase().await?;
    let gameflow = client
        .get_optional_json::<GameflowSession>("/lol-gameflow/v1/session")
        .await
        .ok()
        .flatten();
    let queue_id = gameflow
        .as_ref()
        .and_then(|session| session.game_data.as_ref())
        .and_then(|game| game.queue.as_ref())
        .and_then(|queue| queue.id);

    let mut view = LobbyScoutingView {
        available: false,
        phase: Some(phase.clone()),
        queue_id,
        queue_name: queue_id.and_then(|id| mapping::queue_name(Some(id))),
        local_player: None,
        members: Vec::new(),
        message: None,
        last_sync_ms: now_ms(),
        signature: String::new(),
    };

    if phase == "CheckedIntoTournament" {
        return fetch_clash_scouting(client, data, queue_id).await;
    }

    if phase == "ChampSelect" {
        let session = client
            .get_optional_json::<ChampSelectSession>("/lol-champ-select/v1/session")
            .await
            .ok()
            .flatten();
        let Some(session) = session else {
            view.message = Some("No se pudo leer el champ select.".into());
            return Ok(view);
        };
        view.signature =
            mapping::lobby_signature(&phase, queue_id, None, Some(&session)).unwrap_or_default();
        view.members =
            champ_select_members(client, data, &session, false, infers_positions(queue_id)).await;
        view.local_player = view
            .members
            .iter()
            .find(|member| member.is_local)
            .map(|member| member.display_name.clone());
        view.available = !view.members.is_empty();
        view.message = Some(
            "Datos locales del LCU. Maestrías e historial son best-effort y pueden faltar si el cliente no los tiene cacheados."
                .into(),
        );
        return Ok(view);
    }

    if phase == "Lobby" {
        let lobby = client
            .get_optional_json::<Lobby>("/lol-lobby/v2/lobby")
            .await
            .ok()
            .flatten();
        let Some(lobby) = lobby else {
            view.message = Some("No se pudo leer el lobby.".into());
            return Ok(view);
        };
        view.signature =
            mapping::lobby_signature(&phase, queue_id, Some(&lobby), None).unwrap_or_default();
        view.members = lobby_members(client, data, &lobby).await;
        view.local_player = view
            .members
            .iter()
            .find(|member| member.is_local)
            .map(|member| member.display_name.clone());
        view.available = !view.members.is_empty();
        view.message = Some(
            "Datos locales del LCU. Maestrías e historial son best-effort y pueden faltar si el cliente no los tiene cacheados."
                .into(),
        );
        return Ok(view);
    }

    view.message = Some("Entrá a un lobby o champ select para cargar los datos del LCU.".into());
    Ok(view)
}

pub async fn fetch_rival(
    client: &LcuClient,
    data: &GameData,
) -> Result<LobbyScoutingView, LcuError> {
    let phase = client.get_phase().await?;
    let gameflow = client
        .get_optional_json::<GameflowSession>("/lol-gameflow/v1/session")
        .await
        .ok()
        .flatten();
    let queue_id = gameflow
        .as_ref()
        .and_then(|session| session.game_data.as_ref())
        .and_then(|game| game.queue.as_ref())
        .and_then(|queue| queue.id);

    let mut view = LobbyScoutingView {
        available: false,
        phase: Some(phase.clone()),
        queue_id,
        queue_name: queue_id.and_then(|id| mapping::queue_name(Some(id))),
        local_player: None,
        members: Vec::new(),
        message: None,
        last_sync_ms: now_ms(),
        signature: String::new(),
    };

    if phase != "ChampSelect" {
        view.message = Some("Rival Live solo está disponible durante el champ select.".into());
        return Ok(view);
    }

    let session = client
        .get_optional_json::<ChampSelectSession>("/lol-champ-select/v1/session")
        .await
        .ok()
        .flatten();
    let Some(session) = session else {
        view.message = Some("No se pudo leer el champ select.".into());
        return Ok(view);
    };

    view.signature =
        mapping::lobby_signature(&phase, queue_id, None, Some(&session)).unwrap_or_default();
    view.members =
        champ_select_members(client, data, &session, true, infers_positions(queue_id)).await;
    view.available = !view.members.is_empty();
    view.message = Some(if view.available {
        "Datos locales del LCU. En Ranked 5s la posición del rival se estima por el campeón elegido si el cliente no la expone; en Clash se usa la posición marcada. El resto es best-effort."
            .into()
    } else {
        "El cliente no expone al equipo rival en este modo.".into()
    });
    Ok(view)
}

async fn fetch_clash_scouting(
    client: &LcuClient,
    data: &GameData,
    queue_id: Option<i64>,
) -> Result<LobbyScoutingView, LcuError> {
    let mut view = LobbyScoutingView {
        available: false,
        phase: Some("Scouting de Clash".into()),
        queue_id,
        queue_name: Some("Clash".into()),
        local_player: None,
        members: Vec::new(),
        message: None,
        last_sync_ms: now_ms(),
        signature: String::new(),
    };

    let Some(roster) = super::clash::fetch_roster(client).await else {
        view.message = Some("El cliente todavía no expone tu roster de Clash.".into());
        return Ok(view);
    };

    let current_summoner_id = client
        .get_optional_json::<Summoner>("/lol-summoner/v1/current-summoner")
        .await
        .ok()
        .flatten()
        .and_then(|summoner| summoner.summoner_id);
    let mut members = clash_roster_members(&roster, current_summoner_id);
    hydrate_members(client, data, &mut members).await;

    view.local_player = members
        .iter()
        .find(|member| member.is_local)
        .map(|member| member.display_name.clone());
    view.available = !members.is_empty();
    view.signature = format!(
        "clash-scouting:{}:{}",
        roster.id,
        members
            .iter()
            .filter_map(|member| member.summoner_id)
            .map(|id| id.to_string())
            .collect::<Vec<_>>()
            .join(",")
    );
    view.members = members;
    view.message = Some(
        "Roster de Clash. Maestrías e historial son best-effort y pueden faltar si el cliente no los tiene cacheados."
            .into(),
    );
    Ok(view)
}

fn clash_roster_members(
    roster: &super::clash::ClashRosterView,
    current_summoner_id: Option<i64>,
) -> Vec<LobbyMemberScoutingView> {
    roster
        .members
        .iter()
        .map(|member| {
            let primary_position = role_from_position(member.position.as_deref());
            LobbyMemberScoutingView {
                summoner_id: member.summoner_id,
                puuid: member.puuid.clone(),
                display_name: member.display_name.clone(),
                tag_line: member.tag_line.clone(),
                level: member.level,
                profile_icon_id: member.profile_icon_id,
                is_bot: false,
                is_local: member.summoner_id.is_some() && member.summoner_id == current_summoner_id,
                is_leader: member.is_captain,
                ready: member.state.as_deref() == Some("READY"),
                team_id: None,
                primary_position,
                secondary_position: None,
                position_inferred: false,
                ranks: Vec::new(),
                scouting: None,
                recent_champions: Vec::new(),
                message: if member.is_pending {
                    Some("Invitación pendiente.".into())
                } else {
                    None
                },
            }
        })
        .collect()
}

async fn lobby_members(
    client: &LcuClient,
    data: &GameData,
    lobby: &Lobby,
) -> Vec<LobbyMemberScoutingView> {
    let local_summoner_id = lobby
        .local_member
        .as_ref()
        .and_then(|member| member.summoner_id);
    let local_puuid = lobby
        .local_member
        .as_ref()
        .and_then(|member| member.puuid.as_deref());
    let local_team = lobby
        .local_member
        .as_ref()
        .and_then(|member| member.team_id);
    let members: Vec<&LobbyMember> = if let Some(team) = local_team {
        let same_team: Vec<&LobbyMember> = lobby
            .members
            .iter()
            .filter(|member| member.team_id == Some(team))
            .collect();
        if same_team.is_empty() {
            lobby.members.iter().collect()
        } else {
            same_team
        }
    } else {
        lobby.members.iter().collect()
    };
    let summoner_ids: Vec<i64> = members
        .iter()
        .filter_map(|member| member.summoner_id)
        .collect();
    let summoners = fetch_summoners(client, &summoner_ids).await;

    let mut views = Vec::with_capacity(members.len());
    for (index, member) in members.iter().enumerate() {
        let summoner = member.summoner_id.and_then(|id| summoners.get(&id));
        let display_name = summoner
            .and_then(|summoner| summoner.game_name.clone())
            .filter(|name| !name.is_empty())
            .or_else(|| {
                summoner
                    .and_then(|summoner| summoner.display_name.clone())
                    .filter(|name| !name.is_empty())
            })
            .or_else(|| member.summoner_name.clone())
            .unwrap_or_else(|| format!("Jugador {}", index + 1));
        let puuid = summoner
            .and_then(|summoner| summoner.puuid.clone())
            .or_else(|| member.puuid.clone());
        let first = role_from_position(member.first_position_preference.as_deref());
        let second = role_from_position(member.second_position_preference.as_deref());
        let (primary_position, secondary_position) = match (first, second) {
            (Some(first), Some(second)) if first == second => (Some(first), None),
            (Some(first), second) => (Some(first), second),
            (None, second) => (second, None),
        };
        let is_local = (member.summoner_id.is_some() && member.summoner_id == local_summoner_id)
            || (puuid.is_some() && puuid.as_deref() == local_puuid);
        let mut view = LobbyMemberScoutingView {
            summoner_id: member.summoner_id,
            puuid: puuid.clone(),
            display_name: display_name.clone(),
            tag_line: summoner.and_then(|summoner| summoner.tag_line.clone()),
            level: summoner
                .and_then(|summoner| summoner.summoner_level)
                .or(member.summoner_level),
            profile_icon_id: summoner
                .and_then(|summoner| summoner.profile_icon_id)
                .or(member.summoner_icon_id),
            is_bot: member.is_bot,
            is_local,
            is_leader: member.is_leader,
            ready: member.ready,
            team_id: member.team_id,
            primary_position,
            secondary_position,
            position_inferred: false,
            ranks: Vec::new(),
            scouting: None,
            recent_champions: Vec::new(),
            message: None,
        };
        if member.is_bot {
            view.message = Some("Bot: sin maestrías ni historial.".into());
        }
        views.push(view);
    }

    hydrate_members(client, data, &mut views).await;
    views
}

async fn champ_select_members(
    client: &LcuClient,
    data: &GameData,
    session: &ChampSelectSession,
    enemy: bool,
    infer_positions: bool,
) -> Vec<LobbyMemberScoutingView> {
    let players: Vec<&ChampSelectPlayer> = if enemy {
        session.their_team.iter().collect()
    } else {
        session.my_team.iter().collect()
    };
    let summoner_ids: Vec<i64> = players
        .iter()
        .filter_map(|player| player.summoner_id.filter(|id| *id > 0))
        .collect();
    let summoners = fetch_summoners(client, &summoner_ids).await;
    let roles = champion_roles(data);

    let mut views = Vec::with_capacity(players.len());
    for (index, member) in players.iter().enumerate() {
        let summoner_id = member.summoner_id.filter(|id| *id > 0);
        let summoner = summoner_id.and_then(|id| summoners.get(&id));
        let puuid = summoner
            .and_then(|summoner| summoner.puuid.clone())
            .or_else(|| member.puuid.clone());
        let fallback_summoner = if summoner.is_none() {
            match puuid.as_deref() {
                Some(puuid) => fetch_summoner_by_puuid(client, puuid).await,
                None => None,
            }
        } else {
            None
        };
        let identity = summoner.or(fallback_summoner.as_ref());
        let puuid = identity
            .and_then(|summoner| summoner.puuid.clone())
            .or(puuid);
        let assigned_position = role_from_position(Some(member.assigned_position.as_str()));
        let inferred_position = if infer_positions && assigned_position.is_none() {
            inferred_role(&roles, member.champion_id)
        } else {
            None
        };
        let position_inferred = inferred_position.is_some();
        let role = assigned_position.or(inferred_position);
        let fallback_name = if enemy {
            role.map(|role| format!("Rival {}", role.label_es()))
                .unwrap_or_else(|| format!("Rival {}", index + 1))
        } else {
            format!("Jugador {}", index + 1)
        };
        let display_name = identity
            .and_then(|summoner| summoner.game_name.clone())
            .filter(|name| !name.is_empty())
            .or_else(|| {
                identity
                    .and_then(|summoner| summoner.display_name.clone())
                    .filter(|name| !name.is_empty())
            })
            .or_else(|| member.game_name.clone().filter(|name| !name.is_empty()))
            .unwrap_or(fallback_name);
        let tag_line = identity
            .and_then(|summoner| summoner.tag_line.clone())
            .filter(|tag| !tag.is_empty())
            .or_else(|| member.tag_line.clone().filter(|tag| !tag.is_empty()));
        let hidden_identity = puuid.is_none() && summoner_id.is_none();
        let is_bot = !enemy && hidden_identity;
        let message = if is_bot {
            Some("Bot: sin maestrías ni historial.".into())
        } else if hidden_identity {
            Some(
                "El cliente no expone la identidad de este rival. Sin maestrías ni historial."
                    .into(),
            )
        } else {
            None
        };
        views.push(LobbyMemberScoutingView {
            summoner_id,
            puuid,
            display_name,
            tag_line,
            level: identity.and_then(|summoner| summoner.summoner_level),
            profile_icon_id: identity.and_then(|summoner| summoner.profile_icon_id),
            is_bot,
            is_local: !enemy && member.cell_id == session.local_player_cell_id,
            is_leader: false,
            ready: true,
            team_id: member.team,
            primary_position: role,
            secondary_position: None,
            position_inferred,
            ranks: Vec::new(),
            scouting: None,
            recent_champions: Vec::new(),
            message,
        });
    }

    hydrate_members(client, data, &mut views).await;
    views
}

async fn hydrate_members(
    client: &LcuClient,
    data: &GameData,
    members: &mut [LobbyMemberScoutingView],
) {
    let champions = champion_index(data);
    let roles = champion_roles(data);
    let puuids: Vec<String> = members
        .iter()
        .filter(|member| !member.is_bot)
        .filter_map(|member| member.puuid.clone())
        .collect();
    let scouting = fetch_scouting(client, &puuids).await;

    for member in members.iter_mut() {
        if member.is_bot {
            continue;
        }
        let Some(puuid) = member.puuid.as_deref() else {
            if member.message.is_none() {
                member.message = Some("El cliente no expuso el PUUID de este jugador.".into());
            }
            continue;
        };

        let raw_scouting = scouting
            .iter()
            .find(|entry| member.summoner_id.is_some() && entry.player_id == member.summoner_id)
            .or_else(|| {
                let puuid_index = puuids.iter().position(|candidate| candidate == puuid)?;
                scouting.get(puuid_index)
            });
        let batch_view = raw_scouting.map(|entry| build_scouting(entry, &champions));
        let masteries = fetch_position_masteries(
            client,
            &champions,
            &roles,
            puuid,
            member.primary_position,
            5,
        )
        .await;
        let (total_mastery_score, season_champions) = batch_view
            .map(|view| (view.total_mastery_score, view.season_champions))
            .unwrap_or((None, Vec::new()));

        member.ranks = fetch_ranks(client, puuid).await;
        member.scouting = Some(ClashScoutingView {
            total_mastery_score,
            masteries,
            season_champions,
        });
        member.recent_champions = fetch_recent_position_champions(
            client,
            &champions,
            puuid,
            member.summoner_id,
            member.primary_position,
            5,
        )
        .await;
    }
}

fn infers_positions(queue_id: Option<i64>) -> bool {
    matches!(queue_id, Some(42 | 710))
}

fn inferred_role(roles: &HashMap<i32, Vec<Role>>, champion_id: i64) -> Option<Role> {
    if champion_id <= 0 {
        return None;
    }
    let key = i32::try_from(champion_id).ok()?;
    roles.get(&key).and_then(|roles| roles.first().copied())
}

fn role_from_position(position: Option<&str>) -> Option<Role> {
    let position = position?.trim().to_ascii_uppercase();
    match position.as_str() {
        "TOP" => Some(Role::Top),
        "JUNGLE" => Some(Role::Jungle),
        "MIDDLE" | "MID" => Some(Role::Mid),
        "BOTTOM" | "ADC" => Some(Role::Adc),
        "UTILITY" | "SUPPORT" => Some(Role::Support),
        _ => None,
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{inferred_role, infers_positions, role_from_position};
    use draft_engine::data::GameData;
    use draft_engine::model::Role;

    #[test]
    fn only_infers_positions_for_ranked_fives() {
        assert!(infers_positions(Some(42)));
        assert!(infers_positions(Some(710)));
        assert!(!infers_positions(Some(700)));
        assert!(!infers_positions(Some(420)));
        assert!(!infers_positions(Some(440)));
        assert!(!infers_positions(None));
    }

    #[test]
    fn infers_the_primary_role_from_the_picked_champion() {
        let data = GameData::embedded().expect("datos embebidos");
        let roles = super::champion_roles(&data);
        let key = |id: &str| {
            data.champion(id)
                .expect(id)
                .key
                .parse::<i64>()
                .expect("key numérica")
        };

        assert_eq!(inferred_role(&roles, key("Brand")), Some(Role::Mid));
        assert_eq!(inferred_role(&roles, key("MissFortune")), Some(Role::Adc));
        assert_eq!(inferred_role(&roles, key("Zac")), Some(Role::Jungle));
        assert_eq!(inferred_role(&roles, 0), None);
    }

    #[test]
    fn maps_lobby_positions_to_roles() {
        assert_eq!(role_from_position(Some("TOP")), Some(Role::Top));
        assert_eq!(role_from_position(Some("JUNGLE")), Some(Role::Jungle));
        assert_eq!(role_from_position(Some("MIDDLE")), Some(Role::Mid));
        assert_eq!(role_from_position(Some("BOTTOM")), Some(Role::Adc));
        assert_eq!(role_from_position(Some("UTILITY")), Some(Role::Support));
        assert_eq!(role_from_position(Some("FILL")), None);
        assert_eq!(role_from_position(Some("UNSELECTED")), None);
    }
}
