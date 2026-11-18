use draft_engine::Engine;
use draft_engine::data::{GameData, example_state};
use draft_engine::model::{
    AppState, DraftState, HistoryLine, HistorySignals, LcuTurn, Phase, PoolEntry, RecommendOptions,
    RecommendRequest, Settings, Side,
};
use draft_engine::scoring::{ban_history_adjustment, pick_history_adjustment};
use std::collections::BTreeMap;

fn engine() -> Engine {
    Engine::embedded().expect("los datos embebidos deben ser válidos")
}

fn example() -> AppState {
    example_state().expect("el ejemplo debe parsear")
}

fn request(state: AppState) -> RecommendRequest {
    RecommendRequest {
        draft: state.draft,
        roster: state.roster,
        options: RecommendOptions::from(&state.settings),
        history: None,
    }
}

#[test]
fn embedded_dataset_is_valid_and_complete() {
    let engine = engine();
    let data = engine.data();
    let report = data.validate();
    let stats = data.stats();

    assert!(
        report.valid,
        "el dataset embebido debe ser válido: {:?}",
        report.errors
    );
    assert_eq!(stats.champions, 173, "se esperaban 173 campeones");
    assert_eq!(stats.meta_entries, 173);
}

#[test]
fn example_draft_resolves_the_adc_turn() {
    let response = engine()
        .recommend(&request(example()))
        .expect("consulta válida");
    let turn = response.turn.expect("el ejemplo tiene turno activo");

    assert_eq!(turn.phase, Phase::Pick);
    assert_eq!(turn.pick_number, Some(4));
    assert_eq!(
        turn.current_player.expect("jugador actual").id,
        "adc",
        "el ejemplo debe resolver a Pablo en ADC"
    );
}

#[test]
fn recommendations_exclude_banned_and_picked_champions() {
    let state = example();
    let request = request(state);
    let unavailable: std::collections::HashSet<_> = request
        .draft
        .all_bans()
        .chain(request.draft.all_pick_ids())
        .cloned()
        .collect();
    let response = engine().recommend(&request).expect("consulta válida");

    assert!(
        response
            .recommendations
            .iter()
            .all(|rec| !unavailable.contains(&rec.champion.id)),
        "ninguna recomendación puede estar baneada o pickeada"
    );
}

#[test]
fn recommendations_respect_the_current_player_role() {
    let response = engine()
        .recommend(&request(example()))
        .expect("consulta válida");

    assert!(
        response
            .recommendations
            .iter()
            .all(|rec| rec.champion.roles.contains(&draft_engine::Role::Adc)),
        "el ejemplo pickea ADC y no permite flex fuera de rol"
    );
}

#[test]
fn composition_detects_missing_ad_damage() {
    let response = engine()
        .recommend(&request(example()))
        .expect("consulta válida");

    assert!(
        response
            .summary
            .composition
            .needs
            .iter()
            .any(|need| need.id == draft_engine::model::TeamNeed::AdDamage),
        "Ornn + Sejuani + Orianna no cubren el daño AD sostenido"
    );
}

#[test]
fn next_picks_suggest_the_support_after_the_adc() {
    let response = engine()
        .recommend(&request(example()))
        .expect("consulta válida");
    let next = response
        .next_picks
        .first()
        .expect("debe haber un próximo pick");

    assert_eq!(
        next.player.as_ref().map(|player| player.role),
        Some(draft_engine::Role::Support)
    );
    assert!(!next.suggestions.is_empty());
}

#[test]
fn top_n_is_configurable() {
    let mut state = example();
    state.settings.top_n = 3;
    let response = engine()
        .recommend(&request(state))
        .expect("consulta válida");

    assert_eq!(response.recommendations.len(), 3);
}

#[test]
fn pool_candidates_are_ordered_before_off_pool_candidates() {
    let mut state = example();
    state.settings.top_n = 5;
    state.roster.players[3].pool = vec![PoolEntry {
        champion_id: "Ashe".into(),
        comfort: 4,
        winrate: None,
    }];
    let response = engine()
        .recommend(&request(state))
        .expect("consulta válida");

    let first_off_pool = response.recommendations.iter().position(|rec| !rec.in_pool);
    let pool_cards = response
        .recommendations
        .iter()
        .filter(|rec| rec.in_pool)
        .count();

    assert!(
        first_off_pool.is_none_or(|index| index >= pool_cards),
        "todas las cartas del pool deben ir antes que las de fuera del pool"
    );
    assert!(
        response
            .recommendations
            .iter()
            .filter(|rec| !rec.in_pool)
            .all(|rec| rec.off_pool_warning.is_some()),
        "las cartas fuera del pool deben llevar advertencia"
    );
}

#[test]
fn off_pool_candidate_carries_a_warning() {
    let mut state = example();
    state.settings.top_n = 10;
    state.roster.players[3].pool = vec![PoolEntry {
        champion_id: "Ashe".into(),
        comfort: 4,
        winrate: None,
    }];
    let response = engine()
        .recommend(&request(state))
        .expect("consulta válida");

    let off_pool = response
        .recommendations
        .iter()
        .find(|rec| !rec.in_pool)
        .expect("con top 10 debe aparecer una opción off-pool");

    assert!(off_pool.off_pool_warning.is_some());
}

#[test]
fn ban_phase_returns_ban_recommendations_and_excludes_bans() {
    let mut state = example();
    state.draft = DraftState {
        version: 1,
        side: draft_engine::Side::Blue,
        template_id: "ranked".into(),
        step_index: 0,
        our_bans: vec!["Jinx".into()],
        enemy_bans: vec![],
        our_picks: vec![],
        enemy_picks: vec![],
        priorities: vec![],
        current_player_id: None,
        manual: None,
        lcu_turn: None,
    };
    state.settings = Settings::default();
    let response = engine()
        .recommend(&request(state))
        .expect("consulta válida");

    assert_eq!(response.turn.expect("turno de ban").phase, Phase::Ban);
    assert!(
        response
            .recommendations
            .iter()
            .all(|rec| rec.action == Phase::Ban),
        "todas las cartas deben ser bans"
    );
    assert!(
        response
            .recommendations
            .iter()
            .all(|rec| rec.champion.id != "Jinx"),
        "Jinx ya está baneada"
    );
    assert!(
        response.summary.composition.needs.is_empty(),
        "sin picks aliados no deben inventarse carencias"
    );
}

#[test]
fn matchup_values_are_directional_and_invertible() {
    let data = GameData::embedded().expect("datos válidos");
    let caitlyn_vs_jinx = data.matchup_value("Caitlyn", "Jinx").expect("matchup");
    let jinx_vs_caitlyn = data
        .matchup_value("Jinx", "Caitlyn")
        .expect("matchup invertido");
    let sivir_vs_caitlyn = data.matchup_value("Sivir", "Caitlyn").expect("matchup");

    assert!(caitlyn_vs_jinx.0 > 0.0);
    assert!(jinx_vs_caitlyn.0 < 0.0);
    assert!(sivir_vs_caitlyn.0 > 0.0);
}

#[test]
fn state_validation_rejects_duplicate_champions() {
    let mut state = example();
    state.draft.our_bans.push("Jinx".into());
    state.draft.our_bans.push("Jinx".into());

    let report = engine().validate_app_state(&state);

    assert!(!report.valid);
    assert!(
        report
            .errors
            .iter()
            .any(|error| error.contains("duplicado"))
    );
}

#[test]
fn lcu_turn_overrides_template_turn_and_player() {
    let mut state = example();
    state.draft.lcu_turn = Some(LcuTurn {
        phase: Phase::Pick,
        acting_side: Side::Blue,
        player_id: Some("support".into()),
        pick_number: Some(5),
        label: "Pick azul 5 · LCU".into(),
    });

    let response = engine().recommend(&request(state)).expect("consulta LCU");
    let turn = response.turn.expect("turno LCU");

    assert_eq!(turn.label, "Pick azul 5 · LCU");
    assert_eq!(turn.current_player.expect("jugador LCU").id, "support");
    assert!(
        response
            .recommendations
            .iter()
            .all(|rec| rec.champion.roles.contains(&draft_engine::Role::Support))
    );
}

#[test]
fn app_state_roundtrips_through_json() {
    let state = example();
    let json = serde_json::to_string(&state).expect("serializa");
    let decoded: AppState = serde_json::from_str(&json).expect("deserializa");

    assert_eq!(decoded.draft.side, state.draft.side);
    assert_eq!(decoded.roster.players.len(), 5);
    assert_eq!(decoded.draft.step_index, 17);
}

#[test]
fn offrole_flex_requires_the_explicit_option() {
    let mut state = example();
    state.draft.step_index = 10;
    state.draft.our_picks = vec![];
    state.draft.enemy_picks = vec![];
    state.draft.current_player_id = Some("mid".into());
    state.roster.players[2].pool.push(PoolEntry {
        champion_id: "MonkeyKing".into(),
        comfort: 3,
        winrate: None,
    });

    let mut without_flex = request(state.clone());
    without_flex.options = RecommendOptions {
        top_n: 30,
        allow_offrole_flex: false,
        pool_precedence: false,
        include_next_picks: false,
        use_history: false,
    };
    let response_without = engine()
        .recommend(&without_flex)
        .expect("consulta sin flex");
    assert!(
        response_without
            .recommendations
            .iter()
            .all(|rec| rec.champion.id != "MonkeyKing")
    );

    let mut with_flex = request(state);
    with_flex.options = RecommendOptions {
        top_n: 30,
        allow_offrole_flex: true,
        pool_precedence: false,
        include_next_picks: false,
        use_history: false,
    };
    let response_with = engine().recommend(&with_flex).expect("consulta con flex");
    let wukong = response_with
        .recommendations
        .iter()
        .find(|rec| rec.champion.id == "MonkeyKing")
        .expect("Wukong debe entrar como flex fuera de rol");

    assert!(
        wukong
            .risks
            .iter()
            .any(|risk| risk.contains("Flex fuera de rol"))
    );
}

#[test]
fn early_pick_prefers_meta_and_late_pick_can_prefer_the_counter() {
    let mut early = example();
    early.draft.step_index = 6;
    early.draft.our_picks = vec![];
    early.draft.enemy_picks = vec![];
    early.draft.our_bans = vec![];
    early.draft.enemy_bans = vec![];
    early.draft.current_player_id = Some("adc".into());
    early.roster.players[3].pool = vec![
        PoolEntry {
            champion_id: "Jinx".into(),
            comfort: 5,
            winrate: None,
        },
        PoolEntry {
            champion_id: "Sivir".into(),
            comfort: 5,
            winrate: None,
        },
    ];
    early.settings.top_n = 10;

    let early_response = engine().recommend(&request(early)).expect("early pick");
    let early_jinx = early_response
        .recommendations
        .iter()
        .position(|rec| rec.champion.id == "Jinx")
        .expect("Jinx disponible");
    let early_sivir = early_response
        .recommendations
        .iter()
        .position(|rec| rec.champion.id == "Sivir")
        .expect("Sivir disponible");
    assert!(
        early_jinx < early_sivir,
        "en early, Jinx debe superar a Sivir: Jinx {early_jinx}, Sivir {early_sivir}"
    );

    let mut late = example();
    late.roster.players[3].pool = vec![
        PoolEntry {
            champion_id: "Jinx".into(),
            comfort: 5,
            winrate: None,
        },
        PoolEntry {
            champion_id: "Sivir".into(),
            comfort: 5,
            winrate: None,
        },
    ];
    late.settings.top_n = 10;
    let late_response = engine().recommend(&request(late)).expect("late pick");
    let late_jinx = late_response
        .recommendations
        .iter()
        .position(|rec| rec.champion.id == "Jinx")
        .expect("Jinx disponible");
    let late_sivir = late_response
        .recommendations
        .iter()
        .position(|rec| rec.champion.id == "Sivir")
        .expect("Sivir disponible");
    assert!(
        late_sivir < late_jinx,
        "en late contra Caitlyn, Sivir debe superar a Jinx: Sivir {late_sivir}, Jinx {late_jinx}"
    );
}

#[test]
fn history_pick_adjustment_requires_sample_and_moves_both_ways() {
    let engine = engine();
    let config = &engine.data().config;
    let mut our_picks = BTreeMap::new();
    our_picks.insert(
        "Jinx".to_string(),
        HistoryLine {
            games: 5,
            wins: 4,
            losses: 1,
        },
    );
    our_picks.insert(
        "Ashe".to_string(),
        HistoryLine {
            games: 2,
            wins: 2,
            losses: 0,
        },
    );
    our_picks.insert(
        "Sivir".to_string(),
        HistoryLine {
            games: 4,
            wins: 1,
            losses: 3,
        },
    );
    let signals = HistorySignals {
        sample_matches: 6,
        our_picks,
        ..HistorySignals::default()
    };

    let jinx = pick_history_adjustment(Some(&signals), "Jinx", config).expect("Jinx con muestra");
    assert!(jinx.points > 0.0);
    assert!(jinx.points <= 2.0);
    assert!(pick_history_adjustment(Some(&signals), "Ashe", config).is_none());
    let sivir =
        pick_history_adjustment(Some(&signals), "Sivir", config).expect("Sivir con muestra");
    assert!(sivir.points < 0.0);
}

#[test]
fn history_ban_adjustment_handles_threat_and_self_pool() {
    let engine = engine();
    let config = &engine.data().config;
    let mut enemy_picks = BTreeMap::new();
    enemy_picks.insert(
        "Caitlyn".to_string(),
        HistoryLine {
            games: 5,
            wins: 1,
            losses: 4,
        },
    );
    let mut enemy_bans = BTreeMap::new();
    enemy_bans.insert("Caitlyn".to_string(), 3);
    let signals = HistorySignals {
        sample_matches: 6,
        enemy_picks,
        enemy_bans,
        ..HistorySignals::default()
    };

    let caitlyn =
        ban_history_adjustment(Some(&signals), "Caitlyn", false, config).expect("Caitlyn");
    assert!(caitlyn.points > 0.0);
    assert!(caitlyn.points <= 2.0);
    let self_pool = ban_history_adjustment(Some(&signals), "Caitlyn", true, config);
    assert!(
        self_pool.is_none() || self_pool.is_some_and(|adjustment| adjustment.points <= 0.0),
        "un campeón de nuestro pool no debe recibir bonus positivo por historial"
    );

    let no_results = HistorySignals {
        sample_matches: 0,
        enemy_bans: {
            let mut bans = BTreeMap::new();
            bans.insert("Caitlyn".to_string(), 3);
            bans
        },
        ..HistorySignals::default()
    };
    assert!(
        ban_history_adjustment(Some(&no_results), "Caitlyn", false, config).is_none(),
        "sin resultados conocidos no debe inventarse una señal de bans"
    );
}

#[test]
fn accepts_the_compact_history_payload_sent_by_the_ui() {
    let engine = engine();
    let state = example();
    let payload = serde_json::json!({
        "draft": state.draft,
        "roster": state.roster,
        "options": {
            "top_n": 5,
            "allow_offrole_flex": false,
            "pool_precedence": true,
            "include_next_picks": true,
            "use_history": true
        },
        "history": {
            "sample_matches": 5,
            "our_picks": {
                "Jinx": { "games": 5, "wins": 5, "losses": 0 }
            },
            "enemy_picks": {},
            "our_bans": {},
            "enemy_bans": {}
        }
    });
    let request: RecommendRequest = serde_json::from_value(payload).expect("payload de la UI");
    let response = engine.recommend(&request).expect("consulta con historial");
    let jinx = response
        .recommendations
        .iter()
        .find(|rec| rec.champion.id == "Jinx")
        .expect("Jinx en las recomendaciones");
    let history = jinx.history.as_ref().expect("evidencia de historial");
    assert!(history.points > 0.0);
    assert!(history.note.contains("5-0"));
}

#[test]
fn history_cannot_break_pool_precedence() {
    let engine = engine();
    let mut state = example();
    state.settings.top_n = 30;
    state.settings.use_history = true;
    let base = engine
        .recommend(&request(state.clone()))
        .expect("consulta base");
    let pool_champion = base
        .recommendations
        .iter()
        .find(|rec| rec.in_pool && rec.action == Phase::Pick)
        .expect("pick de pool")
        .champion
        .id
        .clone();
    let off_pool_champion = base
        .recommendations
        .iter()
        .find(|rec| !rec.in_pool && rec.action == Phase::Pick)
        .expect("pick fuera de pool")
        .champion
        .id
        .clone();

    let mut our_picks = BTreeMap::new();
    our_picks.insert(
        pool_champion.clone(),
        HistoryLine {
            games: 5,
            wins: 0,
            losses: 5,
        },
    );
    our_picks.insert(
        off_pool_champion.clone(),
        HistoryLine {
            games: 5,
            wins: 5,
            losses: 0,
        },
    );
    let mut request = request(state);
    request.options.use_history = true;
    request.history = Some(HistorySignals {
        sample_matches: 5,
        our_picks,
        ..HistorySignals::default()
    });
    let response = engine.recommend(&request).expect("consulta con historial");
    let first = response
        .recommendations
        .first()
        .expect("hay recomendaciones");
    assert!(
        first.in_pool,
        "el historial no debe romper la prioridad del pool: primera {}",
        first.champion.id
    );
    let pool_position = response
        .recommendations
        .iter()
        .position(|rec| rec.champion.id == pool_champion)
        .expect("pool presente");
    let off_pool_position = response
        .recommendations
        .iter()
        .position(|rec| rec.champion.id == off_pool_champion)
        .expect("off-pool presente");
    assert!(
        pool_position < off_pool_position,
        "el pool debe seguir por delante aunque el off-pool tenga historial perfecto"
    );
    assert!(
        response
            .recommendations
            .iter()
            .any(|rec| rec.history.is_some()),
        "la evidencia del historial debe llegar a la respuesta"
    );
}
