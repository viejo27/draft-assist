//! Maps the Live Client Data payload into the snapshot consumed by the UI.

use std::collections::HashMap;

use draft_engine::data::GameData;

use super::model::{
    LiveEvent, LiveEventView, LiveGamePayload, LiveLocationView, LivePlayerView, LiveSnapshot,
    LiveTeamStats,
};

const MAP_MIN: f32 = -120.0;
const MAP_SIZE_X: f32 = 14_990.0;
const MAP_SIZE_Y: f32 = 15_100.0;

const ORDER: &str = "ORDER";
const CHAOS: &str = "CHAOS";

pub fn build_snapshot(
    payload: &LiveGamePayload,
    data: &GameData,
    session_id: String,
) -> LiveSnapshot {
    let (players, aliases) = map_players(payload, data);
    let player_map: HashMap<String, LivePlayerView> = players
        .iter()
        .map(|player| (player.key.clone(), player.clone()))
        .collect();
    let active_key = active_player_key(&payload.active_player, &aliases);
    let our_team = active_key
        .as_ref()
        .and_then(|key| player_map.get(key))
        .map(|player| player.team.clone());

    let combat_locations = combat_locations(payload, &player_map, &aliases);
    let structure_locations = structure_locations(payload);
    let mut events = Vec::new();
    let mut latest_event_id = 0;
    let mut last_combat_location: Option<LiveLocationView> = None;
    let mut last_event_location: Option<LiveLocationView> = None;
    let mut result: Option<String> = None;
    let mut game_end_time: Option<f64> = None;

    for event in &payload.events.events {
        if !is_supported(&event.event_name) {
            continue;
        }

        let mut location = event_location(
            event,
            &player_map,
            &aliases,
            &combat_locations,
            &structure_locations,
            &last_combat_location,
            &last_event_location,
        );
        if let Some(current) = &location {
            last_event_location = Some(current.clone());
        }
        if event.event_name == "ChampionKill" {
            last_combat_location = location.clone();
        }

        let participants = event_participants(event, &player_map, &aliases);
        let Some(text) = event_text(event, &player_map, &aliases) else {
            continue;
        };

        if event.event_name == "GameEnd" {
            result = event.result.clone();
            game_end_time = Some(event.event_time);
            location = None;
        }

        latest_event_id = latest_event_id.max(event.event_id);
        events.push(LiveEventView {
            id: event.event_id,
            name: event.event_name.clone(),
            time: event.event_time,
            text,
            participants,
            location,
            result: event.result.clone(),
        });
    }

    let ended = result.is_some();
    let duration_seconds = game_end_time.unwrap_or(payload.game_data.game_time);
    let order_stats = team_stats(ORDER, &player_map, &aliases, &payload.events.events);
    let chaos_stats = team_stats(CHAOS, &player_map, &aliases, &payload.events.events);
    let (our_stats, enemy_stats) = match our_team.as_deref() {
        Some(ORDER) => (Some(order_stats), Some(chaos_stats)),
        Some(CHAOS) => (Some(chaos_stats), Some(order_stats)),
        _ => (None, None),
    };

    LiveSnapshot {
        available: true,
        session_id,
        captured_at_ms: now_ms(),
        game_time: payload.game_data.game_time,
        game_mode: payload.game_data.game_mode.clone(),
        map_name: payload.game_data.map_name.clone(),
        our_team,
        active_player_name: active_key
            .as_ref()
            .and_then(|key| player_map.get(key))
            .map(|player| player.player_name.clone()),
        players,
        events,
        latest_event_id,
        result,
        ended,
        duration_seconds,
        our_stats,
        enemy_stats,
    }
}

fn map_players(
    payload: &LiveGamePayload,
    data: &GameData,
) -> (Vec<LivePlayerView>, HashMap<String, String>) {
    let mut players = Vec::with_capacity(payload.all_players.len());
    let mut aliases: HashMap<String, String> = HashMap::new();

    for player in &payload.all_players {
        let key = player_key(
            player.riot_id_game_name.as_deref(),
            player.riot_id.as_deref(),
            &player.summoner_name,
        );
        let role = role_from_position(&player.position);
        let champion_name = player.champion_name.clone().unwrap_or_default();

        for alias in [
            player.riot_id_game_name.as_deref(),
            player.riot_id.as_deref(),
            Some(player.summoner_name.as_str()),
            Some(key.as_str()),
        ]
        .into_iter()
        .flatten()
        {
            let normalized = normalize_key(alias);
            if !normalized.is_empty() {
                aliases.entry(normalized).or_insert_with(|| key.clone());
            }
        }

        players.push(LivePlayerView {
            key,
            player_name: display_player_name(
                player.riot_id_game_name.as_deref(),
                &player.summoner_name,
            ),
            champion_id: champion_id_for_name(data, &champion_name),
            champion_name,
            team: player.team.clone(),
            position: player.position.clone(),
            role: role.map(str::to_string),
            level: player.level,
            kills: player.scores.kills,
            deaths: player.scores.deaths,
            assists: player.scores.assists,
            creep_score: player.scores.creep_score,
            ward_score: player.scores.ward_score,
            is_dead: player.is_dead,
            respawn_timer: player.respawn_timer,
            start_x: start_position(&player.team, role).0,
            start_y: start_position(&player.team, role).1,
            is_active: false,
        });
    }

    let active_key = active_player_key(&payload.active_player, &aliases);
    if let Some(active_key) = active_key {
        for player in &mut players {
            if player.key == active_key {
                player.is_active = true;
            }
        }
    }

    players.sort_by_key(|player| (team_rank(&player.team), role_rank(player.role.as_deref())));
    (players, aliases)
}

fn active_player_key(
    active: &super::model::LiveActivePlayer,
    aliases: &HashMap<String, String>,
) -> Option<String> {
    let raw = active
        .riot_id_game_name
        .as_deref()
        .or(active.summoner_name.as_deref())
        .or(active.riot_id.as_deref())?;
    let normalized = normalize_key(raw);
    Some(aliases.get(&normalized).cloned().unwrap_or(normalized))
}

fn player_key(game_name: Option<&str>, riot_id: Option<&str>, summoner_name: &str) -> String {
    game_name
        .map(normalize_key)
        .filter(|key| !key.is_empty())
        .or_else(|| {
            let name = summoner_name.split('#').next().unwrap_or(summoner_name);
            Some(normalize_key(name)).filter(|key| !key.is_empty())
        })
        .or_else(|| riot_id.map(normalize_key).filter(|key| !key.is_empty()))
        .unwrap_or_else(|| normalize_key(summoner_name))
}

fn display_player_name(game_name: Option<&str>, summoner_name: &str) -> String {
    game_name
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| {
            summoner_name
                .split('#')
                .next()
                .unwrap_or(summoner_name)
                .trim()
                .to_string()
        })
}

fn normalize_key(value: &str) -> String {
    value
        .trim()
        .split('#')
        .next()
        .unwrap_or(value)
        .trim()
        .to_lowercase()
}

fn find_player<'a>(
    players: &'a HashMap<String, LivePlayerView>,
    aliases: &HashMap<String, String>,
    name: &str,
) -> Option<&'a LivePlayerView> {
    let normalized = normalize_key(name);
    let key = aliases
        .get(&normalized)
        .map(String::as_str)
        .unwrap_or(&normalized);
    players.get(key)
}

fn champion_id_for_name(data: &GameData, name: &str) -> Option<String> {
    if name.trim().is_empty() {
        return None;
    }
    let normalized = normalize_champion(name);
    for champion in &data.champions {
        if normalize_champion(&champion.name) == normalized
            || normalize_champion(&champion.id) == normalized
        {
            return Some(champion.id.clone());
        }
    }
    data.champions
        .iter()
        .find(|champion| {
            let candidate = normalize_champion(&champion.name);
            candidate.len() >= 4
                && (normalized.starts_with(&candidate) || candidate.starts_with(&normalized))
        })
        .map(|champion| champion.id.clone())
}

fn normalize_champion(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn role_from_position(position: &str) -> Option<&'static str> {
    match position.trim().to_ascii_uppercase().as_str() {
        "TOP" => Some("TOP"),
        "JUNGLE" => Some("JUNGLE"),
        "MIDDLE" | "MID" => Some("MID"),
        "BOTTOM" | "BOT" | "ADC" => Some("ADC"),
        "UTILITY" | "SUPPORT" => Some("SUPPORT"),
        _ => None,
    }
}

fn team_rank(team: &str) -> u8 {
    match team {
        ORDER => 0,
        CHAOS => 1,
        _ => 2,
    }
}

fn role_rank(role: Option<&str>) -> u8 {
    match role {
        Some("TOP") => 0,
        Some("JUNGLE") => 1,
        Some("MID") => 2,
        Some("ADC") => 3,
        Some("SUPPORT") => 4,
        _ => 9,
    }
}

fn start_position(team: &str, role: Option<&str>) -> (f32, f32) {
    match (team, role) {
        (ORDER, Some("TOP")) => (12.0, 43.0),
        (ORDER, Some("JUNGLE")) => (30.0, 70.0),
        (ORDER, Some("MID")) => (44.0, 60.0),
        (ORDER, Some("ADC")) => (70.0, 86.0),
        (ORDER, Some("SUPPORT")) => (66.0, 89.0),
        (ORDER, _) => (8.0, 92.0),
        (CHAOS, Some("TOP")) => (25.0, 17.0),
        (CHAOS, Some("JUNGLE")) => (70.0, 30.0),
        (CHAOS, Some("MID")) => (56.0, 40.0),
        (CHAOS, Some("ADC")) => (88.0, 72.0),
        (CHAOS, Some("SUPPORT")) => (84.0, 78.0),
        (CHAOS, _) => (92.0, 8.0),
        _ => (50.0, 50.0),
    }
}

fn supported_events() -> &'static [&'static str] {
    &[
        "GameStart",
        "MinionsSpawning",
        "ChampionKill",
        "FirstBlood",
        "Multikill",
        "Ace",
        "DragonKill",
        "HeraldKill",
        "BaronKill",
        "HordeKill",
        "TurretKilled",
        "FirstBrick",
        "InhibKilled",
        "GameEnd",
    ]
}

fn is_supported(name: &str) -> bool {
    supported_events().contains(&name)
}

fn event_location(
    event: &LiveEvent,
    players: &HashMap<String, LivePlayerView>,
    aliases: &HashMap<String, String>,
    combat_locations: &HashMap<i64, LiveLocationView>,
    structure_locations: &HashMap<i64, LiveLocationView>,
    last_combat_location: &Option<LiveLocationView>,
    last_event_location: &Option<LiveLocationView>,
) -> Option<LiveLocationView> {
    let time_key = time_key(event.event_time);
    match event.event_name.as_str() {
        "ChampionKill" => {
            let victim = event
                .victim_name
                .as_deref()
                .and_then(|name| find_player(players, aliases, name));
            victim
                .map(|player| kill_location(&player.team, player.role.as_deref()))
                .or_else(|| Some(neutral_location()))
        }
        "FirstBlood" | "Multikill" => combat_locations
            .get(&time_key)
            .cloned()
            .or_else(|| last_combat_location.clone())
            .or_else(|| Some(neutral_location())),
        "Ace" => last_combat_location
            .clone()
            .or_else(|| combat_locations.get(&time_key).cloned())
            .or_else(|| last_event_location.clone())
            .or_else(|| Some(neutral_location())),
        "DragonKill" => Some(objective_location(
            "dragon",
            "Foso del Dragón",
            9_950.0,
            4_800.0,
        )),
        "HeraldKill" | "BaronKill" => Some(objective_location(
            "baron",
            "Foso del Barón",
            5_000.0,
            10_200.0,
        )),
        "HordeKill" => Some(objective_location(
            "void",
            "Foso del Vacío",
            3_000.0,
            10_000.0,
        )),
        "TurretKilled" | "InhibKilled" => structure_locations.get(&time_key).cloned(),
        "FirstBrick" => structure_locations.get(&time_key).cloned(),
        _ => None,
    }
}

fn event_participants(
    event: &LiveEvent,
    players: &HashMap<String, LivePlayerView>,
    aliases: &HashMap<String, String>,
) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    match event.event_name.as_str() {
        "ChampionKill" => {
            if let Some(killer) = &event.killer_name {
                names.push(killer.clone());
            }
            if let Some(victim) = &event.victim_name {
                names.push(victim.clone());
            }
            if let Some(assisters) = &event.assisters {
                names.extend(assisters.iter().cloned());
            }
        }
        "FirstBlood" => {
            if let Some(recipient) = &event.recipient {
                names.push(recipient.clone());
            }
        }
        "Multikill" => {
            if let Some(killer) = &event.killer_name {
                names.push(killer.clone());
            }
        }
        "Ace" => {
            if let Some(acer) = &event.acer {
                names.push(acer.clone());
            }
        }
        "FirstBrick" => {
            if let Some(killer) = &event.killer_name {
                names.push(killer.clone());
            }
        }
        "DragonKill" | "HeraldKill" | "BaronKill" | "HordeKill" | "TurretKilled"
        | "InhibKilled" => {
            if let Some(killer) = &event.killer_name {
                names.push(killer.clone());
            }
            if let Some(assisters) = &event.assisters {
                names.extend(assisters.iter().cloned());
            }
        }
        _ => {}
    }

    let mut participants = Vec::new();
    for name in names {
        if let Some(player) = find_player(players, aliases, &name)
            && !participants.contains(&player.key)
        {
            participants.push(player.key.clone());
        }
    }
    participants
}

fn event_text(
    event: &LiveEvent,
    players: &HashMap<String, LivePlayerView>,
    aliases: &HashMap<String, String>,
) -> Option<String> {
    let killer_any = event
        .killer_name
        .as_deref()
        .map(|name| player_label(name, players, aliases));
    let killer_player = event
        .killer_name
        .as_deref()
        .filter(|name| find_player(players, aliases, name).is_some())
        .map(|name| player_label(name, players, aliases));
    let victim = event
        .victim_name
        .as_deref()
        .map(|name| player_label(name, players, aliases));
    let assisters = event
        .assisters
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .filter(|name| find_player(players, aliases, name).is_some())
        .map(|name| player_label(name, players, aliases))
        .collect::<Vec<_>>();

    let text = match event.event_name.as_str() {
        "GameStart" => "Comienza la partida".to_string(),
        "MinionsSpawning" => "Aparecen los súbditos".to_string(),
        "ChampionKill" => {
            let killer = killer_any.unwrap_or_else(|| "Alguien".to_string());
            let victim = victim.unwrap_or_else(|| "un campeón".to_string());
            let mut message = format!("{killer} mató a {victim}");
            if !assisters.is_empty() {
                message.push_str(&format!(" con la ayuda de {}", assisters.join(", ")));
            }
            message
        }
        "FirstBlood" => {
            let recipient = event
                .recipient
                .as_deref()
                .map(|name| player_label(name, players, aliases))
                .unwrap_or_else(|| "Alguien".to_string());
            format!("{recipient} consiguió la primera sangre")
        }
        "Multikill" => {
            let killer = killer_any.unwrap_or_else(|| "Alguien".to_string());
            let streak = match event.kill_streak.unwrap_or(2) {
                2 => "doble kill",
                3 => "triple kill",
                4 => "cuádruple kill",
                5 => "penta kill",
                _ => "multikill",
            };
            format!("{killer} logró un {streak}")
        }
        "Ace" => {
            let team = event
                .acing_team
                .as_deref()
                .map(team_spanish)
                .unwrap_or("el equipo");
            let acer = event
                .acer
                .as_deref()
                .map(|name| player_label(name, players, aliases));
            match acer {
                Some(acer) => format!("{team} consiguió un Ace con {acer}"),
                None => format!("{team} consiguió un Ace"),
            }
        }
        "DragonKill" => {
            let killer = killer_any?;
            let dragon = dragon_spanish(event.dragon_type.as_deref().unwrap_or("Unknown"));
            if is_stolen(event) {
                format!("{killer} robó el dragón de {dragon}")
            } else {
                format!("{killer} mató al dragón de {dragon}")
            }
        }
        "HeraldKill" => {
            let killer = killer_any?;
            if is_stolen(event) {
                format!("{killer} robó el Heraldo de la Grieta")
            } else {
                format!("{killer} mató al Heraldo de la Grieta")
            }
        }
        "BaronKill" => {
            let killer = killer_any?;
            if is_stolen(event) {
                format!("{killer} robó el Barón Nashor")
            } else {
                format!("{killer} mató al Barón Nashor")
            }
        }
        "HordeKill" => {
            let killer = killer_any?;
            format!("{killer} mató a una larva del Vacío")
        }
        "TurretKilled" => {
            let structure = event.turret_killed.as_deref().and_then(parse_structure)?;
            let subject = structure_subject(&structure);
            match killer_player {
                Some(killer) => format!("{killer} destruyó {subject}"),
                None => {
                    let team = event
                        .killer_name
                        .as_deref()
                        .and_then(team_from_minion)
                        .map(team_spanish)
                        .unwrap_or("un equipo");
                    format!("{team} destruyó {subject}")
                }
            }
        }
        "FirstBrick" => {
            let team = event
                .killer_name
                .as_deref()
                .and_then(team_from_minion)
                .map(team_spanish);
            match team {
                Some(team) => format!("{team} derribó la primera torre"),
                None => "Primera torre derribada".to_string(),
            }
        }
        "InhibKilled" => {
            let structure = event.inhib_killed.as_deref().and_then(parse_structure)?;
            let subject = structure_subject(&structure);
            match killer_player {
                Some(killer) => format!("{killer} destruyó {subject}"),
                None => {
                    let team = event
                        .killer_name
                        .as_deref()
                        .and_then(team_from_minion)
                        .map(team_spanish)
                        .unwrap_or("un equipo");
                    format!("{team} destruyó {subject}")
                }
            }
        }
        "GameEnd" => {
            let result = match event.result.as_deref() {
                Some("Win") => "Victoria",
                Some("Lose") => "Derrota",
                Some(other) => other,
                None => "Sin resultado",
            };
            format!("Fin de la partida · {result}")
        }
        _ => return None,
    };

    Some(text)
}

fn player_label(
    name: &str,
    players: &HashMap<String, LivePlayerView>,
    aliases: &HashMap<String, String>,
) -> String {
    let display = name.trim();
    match find_player(players, aliases, display) {
        Some(player) if !player.champion_name.is_empty() => {
            format!("{display} ({})", player.champion_name)
        }
        _ => display.to_string(),
    }
}

fn combat_locations(
    payload: &LiveGamePayload,
    players: &HashMap<String, LivePlayerView>,
    aliases: &HashMap<String, String>,
) -> HashMap<i64, LiveLocationView> {
    let mut locations = HashMap::new();
    for event in &payload.events.events {
        if event.event_name != "ChampionKill" {
            continue;
        }
        let Some(player) = event
            .victim_name
            .as_deref()
            .and_then(|name| find_player(players, aliases, name))
        else {
            continue;
        };
        locations.insert(
            time_key(event.event_time),
            kill_location(&player.team, player.role.as_deref()),
        );
    }
    locations
}

fn structure_locations(payload: &LiveGamePayload) -> HashMap<i64, LiveLocationView> {
    let mut locations = HashMap::new();
    for event in &payload.events.events {
        let name = match event.event_name.as_str() {
            "TurretKilled" => event.turret_killed.as_deref(),
            "InhibKilled" => event.inhib_killed.as_deref(),
            _ => None,
        };
        let Some(name) = name else {
            continue;
        };
        let Some(structure) = parse_structure(name) else {
            continue;
        };
        if let Some(location) = structure_location(&structure) {
            locations.insert(time_key(event.event_time), location);
        }
    }
    locations
}

fn team_stats(
    team: &str,
    players: &HashMap<String, LivePlayerView>,
    aliases: &HashMap<String, String>,
    events: &[LiveEvent],
) -> LiveTeamStats {
    let kills = players
        .values()
        .filter(|player| player.team == team)
        .map(|player| player.kills)
        .sum();

    let mut stats = LiveTeamStats {
        kills,
        ..LiveTeamStats::default()
    };
    for event in events {
        let Some(killer_team) = event
            .killer_name
            .as_deref()
            .and_then(|name| team_for_name(name, players, aliases))
        else {
            continue;
        };
        if killer_team != team {
            continue;
        }
        match event.event_name.as_str() {
            "TurretKilled" => stats.towers += 1,
            "DragonKill" => stats.dragons += 1,
            "BaronKill" => stats.barons += 1,
            "HeraldKill" => stats.heralds += 1,
            _ => {}
        }
    }
    stats
}

fn team_for_name(
    name: &str,
    players: &HashMap<String, LivePlayerView>,
    aliases: &HashMap<String, String>,
) -> Option<String> {
    find_player(players, aliases, name)
        .map(|player| player.team.clone())
        .or_else(|| team_from_minion(name).map(str::to_string))
}

fn team_from_minion(name: &str) -> Option<&'static str> {
    let upper = name.to_ascii_uppercase();
    if upper.contains("T100") || upper.contains("T1_") || upper.contains("_ORDER") {
        Some(ORDER)
    } else if upper.contains("T200") || upper.contains("T2_") || upper.contains("_CHAOS") {
        Some(CHAOS)
    } else {
        None
    }
}

fn team_spanish(team: &str) -> &'static str {
    match team {
        ORDER => "El equipo azul",
        CHAOS => "El equipo rojo",
        _ => "Un equipo",
    }
}

fn dragon_spanish(dragon: &str) -> &str {
    match dragon {
        "Air" => "Viento",
        "Earth" => "Tierra",
        "Fire" => "Fuego",
        "Water" => "Agua",
        "Hextech" => "Hextech",
        "Chemtech" => "Quimtech",
        "Elder" => "Anciano",
        other => other,
    }
}

fn is_stolen(event: &LiveEvent) -> bool {
    event.stolen.as_deref() == Some("True")
}

fn objective_location(key: &str, label: &str, world_x: f32, world_y: f32) -> LiveLocationView {
    let (x, y) = map_pos(world_x, world_y);
    LiveLocationView {
        key: key.to_string(),
        label: label.to_string(),
        x,
        y,
    }
}

fn neutral_location() -> LiveLocationView {
    LiveLocationView {
        key: "river".to_string(),
        label: "Río / centro".to_string(),
        x: 50.0,
        y: 50.0,
    }
}

fn kill_location(team: &str, role: Option<&str>) -> LiveLocationView {
    let (key, label, x, y) = match (team, role) {
        (ORDER, Some("TOP")) => ("top-blue", "Línea superior", 12.0, 43.0),
        (ORDER, Some("JUNGLE")) => ("jungle-blue", "Jungla azul", 30.0, 70.0),
        (ORDER, Some("MID")) => ("mid-blue", "Línea central", 44.0, 60.0),
        (ORDER, Some("ADC")) => ("bot-blue", "Línea inferior", 70.0, 86.0),
        (ORDER, Some("SUPPORT")) => ("bot-blue", "Línea inferior", 66.0, 89.0),
        (CHAOS, Some("TOP")) => ("top-red", "Línea superior", 25.0, 17.0),
        (CHAOS, Some("JUNGLE")) => ("jungle-red", "Jungla roja", 70.0, 30.0),
        (CHAOS, Some("MID")) => ("mid-red", "Línea central", 56.0, 40.0),
        (CHAOS, Some("ADC")) => ("bot-red", "Línea inferior", 88.0, 72.0),
        (CHAOS, Some("SUPPORT")) => ("bot-red", "Línea inferior", 84.0, 78.0),
        _ => ("river", "Río / centro", 50.0, 50.0),
    };
    LiveLocationView {
        key: key.to_string(),
        label: label.to_string(),
        x,
        y,
    }
}

struct Structure {
    kind: StructureKind,
    team: String,
    lane: String,
    tier: u8,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum StructureKind {
    Turret,
    Inhibitor,
}

fn parse_structure(name: &str) -> Option<Structure> {
    let parts: Vec<&str> = name.split('_').collect();
    let kind = match parts.first().copied()? {
        "Turret" => StructureKind::Turret,
        "Inhib" | "Barracks" => StructureKind::Inhibitor,
        _ => return None,
    };
    let team = match *parts.get(1)? {
        "TOrder" | "T1" => ORDER,
        "TChaos" | "T2" => CHAOS,
        _ => return None,
    };
    let lane = match *parts.get(2)? {
        "L0" => "BOT",
        "L1" => "MID",
        "L2" => "TOP",
        _ => return None,
    };
    let position = parts.get(3)?;
    let raw_tier = position
        .strip_prefix('P')
        .and_then(|value| value.parse::<u8>().ok())?;
    let tier = match raw_tier {
        1 => 3,
        2 => 2,
        3 => 1,
        4 => 4,
        5 => 5,
        _ => return None,
    };
    Some(Structure {
        kind,
        team: team.to_string(),
        lane: lane.to_string(),
        tier,
    })
}

fn structure_location(structure: &Structure) -> Option<LiveLocationView> {
    let (x, y) = if structure.kind == StructureKind::Inhibitor {
        inhibitor_world(&structure.team, &structure.lane)?
    } else {
        turret_world(&structure.team, &structure.lane, structure.tier)?
    };
    let (x, y) = map_pos(x, y);
    Some(LiveLocationView {
        key: format!(
            "{}-{}-{}-{}",
            if structure.kind == StructureKind::Inhibitor {
                "inhib"
            } else {
                "turret"
            },
            structure.team.to_ascii_lowercase(),
            structure.lane.to_ascii_lowercase(),
            structure.tier
        ),
        label: structure_label(structure),
        x,
        y,
    })
}

fn structure_label(structure: &Structure) -> String {
    let team = if structure.team == ORDER {
        "azul"
    } else {
        "roja"
    };
    let lane = match structure.lane.as_str() {
        "TOP" => "superior",
        "MID" => "central",
        "BOT" => "inferior",
        _ => "desconocida",
    };
    match structure.kind {
        StructureKind::Inhibitor => {
            format!("Inhibidor de la línea {lane} {team}")
        }
        StructureKind::Turret => {
            let tier = match structure.tier {
                1 => "exterior",
                2 => "interior",
                3 => "de inhibidor",
                4 | 5 => "del nexo",
                _ => "desconocida",
            };
            if structure.tier >= 4 {
                format!("Torre del nexo {team}")
            } else {
                format!("Torre {tier} de la línea {lane} {team}")
            }
        }
    }
}

fn structure_subject(structure: &Structure) -> String {
    let team = if structure.team == ORDER {
        "azul"
    } else {
        "roja"
    };
    let lane = match structure.lane.as_str() {
        "TOP" => "superior",
        "MID" => "central",
        "BOT" => "inferior",
        _ => "desconocida",
    };
    match structure.kind {
        StructureKind::Inhibitor => {
            format!("el inhibidor de la línea {lane} {team}")
        }
        StructureKind::Turret => {
            if structure.tier >= 4 {
                format!("una torre del nexo {team}")
            } else {
                let tier = match structure.tier {
                    1 => "exterior",
                    2 => "interior",
                    3 => "de inhibidor",
                    _ => "desconocida",
                };
                format!("la torre {tier} de la línea {lane} {team}")
            }
        }
    }
}

fn turret_world(team: &str, lane: &str, tier: u8) -> Option<(f32, f32)> {
    let position = match team {
        ORDER => match (lane, tier) {
            ("TOP", 1) => (981.0, 10_441.0),
            ("TOP", 2) => (1_512.0, 6_699.0),
            ("TOP", 3) => (1_169.0, 4_287.0),
            ("MID", 1) => (5_846.0, 6_396.0),
            ("MID", 2) => (5_048.0, 4_812.0),
            ("MID", 3) => (3_651.0, 3_696.0),
            ("BOT", 1) => (10_504.0, 1_029.0),
            ("BOT", 2) => (6_919.0, 1_483.0),
            ("BOT", 3) => (4_281.0, 1_253.0),
            (_, 4) => (1_748.0, 2_270.0),
            (_, 5) => (2_177.0, 1_807.0),
            _ => return None,
        },
        CHAOS => match (lane, tier) {
            ("TOP", 1) => (4_318.0, 13_875.0),
            ("TOP", 2) => (7_943.0, 13_411.0),
            ("TOP", 3) => (10_481.0, 13_650.0),
            ("MID", 1) => (8_955.0, 8_510.0),
            ("MID", 2) => (9_767.0, 10_113.0),
            ("MID", 3) => (11_134.0, 11_207.0),
            ("BOT", 1) => (13_866.0, 4_505.0),
            ("BOT", 2) => (13_327.0, 8_226.0),
            ("BOT", 3) => (13_624.0, 10_572.0),
            (_, 4) => (12_611.0, 13_084.0),
            (_, 5) => (13_052.0, 12_612.0),
            _ => return None,
        },
        _ => return None,
    };
    Some(position)
}

fn inhibitor_world(team: &str, lane: &str) -> Option<(f32, f32)> {
    match (team, lane) {
        (ORDER, "TOP") => Some((1_171.0, 3_571.0)),
        (ORDER, "MID") => Some((3_203.0, 3_208.0)),
        (ORDER, "BOT") => Some((3_452.0, 1_236.0)),
        (CHAOS, "TOP") => Some((11_261.0, 13_676.0)),
        (CHAOS, "MID") => Some((11_598.0, 11_667.0)),
        (CHAOS, "BOT") => Some((13_604.0, 11_316.0)),
        _ => None,
    }
}

fn map_pos(world_x: f32, world_y: f32) -> (f32, f32) {
    let x = (world_x - MAP_MIN) / MAP_SIZE_X * 100.0;
    let y = (1.0 - (world_y - MAP_MIN) / MAP_SIZE_Y) * 100.0;
    (clamp_percent(x), clamp_percent(y))
}

fn clamp_percent(value: f32) -> f32 {
    value.clamp(2.0, 98.0)
}

fn time_key(time: f64) -> i64 {
    (time * 1_000.0).round() as i64
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{
        build_snapshot, champion_id_for_name, map_pos, parse_structure, start_position,
        structure_label, turret_world,
    };
    use crate::live::model::LiveGamePayload;
    use draft_engine::data::GameData;

    const PAYLOAD: &str = r#"
    {
      "activePlayer": {
        "riotIdGameName": "bepi",
        "riotId": "bepi#LAS",
        "summonerName": "bepi#LAS",
        "championName": "Jax"
      },
      "allPlayers": [
        {"championName":"Jax","isDead":false,"level":17,"position":"TOP","riotId":"bepi#LAS","riotIdGameName":"bepi","summonerName":"bepi#LAS","team":"ORDER","scores":{"kills":9,"deaths":3,"assists":1,"creepScore":200,"wardScore":19.2}},
        {"championName":"Cho'Gath","isDead":false,"level":12,"position":"JUNGLE","riotId":"Lord Viejo#520","riotIdGameName":"Lord Viejo","summonerName":"Lord Viejo#520","team":"ORDER","scores":{"kills":3,"deaths":2,"assists":5,"creepScore":120,"wardScore":10.0}},
        {"championName":"Mel","isDead":false,"level":13,"position":"MIDDLE","riotIdGameName":"Shelzian","summonerName":"Shelzian#LAS","team":"ORDER","scores":{"kills":4,"deaths":2,"assists":6,"creepScore":180,"wardScore":8.0}},
        {"championName":"Miss Fortune","isDead":false,"level":11,"position":"BOTTOM","riotIdGameName":"Pablanga","summonerName":"Pablanga#LAS","team":"ORDER","scores":{"kills":5,"deaths":1,"assists":4,"creepScore":210,"wardScore":12.0}},
        {"championName":"Neeko","isDead":false,"level":10,"position":"UTILITY","riotIdGameName":"Benji","summonerName":"Benji#LAS","team":"ORDER","scores":{"kills":1,"deaths":4,"assists":12,"creepScore":30,"wardScore":35.0}},
        {"championName":"Wukong","isDead":false,"level":13,"position":"TOP","riotIdGameName":"Mishter","summonerName":"Mishter#LAS","team":"CHAOS","scores":{"kills":2,"deaths":4,"assists":3,"creepScore":170,"wardScore":9.0}},
        {"championName":"Shyvana","isDead":false,"level":15,"position":"JUNGLE","riotIdGameName":"The Rhaastcist","summonerName":"The Rhaastcist#LAS","team":"CHAOS","scores":{"kills":4,"deaths":5,"assists":2,"creepScore":150,"wardScore":11.0}},
        {"championName":"Morgana","isDead":false,"level":12,"position":"MIDDLE","riotIdGameName":"yeisonBORGer","summonerName":"yeisonBORGer#LAS","team":"CHAOS","scores":{"kills":1,"deaths":4,"assists":7,"creepScore":160,"wardScore":14.0}},
        {"championName":"Jhin","isDead":false,"level":11,"position":"BOTTOM","riotIdGameName":"Yi Sang","summonerName":"Yi Sang#LAS","team":"CHAOS","scores":{"kills":6,"deaths":3,"assists":1,"creepScore":205,"wardScore":7.0}},
        {"championName":"Nami","isDead":false,"level":12,"position":"UTILITY","riotIdGameName":"KyrieBerios17","summonerName":"KyrieBerios17#LAS","team":"CHAOS","scores":{"kills":0,"deaths":5,"assists":10,"creepScore":25,"wardScore":38.0}}
      ],
      "events": {
        "Events": [
          {"EventID":0,"EventName":"GameStart","EventTime":0.0},
          {"EventID":1,"EventName":"MinionsSpawning","EventTime":30.0},
          {"EventID":2,"EventName":"ChampionKill","EventTime":85.3,"KillerName":"bepi","VictimName":"Mishter","Assisters":[]},
          {"EventID":3,"EventName":"FirstBlood","EventTime":85.3,"Recipient":"bepi"},
          {"EventID":4,"EventName":"Multikill","EventTime":85.3,"KillStreak":2,"KillerName":"bepi"},
          {"EventID":5,"EventName":"DragonKill","EventTime":400.0,"KillerName":"The Rhaastcist","Assisters":["KyrieBerios17"],"DragonType":"Air","Stolen":"False"},
          {"EventID":6,"EventName":"TurretKilled","EventTime":600.0,"KillerName":"bepi","Assisters":["Lord Viejo"],"TurretKilled":"Turret_TChaos_L1_P1_2555066350_0"},
          {"EventID":7,"EventName":"Ace","EventTime":650.0,"Acer":"bepi","AcingTeam":"ORDER"},
          {"EventID":8,"EventName":"GameEnd","EventTime":1428.2,"Result":"Win"}
        ]
      },
      "gameData": {"gameMode":"CLASSIC","gameTime":1428.2,"mapName":"Map11","mapNumber":11,"mapTerrain":"Default"}
    }
    "#;

    fn data() -> GameData {
        GameData::embedded().expect("datos embebidos")
    }

    #[test]
    fn maps_a_live_payload_into_a_snapshot() {
        let payload: LiveGamePayload = serde_json::from_str(PAYLOAD).unwrap();
        let snapshot = build_snapshot(&payload, &data(), "session-1".into());

        assert!(snapshot.available);
        assert_eq!(snapshot.our_team.as_deref(), Some("ORDER"));
        assert!(snapshot.ended);
        assert_eq!(snapshot.result.as_deref(), Some("Win"));
        assert_eq!(snapshot.players.len(), 10);
        assert_eq!(snapshot.players[0].champion_id.as_deref(), Some("Jax"));
        assert_eq!(snapshot.our_stats.as_ref().unwrap().kills, 22);
        assert_eq!(snapshot.enemy_stats.as_ref().unwrap().kills, 13);
        assert_eq!(snapshot.our_stats.as_ref().unwrap().dragons, 0);
        assert_eq!(snapshot.enemy_stats.as_ref().unwrap().dragons, 1);
        assert_eq!(snapshot.our_stats.as_ref().unwrap().towers, 1);
    }

    #[test]
    fn moves_first_blood_and_multikill_to_the_kill_zone() {
        let payload: LiveGamePayload = serde_json::from_str(PAYLOAD).unwrap();
        let snapshot = build_snapshot(&payload, &data(), "session-1".into());
        let kill = snapshot
            .events
            .iter()
            .find(|event| event.name == "ChampionKill")
            .unwrap();
        let first_blood = snapshot
            .events
            .iter()
            .find(|event| event.name == "FirstBlood")
            .unwrap();
        let multikill = snapshot
            .events
            .iter()
            .find(|event| event.name == "Multikill")
            .unwrap();

        assert_eq!(kill.participants, vec!["bepi", "mishter"]);
        assert_eq!(first_blood.participants, vec!["bepi"]);
        assert_eq!(multikill.participants, vec!["bepi"]);
        assert_eq!(first_blood.location.as_ref().unwrap().key, "top-red");
        assert_eq!(multikill.location.as_ref().unwrap().key, "top-red");
    }

    #[test]
    fn ace_uses_the_last_combat_location() {
        let payload: LiveGamePayload = serde_json::from_str(PAYLOAD).unwrap();
        let snapshot = build_snapshot(&payload, &data(), "session-1".into());
        let ace = snapshot
            .events
            .iter()
            .find(|event| event.name == "Ace")
            .unwrap();

        assert_eq!(ace.participants, vec!["bepi"]);
        assert_eq!(ace.location.as_ref().unwrap().key, "top-red");
    }

    #[test]
    fn parses_structures_and_maps_their_positions() {
        let bot_outer = parse_structure("Turret_TChaos_L0_P3_511845594_0").unwrap();
        assert_eq!(bot_outer.team, "CHAOS");
        assert_eq!(bot_outer.lane, "BOT");
        assert_eq!(bot_outer.tier, 1);
        assert_eq!(
            structure_label(&bot_outer),
            "Torre exterior de la línea inferior roja"
        );

        let top_inhib = parse_structure("Turret_TChaos_L2_P1_2555066350_0").unwrap();
        assert_eq!(top_inhib.lane, "TOP");
        assert_eq!(top_inhib.tier, 3);
        assert_eq!(
            structure_label(&top_inhib),
            "Torre de inhibidor de la línea superior roja"
        );

        assert_eq!(
            parse_structure("Inhib_TOrder_L1_P1_1_0").unwrap().lane,
            "MID"
        );
        assert!(turret_world("ORDER", "MID", 4).is_some());
        assert!(turret_world("CHAOS", "TOP", 1).is_some());
    }

    #[test]
    fn maps_world_coordinates_to_the_ddragon_map() {
        let (x, y) = map_pos(981.0, 10_441.0);
        assert!((x - 7.34).abs() < 0.2);
        assert!((y - 30.0).abs() < 0.2);
    }

    #[test]
    fn start_positions_are_mirrored_by_team() {
        let blue_top = start_position("ORDER", Some("TOP"));
        let red_top = start_position("CHAOS", Some("TOP"));
        assert_ne!(blue_top, red_top);
        assert_eq!(start_position("ORDER", Some("MID")), (44.0, 60.0));
    }

    #[test]
    fn matches_champion_names_with_punctuation() {
        let data = data();
        assert_eq!(
            champion_id_for_name(&data, "Cho'Gath").as_deref(),
            Some("Chogath")
        );
        assert_eq!(
            champion_id_for_name(&data, "Wukong").as_deref(),
            Some("MonkeyKing")
        );
        assert_eq!(
            champion_id_for_name(&data, "Kai'Sa").as_deref(),
            Some("Kaisa")
        );
    }

    #[test]
    fn resolves_bot_summoner_names_and_omits_time_from_event_text() {
        let payload_json = r#"
        {
          "activePlayer": {"riotIdGameName": "Faker", "summonerName": "Faker#KR1"},
          "allPlayers": [
            {"championName":"Ahri","isDead":false,"level":10,"position":"MIDDLE","riotIdGameName":"Faker","summonerName":"Faker#KR1","team":"ORDER","scores":{"kills":0,"deaths":0,"assists":0,"creepScore":0,"wardScore":0}},
            {"championName":"Lux","isDead":false,"level":10,"position":"MIDDLE","riotIdGameName":"Lux","summonerName":"Lux Bot","team":"CHAOS","scores":{"kills":0,"deaths":1,"assists":0,"creepScore":0,"wardScore":0}}
          ],
          "events": {"Events": [
            {"EventID":0,"EventName":"GameStart","EventTime":0.0},
            {"EventID":1,"EventName":"ChampionKill","EventTime":100.0,"KillerName":"Faker","VictimName":"Lux Bot","Assisters":[]}
          ]},
          "gameData": {"gameMode":"CLASSIC","gameTime":100.0,"mapName":"Map11"}
        }
        "#;
        let payload: LiveGamePayload = serde_json::from_str(payload_json).unwrap();
        let snapshot = build_snapshot(&payload, &data(), "session-bot".into());
        let event = snapshot
            .events
            .iter()
            .find(|event| event.name == "ChampionKill")
            .unwrap();

        assert_eq!(snapshot.our_team.as_deref(), Some("ORDER"));
        assert!(
            snapshot
                .players
                .iter()
                .find(|player| player.key == "faker")
                .unwrap()
                .is_active
        );
        assert!(
            !snapshot
                .players
                .iter()
                .find(|player| player.key == "lux")
                .unwrap()
                .is_active
        );
        assert_eq!(event.participants, vec!["faker", "lux"]);
        assert_eq!(event.location.as_ref().unwrap().key, "mid-red");
        assert!(event.text.contains("Lux Bot (Lux)"));
        assert!(!event.text.starts_with("00:"));
    }
}
