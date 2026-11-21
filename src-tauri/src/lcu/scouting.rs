//! Shared LCU scouting helpers: summoners, masteries, ranks and match history.

use std::collections::HashMap;

use draft_engine::data::GameData;
use draft_engine::model::Role;
use serde::{Deserialize, Serialize};

use super::client::LcuClient;
use super::mapping;

pub(crate) const SCOUTING_QUEUES: &[i32] = &[420, 440, 42, 710, 700];

#[derive(Debug, Clone, Serialize)]
pub struct ClashRankView {
    pub queue_type: String,
    pub queue_label: String,
    pub tier: String,
    pub division: Option<String>,
    pub league_points: Option<i32>,
    pub wins: i32,
    pub losses: i32,
    pub winrate: Option<f64>,
    pub provisional: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClashScoutingView {
    pub total_mastery_score: Option<i64>,
    pub masteries: Vec<ClashMasteryView>,
    pub season_champions: Vec<ClashSeasonChampionView>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClashMasteryView {
    pub champion_id: String,
    pub champion_name: String,
    pub level: i32,
    pub points: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClashSeasonChampionView {
    pub champion_id: String,
    pub champion_name: String,
    pub games: i32,
    pub wins: i32,
    pub winrate: Option<f64>,
    pub kda: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClashRecentMatchView {
    pub game_id: Option<i64>,
    pub champion_id: String,
    pub champion_name: String,
    pub win: Option<bool>,
    pub kills: i64,
    pub deaths: i64,
    pub assists: i64,
    pub queue_id: Option<i32>,
    pub queue_name: String,
    pub role: Option<String>,
    pub role_exact: Option<Role>,
    pub played_at_ms: Option<i64>,
    pub duration_secs: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecentChampionView {
    pub champion_id: String,
    pub champion_name: String,
    pub role: Option<Role>,
    pub games: u32,
    pub wins: u32,
    pub last_played_ms: Option<i64>,
    pub last_kda: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Summoner {
    #[serde(default)]
    pub(crate) display_name: Option<String>,
    #[serde(default)]
    pub(crate) game_name: Option<String>,
    #[serde(default)]
    pub(crate) profile_icon_id: Option<i32>,
    #[serde(default)]
    pub(crate) puuid: Option<String>,
    #[serde(default)]
    pub(crate) summoner_id: Option<i64>,
    #[serde(default)]
    pub(crate) summoner_level: Option<i32>,
    #[serde(default)]
    pub(crate) tag_line: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScoutingChampions {
    #[serde(default)]
    pub(crate) player_id: Option<i64>,
    #[serde(default)]
    top_masteries: Vec<ScoutingMastery>,
    #[serde(default)]
    top_season_champions: Vec<ScoutingSeasonChampion>,
    #[serde(default)]
    total_mastery_score: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ScoutingMastery {
    #[serde(default)]
    champion_id: i32,
    #[serde(default)]
    champion_level: i32,
    #[serde(default)]
    champion_points: i32,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ScoutingSeasonChampion {
    #[serde(default)]
    champion_id: i32,
    #[serde(default)]
    game_count: i32,
    #[serde(default)]
    kda: Option<String>,
    #[serde(default)]
    win_count: i32,
    #[serde(default)]
    win_rate: i32,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ChampionMastery {
    #[serde(default)]
    champion_id: i32,
    #[serde(default)]
    champion_level: i32,
    #[serde(default)]
    champion_points: i32,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RankedStats {
    #[serde(default)]
    pub(crate) queues: Vec<RankedQueueStats>,
    #[serde(default)]
    pub(crate) queue_map: HashMap<String, RankedQueueStats>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RankedQueueStats {
    #[serde(default)]
    pub(crate) queue_type: Option<String>,
    #[serde(default)]
    pub(crate) tier: Option<String>,
    #[serde(default)]
    pub(crate) division: Option<String>,
    #[serde(default)]
    pub(crate) league_points: Option<i32>,
    #[serde(default)]
    pub(crate) wins: Option<i32>,
    #[serde(default)]
    pub(crate) losses: Option<i32>,
    #[serde(default)]
    pub(crate) is_provisional: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MatchHistoryPage {
    #[serde(default)]
    pub(crate) games: Option<MatchHistoryGames>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MatchHistoryGames {
    #[serde(default)]
    pub(crate) games: Vec<MatchHistoryGame>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MatchHistoryGame {
    #[serde(default)]
    game_creation: Option<i64>,
    #[serde(default)]
    game_duration: Option<i32>,
    #[serde(default)]
    game_id: Option<i64>,
    #[serde(default)]
    participant_identities: Vec<ParticipantIdentity>,
    #[serde(default)]
    participants: Vec<Participant>,
    #[serde(default)]
    queue_id: Option<i32>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ParticipantIdentity {
    #[serde(default)]
    participant_id: i32,
    #[serde(default)]
    player: Option<ParticipantPlayer>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ParticipantPlayer {
    #[serde(default)]
    puuid: Option<String>,
    #[serde(default)]
    summoner_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Participant {
    #[serde(default)]
    champion_id: i32,
    #[serde(default)]
    participant_id: i32,
    #[serde(default)]
    stats: Option<ParticipantStats>,
    #[serde(default)]
    timeline: Option<ParticipantTimeline>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ParticipantStats {
    #[serde(default)]
    assists: Option<i64>,
    #[serde(default)]
    deaths: Option<i64>,
    #[serde(default)]
    kills: Option<i64>,
    #[serde(default)]
    win: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ParticipantTimeline {
    #[serde(default)]
    lane: Option<String>,
    #[serde(default)]
    role: Option<String>,
}

pub(crate) async fn fetch_summoners(
    client: &LcuClient,
    summoner_ids: &[i64],
) -> HashMap<i64, Summoner> {
    if summoner_ids.is_empty() {
        return HashMap::new();
    }

    let query = json_id_array(summoner_ids);
    let mut mapped: HashMap<i64, Summoner> = client
        .get_optional_json_query::<Vec<Summoner>>("/lol-summoner/v2/summoners", &[("ids", query)])
        .await
        .ok()
        .flatten()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|summoner| summoner.summoner_id.map(|id| (id, summoner)))
        .collect();

    for summoner_id in summoner_ids {
        if mapped.contains_key(summoner_id) {
            continue;
        }
        if let Ok(Some(summoner)) = client
            .get_optional_json::<Summoner>(&format!("/lol-summoner/v1/summoners/{summoner_id}"))
            .await
        {
            mapped.insert(*summoner_id, summoner);
        }
    }
    mapped
}

pub(crate) async fn fetch_summoner_by_puuid(client: &LcuClient, puuid: &str) -> Option<Summoner> {
    if let Ok(Some(summoner)) = client
        .get_optional_json::<Summoner>(&format!(
            "/lol-summoner/v1/summoners-by-puuid-cached/{puuid}"
        ))
        .await
    {
        return Some(summoner);
    }
    client
        .get_optional_json::<Summoner>(&format!("/lol-summoner/v2/summoners/puuid/{puuid}"))
        .await
        .ok()
        .flatten()
}

pub(crate) async fn fetch_scouting(
    client: &LcuClient,
    puuids: &[String],
) -> Vec<ScoutingChampions> {
    if puuids.is_empty() {
        return Vec::new();
    }
    client
        .get_optional_json_query::<Vec<ScoutingChampions>>(
            "/lol-clash/v1/scouting/champions",
            &[("puuids", json_puuid_array(puuids))],
        )
        .await
        .ok()
        .flatten()
        .unwrap_or_default()
}

async fn fetch_all_masteries(client: &LcuClient, puuid: &str) -> Vec<ChampionMastery> {
    let mut masteries = client
        .get_optional_json::<Vec<ChampionMastery>>(&format!(
            "/lol-champion-mastery/v1/{puuid}/champion-mastery"
        ))
        .await
        .ok()
        .flatten()
        .unwrap_or_default();
    masteries.sort_by_key(|mastery| std::cmp::Reverse(mastery.champion_points));
    masteries
}

pub(crate) async fn fetch_position_masteries(
    client: &LcuClient,
    champions: &HashMap<i32, (String, String)>,
    roles: &HashMap<i32, Vec<Role>>,
    puuid: &str,
    position: Option<Role>,
    limit: usize,
) -> Vec<ClashMasteryView> {
    fetch_all_masteries(client, puuid)
        .await
        .into_iter()
        .filter(|mastery| {
            position.is_none_or(|position| {
                roles
                    .get(&mastery.champion_id)
                    .is_some_and(|roles| roles.contains(&position))
            })
        })
        .take(limit)
        .map(|mastery| {
            let (champion_id, champion_name) = champion_name(champions, mastery.champion_id);
            ClashMasteryView {
                champion_id,
                champion_name,
                level: mastery.champion_level,
                points: mastery.champion_points,
            }
        })
        .collect()
}

pub(crate) fn json_id_array(ids: &[i64]) -> String {
    format!(
        "[{}]",
        ids.iter()
            .map(|id| id.to_string())
            .collect::<Vec<_>>()
            .join(",")
    )
}

pub(crate) fn json_puuid_array(puuids: &[String]) -> String {
    format!(
        "[{}]",
        puuids
            .iter()
            .map(|puuid| format!("\"{puuid}\""))
            .collect::<Vec<_>>()
            .join(",")
    )
}

pub(crate) async fn fetch_ranks(client: &LcuClient, puuid: &str) -> Vec<ClashRankView> {
    let cached = client
        .get_optional_json::<RankedStats>(&format!("/lol-ranked/v1/cached-ranked-stats/{puuid}"))
        .await
        .ok()
        .flatten();
    let stats = match cached {
        Some(stats) if has_ranked_entries(&stats) => Some(stats),
        _ => client
            .get_optional_json::<RankedStats>(&format!("/lol-ranked/v1/ranked-stats/{puuid}"))
            .await
            .ok()
            .flatten(),
    };
    stats.as_ref().map(build_ranks).unwrap_or_default()
}

fn has_ranked_entries(stats: &RankedStats) -> bool {
    stats
        .queues
        .iter()
        .any(|entry| is_ranked_queue(entry.queue_type.as_deref()))
        || stats
            .queue_map
            .keys()
            .any(|queue| is_ranked_queue(Some(queue.as_str())))
}

fn is_ranked_queue(queue: Option<&str>) -> bool {
    matches!(
        queue,
        Some("RANKED_SOLO_5x5" | "JADE_RANKED_SOLO_5x5" | "RANKED_FLEX_SR")
    )
}

pub(crate) fn build_ranks(stats: &RankedStats) -> Vec<ClashRankView> {
    let mut entries: Vec<RankedQueueStats> = stats.queues.clone();
    for (queue, entry) in &stats.queue_map {
        if entries
            .iter()
            .any(|existing| existing.queue_type.as_deref() == Some(queue.as_str()))
        {
            continue;
        }
        let mut entry = entry.clone();
        if entry.queue_type.is_none() {
            entry.queue_type = Some(queue.clone());
        }
        entries.push(entry);
    }
    let mut ranks: Vec<ClashRankView> = entries
        .iter()
        .filter_map(build_rank)
        .filter(|rank| {
            matches!(
                rank.queue_type.as_str(),
                "RANKED_SOLO_5x5" | "JADE_RANKED_SOLO_5x5" | "RANKED_FLEX_SR"
            )
        })
        .collect();
    ranks.sort_by_key(|rank| match rank.queue_type.as_str() {
        "RANKED_SOLO_5x5" | "JADE_RANKED_SOLO_5x5" => 0,
        "RANKED_FLEX_SR" => 1,
        _ => 2,
    });
    ranks
}

fn build_rank(entry: &RankedQueueStats) -> Option<ClashRankView> {
    let tier = entry
        .tier
        .clone()
        .filter(|tier| !tier.is_empty() && tier != "NONE")?;
    let wins = entry.wins.unwrap_or(0).max(0);
    let losses = entry.losses.unwrap_or(0).max(0);
    let total = wins + losses;
    let queue_type = entry.queue_type.clone().unwrap_or_default();
    Some(ClashRankView {
        queue_label: queue_type_label(&queue_type),
        queue_type,
        tier,
        division: entry
            .division
            .clone()
            .filter(|division| !division.is_empty() && division != "NA"),
        league_points: entry.league_points,
        wins,
        losses,
        winrate: (total > 0).then(|| wins as f64 / total as f64 * 100.0),
        provisional: entry.is_provisional.unwrap_or(false),
    })
}

fn queue_type_label(queue_type: &str) -> String {
    match queue_type {
        "RANKED_SOLO_5x5" | "JADE_RANKED_SOLO_5x5" => "Solo/Duo",
        "RANKED_FLEX_SR" => "Flex",
        "RANKED_FLEX_TT" => "Flex 3v3",
        "RANKED_TFT" => "TFT",
        other => other,
    }
    .into()
}

pub(crate) async fn fetch_match_history_page(
    client: &LcuClient,
    puuid: &str,
    end_index: usize,
) -> Option<MatchHistoryPage> {
    client
        .get_optional_json_query::<MatchHistoryPage>(
            &format!("/lol-match-history/v1/products/lol/{puuid}/matches"),
            &[
                ("begIndex", "0".to_string()),
                ("endIndex", end_index.to_string()),
            ],
        )
        .await
        .ok()
        .flatten()
}

pub(crate) async fn fetch_recent_matches(
    client: &LcuClient,
    champions: &HashMap<i32, (String, String)>,
    puuid: &str,
    summoner_id: Option<i64>,
) -> Vec<ClashRecentMatchView> {
    let Some(page) = fetch_match_history_page(client, puuid, 5).await else {
        return Vec::new();
    };
    page.games
        .map(|games| games.games)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|game| recent_match(game, champions, puuid, summoner_id))
        .collect()
}

pub(crate) fn recent_match(
    game: MatchHistoryGame,
    champions: &HashMap<i32, (String, String)>,
    puuid: &str,
    summoner_id: Option<i64>,
) -> Option<ClashRecentMatchView> {
    let identity = game.participant_identities.iter().find(|identity| {
        identity
            .player
            .as_ref()
            .and_then(|player| player.puuid.as_deref())
            == Some(puuid)
            || (summoner_id.is_some()
                && identity
                    .player
                    .as_ref()
                    .and_then(|player| player.summoner_id)
                    == summoner_id)
    })?;
    let participant = game
        .participants
        .iter()
        .find(|participant| participant.participant_id == identity.participant_id)?;
    let stats = participant.stats.as_ref()?;
    let (champion_id, champion_name) = champion_name(champions, participant.champion_id);
    let queue_id = game.queue_id;
    let role_exact = role_from_timeline(
        participant
            .timeline
            .as_ref()
            .and_then(|timeline| timeline.lane.as_deref()),
        participant
            .timeline
            .as_ref()
            .and_then(|timeline| timeline.role.as_deref()),
    );
    Some(ClashRecentMatchView {
        game_id: game.game_id,
        champion_id,
        champion_name,
        win: stats.win,
        kills: stats.kills.unwrap_or(0),
        deaths: stats.deaths.unwrap_or(0),
        assists: stats.assists.unwrap_or(0),
        queue_id,
        queue_name: queue_id
            .and_then(|id| mapping::queue_name(Some(id as i64)))
            .unwrap_or_else(|| "Partida".into()),
        role: participant
            .timeline
            .as_ref()
            .and_then(|timeline| timeline.lane.as_deref())
            .and_then(lane_label),
        role_exact,
        played_at_ms: game.game_creation,
        duration_secs: game.game_duration,
    })
}

pub(crate) async fn fetch_recent_position_champions(
    client: &LcuClient,
    champions: &HashMap<i32, (String, String)>,
    puuid: &str,
    summoner_id: Option<i64>,
    position: Option<Role>,
    limit: usize,
) -> Vec<RecentChampionView> {
    let Some(page) = fetch_match_history_page(client, puuid, 20).await else {
        return Vec::new();
    };
    let games = page.games.map(|games| games.games).unwrap_or_default();
    let mut by_champion: HashMap<String, RecentChampionView> = HashMap::new();

    for game in games {
        if !SCOUTING_QUEUES.contains(&game.queue_id.unwrap_or(-1)) {
            continue;
        }
        let Some(identity) = game.participant_identities.iter().find(|identity| {
            identity
                .player
                .as_ref()
                .and_then(|player| player.puuid.as_deref())
                == Some(puuid)
                || (summoner_id.is_some()
                    && identity
                        .player
                        .as_ref()
                        .and_then(|player| player.summoner_id)
                        == summoner_id)
        }) else {
            continue;
        };
        let Some(participant) = game
            .participants
            .iter()
            .find(|participant| participant.participant_id == identity.participant_id)
        else {
            continue;
        };
        let role = role_from_timeline(
            participant
                .timeline
                .as_ref()
                .and_then(|timeline| timeline.lane.as_deref()),
            participant
                .timeline
                .as_ref()
                .and_then(|timeline| timeline.role.as_deref()),
        );
        if position.is_some() && role != position {
            continue;
        }
        let (champion_id, champion_name) = champion_name(champions, participant.champion_id);
        let stats = participant.stats.as_ref();
        let win = stats.and_then(|stats| stats.win).unwrap_or(false);
        let kda = stats.map(|stats| {
            format!(
                "{}/{}/{}",
                stats.kills.unwrap_or(0),
                stats.deaths.unwrap_or(0),
                stats.assists.unwrap_or(0)
            )
        });
        let entry = by_champion
            .entry(champion_id.clone())
            .or_insert_with(|| RecentChampionView {
                champion_id,
                champion_name,
                role,
                games: 0,
                wins: 0,
                last_played_ms: None,
                last_kda: None,
            });
        entry.games += 1;
        if win {
            entry.wins += 1;
        }
        if game.game_creation >= entry.last_played_ms {
            entry.last_played_ms = game.game_creation;
            entry.last_kda = kda;
        }
    }

    let mut recent: Vec<RecentChampionView> = by_champion.into_values().collect();
    recent.sort_by(|left, right| {
        right
            .games
            .cmp(&left.games)
            .then_with(|| right.last_played_ms.cmp(&left.last_played_ms))
    });
    recent.truncate(limit);
    recent
}

pub(crate) fn build_scouting(
    scouting: &ScoutingChampions,
    champions: &HashMap<i32, (String, String)>,
) -> ClashScoutingView {
    let masteries = scouting
        .top_masteries
        .iter()
        .map(|mastery| {
            let (champion_id, champion_name) = champion_name(champions, mastery.champion_id);
            ClashMasteryView {
                champion_id,
                champion_name,
                level: mastery.champion_level,
                points: mastery.champion_points,
            }
        })
        .collect();
    let season_champions = scouting
        .top_season_champions
        .iter()
        .map(|champion| {
            let (champion_id, champion_name) = champion_name(champions, champion.champion_id);
            let winrate = if champion.win_rate > 0 {
                let value = champion.win_rate as f64;
                Some(if value <= 1.0 { value * 100.0 } else { value })
            } else if champion.game_count > 0 {
                Some(champion.win_count as f64 / champion.game_count as f64 * 100.0)
            } else {
                None
            };
            ClashSeasonChampionView {
                champion_id,
                champion_name,
                games: champion.game_count,
                wins: champion.win_count,
                winrate,
                kda: champion.kda.clone(),
            }
        })
        .collect();
    ClashScoutingView {
        total_mastery_score: scouting.total_mastery_score,
        masteries,
        season_champions,
    }
}

pub(crate) fn champion_roles(data: &GameData) -> HashMap<i32, Vec<Role>> {
    data.champions
        .iter()
        .filter_map(|champion| {
            let key = champion.key.parse::<i32>().ok()?;
            let roles = data.meta(&champion.id)?.roles.clone();
            Some((key, roles))
        })
        .collect()
}

pub(crate) fn champion_index(data: &GameData) -> HashMap<i32, (String, String)> {
    data.champions
        .iter()
        .filter_map(|champion| {
            champion
                .key
                .parse::<i32>()
                .ok()
                .map(|key| (key, (champion.id.clone(), champion.name.clone())))
        })
        .collect()
}

pub(crate) fn champion_name(
    champions: &HashMap<i32, (String, String)>,
    champion_id: i32,
) -> (String, String) {
    champions
        .get(&champion_id)
        .cloned()
        .unwrap_or_else(|| (champion_id.to_string(), format!("Campeón {champion_id}")))
}

pub(crate) fn lane_label(lane: &str) -> Option<String> {
    match lane {
        "TOP" => Some("Top".into()),
        "JUNGLE" => Some("Jungla".into()),
        "MIDDLE" => Some("Mid".into()),
        "BOTTOM" => Some("ADC".into()),
        _ => None,
    }
}

pub(crate) fn role_from_timeline(lane: Option<&str>, role: Option<&str>) -> Option<Role> {
    let lane = lane?.to_ascii_uppercase();
    let role = role.unwrap_or_default().to_ascii_uppercase();
    match lane.as_str() {
        "TOP" => Some(Role::Top),
        "JUNGLE" => Some(Role::Jungle),
        "MIDDLE" => Some(Role::Mid),
        "BOTTOM" => match role.as_str() {
            "SUPPORT" => Some(Role::Support),
            _ => Some(Role::Adc),
        },
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{SCOUTING_QUEUES, role_from_timeline};
    use draft_engine::data::GameData;
    use draft_engine::model::Role;

    #[test]
    fn maps_match_history_lanes_and_roles_to_exact_roles() {
        assert_eq!(
            role_from_timeline(Some("TOP"), Some("SOLO")),
            Some(Role::Top)
        );
        assert_eq!(
            role_from_timeline(Some("JUNGLE"), Some("NONE")),
            Some(Role::Jungle)
        );
        assert_eq!(
            role_from_timeline(Some("MIDDLE"), Some("SOLO")),
            Some(Role::Mid)
        );
        assert_eq!(
            role_from_timeline(Some("BOTTOM"), Some("CARRY")),
            Some(Role::Adc)
        );
        assert_eq!(
            role_from_timeline(Some("BOTTOM"), Some("SUPPORT")),
            Some(Role::Support)
        );
        assert_eq!(role_from_timeline(Some("NONE"), None), None);
    }

    #[test]
    fn scouting_queues_include_ranked_and_clash() {
        assert!(SCOUTING_QUEUES.contains(&420));
        assert!(SCOUTING_QUEUES.contains(&440));
        assert!(SCOUTING_QUEUES.contains(&42));
        assert!(SCOUTING_QUEUES.contains(&710));
        assert!(SCOUTING_QUEUES.contains(&700));
        assert!(!SCOUTING_QUEUES.contains(&400));
    }

    #[test]
    fn champion_roles_can_filter_masteries_by_position() {
        let data = GameData::embedded().expect("datos embebidos");
        let roles = super::champion_roles(&data);
        let ahri = data.champion("Ahri").expect("Ahri");
        let key = ahri.key.parse::<i32>().expect("key");
        assert!(
            roles
                .get(&key)
                .is_some_and(|roles| roles.contains(&Role::Mid))
        );
    }
}
