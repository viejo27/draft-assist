//! Builds a history record from the last live game snapshot.

use std::collections::HashSet;

use draft_engine::AppState;
use draft_engine::history::{
    BanStarter, Confidence, HistoryPick, MatchPlayerStat, MatchQueue, MatchRecord, MatchResult,
    MatchSource, MatchTeam, MatchTeamStats,
};
use draft_engine::model::{Role, Side};

use super::model::{LivePlayerView, LiveSnapshot};

pub fn build_match_record(
    snapshot: &LiveSnapshot,
    queue: MatchQueue,
    app_state: &AppState,
    first_ban_from_template: Option<BanStarter>,
) -> Result<MatchRecord, String> {
    if !snapshot.ended || snapshot.result.is_none() {
        return Err("La partida todavía no terminó.".to_string());
    }
    let our_team = snapshot
        .our_team
        .as_deref()
        .ok_or_else(|| "No se pudo identificar nuestro equipo en la partida.".to_string())?;
    let side = match our_team {
        "ORDER" => Side::Blue,
        "CHAOS" => Side::Red,
        _ => return Err("El equipo de la partida no es válido.".to_string()),
    };
    let result = match snapshot.result.as_deref() {
        Some("Win") => MatchResult::Win,
        Some("Lose") | Some("Loss") => MatchResult::Loss,
        _ => MatchResult::Unknown,
    };

    let our_players: Vec<&LivePlayerView> = snapshot
        .players
        .iter()
        .filter(|player| player.team == our_team)
        .collect();
    let enemy_players: Vec<&LivePlayerView> = snapshot
        .players
        .iter()
        .filter(|player| player.team != our_team)
        .collect();

    let mut warnings = Vec::new();
    let our_picks = history_picks(&our_players, &mut warnings);
    let enemy_picks = history_picks(&enemy_players, &mut warnings);

    let (our_bans, enemy_bans, first_ban, draft_matched) = merge_draft_bans(
        queue,
        side,
        app_state,
        &our_picks,
        &enemy_picks,
        first_ban_from_template,
    );
    if !draft_matched {
        warnings.push(
            "Sin bans: el draft seguido por LCU no coincide con los picks de la partida.".into(),
        );
    }
    if our_picks.len() < 5 || enemy_picks.len() < 5 {
        warnings.push("La partida se guardó con picks incompletos.".into());
    }

    let complete = our_picks.len() == 5 && enemy_picks.len() == 5;
    let confidence = if draft_matched && complete {
        Confidence::High
    } else if complete {
        Confidence::Medium
    } else {
        Confidence::Low
    };

    let player_stats = player_stats(snapshot, our_team);
    let duration_seconds = Some(snapshot.duration_seconds.max(0.0).round() as u32);

    Ok(MatchRecord {
        id: MatchRecord::new_id("live"),
        source: MatchSource::Lcu,
        played_at: None,
        queue,
        result,
        result_note: None,
        side: Some(side),
        side_inferred: false,
        first_ban,
        first_ban_inferred: draft_matched && first_ban.is_some(),
        our_bans,
        enemy_bans,
        our_picks,
        enemy_picks,
        rivals: Vec::new(),
        notes: vec!["Guardada desde Juego en vivo.".into()],
        warnings,
        confidence,
        rebalanced: false,
        legacy_index: None,
        duration_seconds,
        our_stats: snapshot.our_stats.as_ref().map(to_team_stats),
        enemy_stats: snapshot.enemy_stats.as_ref().map(to_team_stats),
        player_stats,
    })
}

fn history_picks(players: &[&LivePlayerView], warnings: &mut Vec<String>) -> Vec<HistoryPick> {
    let mut picks = Vec::new();
    for player in players {
        let champion_id = match player.champion_id.clone() {
            Some(champion_id) if !champion_id.is_empty() => champion_id,
            _ if !player.champion_name.is_empty() => {
                warnings.push(format!(
                    "Campeón sin mapear: {}. Se guardó el nombre visible.",
                    player.champion_name
                ));
                player.champion_name.clone()
            }
            _ => continue,
        };
        picks.push(HistoryPick {
            champion_id,
            role: role_from_string(player.role.as_deref()),
            player_name: Some(player.player_name.clone()),
            order: (picks.len() + 1) as u8,
            turn: None,
        });
    }
    picks
}

fn merge_draft_bans(
    queue: MatchQueue,
    side: Side,
    app_state: &AppState,
    our_picks: &[HistoryPick],
    enemy_picks: &[HistoryPick],
    first_ban_from_template: Option<BanStarter>,
) -> (Vec<String>, Vec<String>, Option<BanStarter>, bool) {
    let draft = &app_state.draft;
    if draft.side != side {
        return (Vec::new(), Vec::new(), None, false);
    }
    let template_matches = match queue {
        MatchQueue::Clash => draft.template_id == "tournament",
        MatchQueue::RankedSolo | MatchQueue::RankedFlex => draft.template_id == "ranked",
        MatchQueue::Custom => true,
        _ => false,
    };
    if !template_matches {
        return (Vec::new(), Vec::new(), None, false);
    }

    let live_picks: HashSet<&str> = our_picks
        .iter()
        .chain(enemy_picks.iter())
        .map(|pick| pick.champion_id.as_str())
        .collect();
    let draft_picks: HashSet<&str> = draft
        .our_picks
        .iter()
        .map(|pick| pick.champion_id.as_str())
        .chain(
            draft
                .enemy_picks
                .iter()
                .map(|pick| pick.champion_id.as_str()),
        )
        .collect();

    if live_picks.is_empty() || live_picks != draft_picks {
        return (Vec::new(), Vec::new(), None, false);
    }

    (
        draft.our_bans.clone(),
        draft.enemy_bans.clone(),
        first_ban_from_template,
        true,
    )
}

fn player_stats(snapshot: &LiveSnapshot, our_team: &str) -> Vec<MatchPlayerStat> {
    snapshot
        .players
        .iter()
        .filter_map(|player| {
            let champion_id = player.champion_id.clone()?;
            Some(MatchPlayerStat {
                team: if player.team == our_team {
                    MatchTeam::Our
                } else {
                    MatchTeam::Enemy
                },
                champion_id,
                player_name: Some(player.player_name.clone()),
                role: role_from_string(player.role.as_deref()),
                kills: player.kills,
                deaths: player.deaths,
                assists: player.assists,
                creep_score: player.creep_score,
                level: player.level,
                ward_score: player.ward_score as f32,
            })
        })
        .collect()
}

fn to_team_stats(stats: &super::model::LiveTeamStats) -> MatchTeamStats {
    MatchTeamStats {
        kills: stats.kills,
        towers: stats.towers,
        dragons: stats.dragons,
        barons: stats.barons,
        heralds: stats.heralds,
    }
}

fn role_from_string(role: Option<&str>) -> Option<Role> {
    match role? {
        "TOP" => Some(Role::Top),
        "JUNGLE" => Some(Role::Jungle),
        "MID" => Some(Role::Mid),
        "ADC" => Some(Role::Adc),
        "SUPPORT" => Some(Role::Support),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{build_match_record, role_from_string};
    use crate::live::mapping::build_snapshot;
    use crate::live::model::LiveGamePayload;
    use draft_engine::data::{GameData, example_state};
    use draft_engine::history::MatchQueue;
    use draft_engine::model::Role;

    const PAYLOAD: &str = r#"
    {
      "activePlayer": {"riotIdGameName":"Faker","summonerName":"Faker#KR1","championName":"Azir"},
      "allPlayers": [
        {"championName":"Ornn","level":18,"position":"TOP","riotIdGameName":"T1Top","summonerName":"T1Top#KR1","team":"ORDER","scores":{"kills":1,"deaths":2,"assists":3,"creepScore":180,"wardScore":10}},
        {"championName":"Sejuani","level":18,"position":"JUNGLE","riotIdGameName":"T1Jg","summonerName":"T1Jg#KR1","team":"ORDER","scores":{"kills":2,"deaths":1,"assists":6,"creepScore":140,"wardScore":12}},
        {"championName":"Azir","level":18,"position":"MIDDLE","riotIdGameName":"Faker","summonerName":"Faker#KR1","team":"ORDER","scores":{"kills":5,"deaths":1,"assists":4,"creepScore":240,"wardScore":8}},
        {"championName":"Jinx","level":18,"position":"BOTTOM","riotIdGameName":"T1Adc","summonerName":"T1Adc#KR1","team":"ORDER","scores":{"kills":6,"deaths":2,"assists":2,"creepScore":260,"wardScore":9}},
        {"championName":"Nautilus","level":18,"position":"UTILITY","riotIdGameName":"T1Sup","summonerName":"T1Sup#KR1","team":"ORDER","scores":{"kills":0,"deaths":3,"assists":10,"creepScore":30,"wardScore":40}},
        {"championName":"Rumble","level":18,"position":"TOP","riotIdGameName":"GENtop","summonerName":"GENtop#KR1","team":"CHAOS","scores":{"kills":1,"deaths":4,"assists":2,"creepScore":170,"wardScore":9}},
        {"championName":"Vi","level":18,"position":"JUNGLE","riotIdGameName":"GENjg","summonerName":"GENjg#KR1","team":"CHAOS","scores":{"kills":2,"deaths":3,"assists":3,"creepScore":150,"wardScore":11}},
        {"championName":"Orianna","level":18,"position":"MIDDLE","riotIdGameName":"GENmid","summonerName":"GENmid#KR1","team":"CHAOS","scores":{"kills":3,"deaths":3,"assists":1,"creepScore":220,"wardScore":7}},
        {"championName":"Aphelios","level":18,"position":"BOTTOM","riotIdGameName":"GENadc","summonerName":"GENadc#KR1","team":"CHAOS","scores":{"kills":2,"deaths":4,"assists":2,"creepScore":240,"wardScore":8}},
        {"championName":"Lulu","level":18,"position":"UTILITY","riotIdGameName":"GENsup","summonerName":"GENsup#KR1","team":"CHAOS","scores":{"kills":0,"deaths":5,"assists":6,"creepScore":25,"wardScore":35}}
      ],
      "events": {"Events": [
        {"EventID":0,"EventName":"GameStart","EventTime":0.0},
        {"EventID":1,"EventName":"GameEnd","EventTime":1800.0,"Result":"Win"}
      ]},
      "gameData": {"gameMode":"CLASSIC","gameTime":1800.0,"mapName":"Map11","mapNumber":11}
    }
    "#;

    #[test]
    fn builds_a_history_record_with_stats() {
        let data = GameData::embedded().unwrap();
        let payload: LiveGamePayload = serde_json::from_str(PAYLOAD).unwrap();
        let snapshot = build_snapshot(&payload, &data, "session-1".into());
        let mut app_state = example_state().unwrap();
        app_state.draft.side = draft_engine::model::Side::Blue;
        app_state.draft.template_id = "tournament".into();
        app_state.draft.our_bans = vec!["Yuumi".into()];
        app_state.draft.enemy_bans = vec!["Malphite".into()];

        let record = build_match_record(
            &snapshot,
            MatchQueue::Clash,
            &app_state,
            Some(draft_engine::history::BanStarter::Us),
        )
        .unwrap();

        assert_eq!(record.result, draft_engine::history::MatchResult::Win);
        assert_eq!(record.side, Some(draft_engine::model::Side::Blue));
        assert_eq!(record.duration_seconds, Some(1800));
        assert_eq!(record.player_stats.len(), 10);
        assert_eq!(record.our_picks.len(), 5);
        assert_eq!(record.our_picks[2].role, Some(Role::Mid));
        assert_eq!(record.our_picks[2].champion_id, "Azir");
        assert_eq!(record.our_stats.as_ref().unwrap().kills, 14);
        assert_eq!(record.enemy_stats.as_ref().unwrap().kills, 8);
        assert!(record.confidence == draft_engine::history::Confidence::Medium);
        assert!(record.our_bans.is_empty());
        assert_eq!(record.source, draft_engine::history::MatchSource::Lcu);
    }

    #[test]
    fn reuses_draft_bans_when_the_ten_picks_match() {
        let data = GameData::embedded().unwrap();
        let payload: LiveGamePayload = serde_json::from_str(PAYLOAD).unwrap();
        let snapshot = build_snapshot(&payload, &data, "session-1".into());
        let mut app_state = example_state().unwrap();
        app_state.draft.side = draft_engine::model::Side::Blue;
        app_state.draft.our_bans = vec!["Yuumi".into()];
        app_state.draft.enemy_bans = vec!["Malphite".into()];
        app_state.draft.our_picks = snapshot
            .players
            .iter()
            .filter(|player| player.team == "ORDER")
            .map(|player| draft_engine::model::TeamPick {
                player_id: player.role.clone().unwrap_or_default().to_lowercase(),
                champion_id: player.champion_id.clone().unwrap(),
                role: role_from_string(player.role.as_deref()).unwrap(),
            })
            .collect();
        app_state.draft.enemy_picks = snapshot
            .players
            .iter()
            .filter(|player| player.team == "CHAOS")
            .map(|player| draft_engine::model::EnemyPick {
                champion_id: player.champion_id.clone().unwrap(),
                role: role_from_string(player.role.as_deref()),
            })
            .collect();

        let record = build_match_record(
            &snapshot,
            MatchQueue::Clash,
            &app_state,
            Some(draft_engine::history::BanStarter::Us),
        )
        .unwrap();

        assert_eq!(record.our_bans, vec!["Yuumi"]);
        assert_eq!(record.enemy_bans, vec!["Malphite"]);
        assert_eq!(
            record.first_ban,
            Some(draft_engine::history::BanStarter::Us)
        );
        assert_eq!(record.confidence, draft_engine::history::Confidence::High);
    }
}
