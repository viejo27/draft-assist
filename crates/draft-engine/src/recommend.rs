use crate::EngineError;
use crate::data::GameData;
use crate::model::{
    AppState, ChampionRef, ChampionView, CompositionSummary, DraftState, DraftSummary,
    EnemyPickView, NextPickSuggestions, Phase, Player, PlayerView, ProfileWeights,
    RecommendOptions, RecommendRequest, Recommendation, RecommendationResponse, Role, Roster,
    TeamPick, TeamPickView, TurnInfo,
};
use crate::scoring::{
    BanEvaluationContext, PickEvaluationContext, compute_archetype, compute_needs, damage_split,
    evaluate_ban, evaluate_pick, lane_opponent, sum_traits,
};
use crate::templates::{TurnContext, current_turn, is_simultaneous_ban_step, pick_steps_after};

pub fn recommend(
    data: &GameData,
    request: &RecommendRequest,
) -> Result<RecommendationResponse, EngineError> {
    let options = &request.options;
    let template = data
        .template(&request.draft.template_id)
        .ok_or_else(|| EngineError::UnknownTemplate(request.draft.template_id.clone()))?;
    let mut warnings = Vec::new();
    validate_state(data, &request.draft, &request.roster, &mut warnings);

    let turn = current_turn(&request.draft, Some(template));
    let summary = build_summary(data, request, &turn, &mut warnings);

    if request.draft.manual.is_none() && request.draft.step_index >= template.steps.len() {
        return Ok(RecommendationResponse {
            summary,
            turn: None,
            recommendations: Vec::new(),
            next_picks: Vec::new(),
            warnings: {
                warnings.push("El draft está completo.".into());
                warnings
            },
        });
    }

    let turn_info = build_turn_info(&request.draft, &request.roster, &turn);
    let simultaneous_ban = is_simultaneous_ban_step(template.steps.get(request.draft.step_index));

    if turn.phase == Phase::Ban && simultaneous_ban {
        let slots = template.steps[request.draft.step_index]
            .ban_slots_per_team
            .max(1) as usize;
        if request.draft.our_bans.len() >= slots {
            warnings.push("Ya registraste todos tus bans. Pasa a la fase de picks.".into());
            return Ok(RecommendationResponse {
                summary,
                turn: Some(turn_info),
                recommendations: Vec::new(),
                next_picks: Vec::new(),
                warnings,
            });
        }
    }

    if !turn.is_our_turn {
        warnings.push(format!(
            "Turno del rival ({}). Registra su acción para continuar.",
            turn.acting_side.map_or("ambos", |side| side.label_es())
        ));
        return Ok(RecommendationResponse {
            summary,
            turn: Some(turn_info),
            recommendations: Vec::new(),
            next_picks: Vec::new(),
            warnings,
        });
    }

    if turn.phase == Phase::Ban {
        let recommendations = recommend_bans(data, request, options, &mut warnings);
        return Ok(RecommendationResponse {
            summary,
            turn: Some(turn_info),
            recommendations,
            next_picks: Vec::new(),
            warnings,
        });
    }

    let Some(player) = turn.player(&request.draft, &request.roster) else {
        warnings.push(
            "No se pudo determinar el jugador del pick actual. Revisa el orden de picks del equipo."
                .into(),
        );
        return Ok(RecommendationResponse {
            summary,
            turn: Some(turn_info),
            recommendations: Vec::new(),
            next_picks: Vec::new(),
            warnings,
        });
    };

    let recommendations = recommend_picks(
        data,
        request,
        player,
        turn.pick_number,
        options,
        &mut warnings,
    );

    let next_picks = if options.include_next_picks {
        side_next_picks(
            data,
            request,
            &turn,
            player,
            &recommendations,
            &mut warnings,
        )
    } else {
        Vec::new()
    };

    Ok(RecommendationResponse {
        summary,
        turn: Some(turn_info),
        recommendations,
        next_picks,
        warnings,
    })
}

fn validate_state(
    data: &GameData,
    draft: &DraftState,
    roster: &Roster,
    warnings: &mut Vec<String>,
) {
    for id in draft.all_bans().chain(draft.all_pick_ids()) {
        if data.champion(id).is_none() {
            warnings.push(format!("El campeón {id} no existe en el catálogo."));
        }
    }

    let mut seen = std::collections::HashSet::new();
    for id in draft.all_bans().chain(draft.all_pick_ids()) {
        if !seen.insert(id.as_str()) {
            warnings.push(format!(
                "El campeón {id} aparece más de una vez entre bans/picks."
            ));
        }
    }

    if roster.players.len() != 5 {
        warnings.push(format!(
            "El roster tiene {} jugadores; se esperan 5.",
            roster.players.len()
        ));
    }

    for player in &roster.players {
        for entry in &player.pool {
            if data.champion(&entry.champion_id).is_none() {
                warnings.push(format!(
                    "El pool de {} contiene un campeón desconocido: {}.",
                    player.name, entry.champion_id
                ));
            }
            if !(1..=5).contains(&entry.comfort) {
                warnings.push(format!(
                    "El comfort de {} para {} está fuera de 1-5.",
                    player.name, entry.champion_id
                ));
            }
        }
    }
}

fn build_summary(
    data: &GameData,
    request: &RecommendRequest,
    turn: &TurnContext,
    warnings: &mut Vec<String>,
) -> DraftSummary {
    let draft = &request.draft;
    let template_name = data.template(&draft.template_id).map_or_else(
        || draft.template_id.clone(),
        |template| template.name.clone(),
    );

    let our_bans = draft
        .our_bans
        .iter()
        .filter_map(|id| champion_ref(data, id))
        .collect();
    let enemy_bans = draft
        .enemy_bans
        .iter()
        .filter_map(|id| champion_ref(data, id))
        .collect();

    let our_picks = draft
        .our_picks
        .iter()
        .filter_map(|pick| {
            let player = request.roster.player(&pick.player_id);
            if player.is_none() {
                warnings.push(format!(
                    "El pick de {} referencia a un jugador desconocido: {}.",
                    pick.champion_id, pick.player_id
                ));
            }
            let champion = champion_ref(data, &pick.champion_id)?;
            Some(TeamPickView {
                player: player.map_or_else(
                    || PlayerView {
                        id: pick.player_id.clone(),
                        name: pick.player_id.clone(),
                        role: pick.role,
                    },
                    |player| PlayerView {
                        id: player.id.clone(),
                        name: player.name.clone(),
                        role: player.role,
                    },
                ),
                role: pick.role,
                champion,
            })
        })
        .collect();

    let enemy_picks = draft
        .enemy_picks
        .iter()
        .filter_map(|pick| {
            let champion = champion_ref(data, &pick.champion_id)?;
            let inferred_role = data
                .meta(&pick.champion_id)
                .map_or(Role::Top, |meta| meta.primary_role());
            Some(EnemyPickView {
                champion,
                role: pick.role,
                inferred_role,
            })
        })
        .collect();

    let our_traits = sum_traits(&draft.our_picks, data);
    let our_damage = damage_split(&draft.our_picks, data);
    let needs = needs_for(data, draft, &our_traits, &our_damage);
    let archetype = compute_archetype(&our_traits);

    let composition = CompositionSummary {
        damage_split: our_damage,
        traits: our_traits.as_map(),
        archetype,
        archetype_label: archetype.label_es().into(),
        needs,
    };

    DraftSummary {
        side: draft.side,
        side_label: draft.side.label_es().into(),
        phase: turn.phase,
        turn_label: turn.label.clone(),
        template_name,
        our_bans,
        enemy_bans,
        our_picks,
        enemy_picks,
        composition,
    }
}

fn build_turn_info(draft: &DraftState, roster: &Roster, turn: &TurnContext) -> TurnInfo {
    TurnInfo {
        step_index: turn.step_index,
        phase: turn.phase,
        acting_side: turn.acting_side,
        acting_side_label: turn
            .acting_side
            .map_or("Ambos equipos".into(), |side| side.label_es().into()),
        is_our_turn: turn.is_our_turn,
        current_player: turn.player_view(draft, roster),
        pick_number: turn.pick_number,
        label: turn.label.clone(),
        our_picks_made: draft.our_picks.len(),
        enemy_picks_made: draft.enemy_picks.len(),
        our_bans_made: draft.our_bans.len(),
        enemy_bans_made: draft.enemy_bans.len(),
    }
}

const FALLBACK_PROFILE: ProfileWeights = ProfileWeights {
    matchup: 0.15,
    synergy: 0.2,
    needs: 0.2,
    comfort: 0.2,
    meta: 0.1,
    flex: 0.15,
    risk: 0.1,
};

fn needs_for(
    data: &GameData,
    draft: &DraftState,
    our_traits: &crate::model::Traits,
    our_damage: &crate::model::DamageSplit,
) -> Vec<crate::model::NeedAssessment> {
    if draft.our_picks.len() < 2 {
        return Vec::new();
    }
    compute_needs(
        data,
        our_traits,
        our_damage,
        &draft.priorities,
        &draft.enemy_picks,
    )
}

fn profile_for(data: &GameData, pick_number: Option<u8>) -> &ProfileWeights {
    let key = match pick_number {
        Some(number) if number <= data.config.early_pick_max => "EARLY",
        Some(number) if number >= data.config.late_pick_min => "LATE",
        _ => "MID",
    };
    data.config
        .profiles
        .get(key)
        .or_else(|| data.config.profiles.get("MID"))
        .unwrap_or(&FALLBACK_PROFILE)
}

fn recommend_picks(
    data: &GameData,
    request: &RecommendRequest,
    player: &Player,
    pick_number: Option<u8>,
    options: &RecommendOptions,
    warnings: &mut Vec<String>,
) -> Vec<Recommendation> {
    let draft = &request.draft;
    let our_traits = sum_traits(&draft.our_picks, data);
    let our_damage = damage_split(&draft.our_picks, data);
    let needs = needs_for(data, draft, &our_traits, &our_damage);
    let opponent = lane_opponent(data, &draft.enemy_picks, player.role);
    let unavailable = draft.unavailable();
    let profile = profile_for(data, pick_number);

    let context = PickEvaluationContext {
        data,
        draft,
        roster: &request.roster,
        player,
        our_traits: &our_traits,
        our_damage: &our_damage,
        needs: &needs,
        our_picks: &draft.our_picks,
        enemy_picks: &draft.enemy_picks,
        unavailable: &unavailable,
        lane_opponent: opponent,
        profile,
        pick_number,
        options,
    };

    let mut scored = Vec::new();
    for champion in &data.champions {
        if unavailable.contains(champion.id.as_str()) {
            continue;
        }
        let Some(meta) = data.meta(&champion.id) else {
            continue;
        };
        let in_role = meta.roles.contains(&player.role);
        let offrole_flex = !in_role && meta.flex && options.allow_offrole_flex;
        if !in_role && !offrole_flex {
            continue;
        }

        let mut evaluation = evaluate_pick(&context, &champion.id, meta);
        if offrole_flex {
            evaluation.risks.push(format!(
                "Flex fuera de rol: {} no es su línea principal.",
                player.role.label_es()
            ));
            evaluation.reasons.push(format!(
                "Puede jugarse en {} pese a no ser su rol principal.",
                player.role.label_es()
            ));
        }
        scored.push((champion, evaluation));
    }

    scored.sort_by(|(champion_a, eval_a), (champion_b, eval_b)| {
        if options.pool_precedence && eval_a.in_pool != eval_b.in_pool {
            return eval_b.in_pool.cmp(&eval_a.in_pool);
        }
        eval_b
            .score
            .partial_cmp(&eval_a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                data.meta(&champion_b.id)
                    .map(|meta| meta.priority)
                    .unwrap_or(0)
                    .cmp(
                        &data
                            .meta(&champion_a.id)
                            .map(|meta| meta.priority)
                            .unwrap_or(0),
                    )
            })
            .then_with(|| champion_a.name.cmp(&champion_b.name))
    });

    let top_n = options.top_n.clamp(1, 20);
    if scored.is_empty() {
        warnings.push(format!(
            "No hay campeones elegibles para {} con los filtros actuales.",
            player.name
        ));
    }

    scored
        .into_iter()
        .take(top_n)
        .enumerate()
        .filter_map(|(index, (champion, evaluation))| {
            let justification = justification(&evaluation.reasons);
            Some(Recommendation {
                rank: index + 1,
                champion: champion_view(data, champion)?,
                role: player.role,
                action: Phase::Pick,
                score: round1(evaluation.score),
                tier: evaluation.tier,
                in_pool: evaluation.in_pool,
                comfort: evaluation.comfort,
                off_pool_warning: evaluation.off_pool_warning,
                justification,
                reasons: evaluation.reasons,
                risks: evaluation.risks,
                breakdown: evaluation.breakdown,
            })
        })
        .collect()
}

fn recommend_bans(
    data: &GameData,
    request: &RecommendRequest,
    options: &RecommendOptions,
    warnings: &mut Vec<String>,
) -> Vec<Recommendation> {
    let draft = &request.draft;
    let unavailable = draft.unavailable();
    let context = BanEvaluationContext {
        data,
        draft,
        roster: &request.roster,
        our_picks: &draft.our_picks,
        weights: &data.config.ban_weights,
    };

    let mut scored = Vec::new();
    for champion in &data.champions {
        if unavailable.contains(champion.id.as_str()) {
            continue;
        }
        let Some(meta) = data.meta(&champion.id) else {
            continue;
        };
        let evaluation = evaluate_ban(&context, &champion.id, meta);
        scored.push((champion, evaluation));
    }

    scored.sort_by(|(champion_a, eval_a), (champion_b, eval_b)| {
        eval_b
            .score
            .partial_cmp(&eval_a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| champion_a.name.cmp(&champion_b.name))
    });

    let top_n = options.top_n.clamp(1, 20);
    if scored.is_empty() {
        warnings.push("No hay objetivos de ban disponibles.".into());
    }

    scored
        .into_iter()
        .take(top_n)
        .enumerate()
        .filter_map(|(index, (champion, evaluation))| {
            let meta = data.meta(&champion.id)?;
            Some(Recommendation {
                rank: index + 1,
                champion: champion_view(data, champion)?,
                role: meta.primary_role(),
                action: Phase::Ban,
                score: round1(evaluation.score),
                tier: evaluation.tier,
                in_pool: evaluation.self_pool_comfort.is_some(),
                comfort: evaluation.self_pool_comfort,
                off_pool_warning: None,
                justification: justification(&evaluation.reasons),
                reasons: evaluation.reasons,
                risks: evaluation.risks,
                breakdown: evaluation.breakdown,
            })
        })
        .collect()
}

fn side_next_picks(
    data: &GameData,
    request: &RecommendRequest,
    turn: &TurnContext,
    player: &Player,
    current_recommendations: &[Recommendation],
    warnings: &mut Vec<String>,
) -> Vec<NextPickSuggestions> {
    let Some(top) = current_recommendations.first() else {
        return Vec::new();
    };
    let Some(template) = data.template(&request.draft.template_id) else {
        return Vec::new();
    };

    let mut simulated = request.draft.clone();
    simulated.our_picks.push(TeamPick {
        player_id: player.id.clone(),
        champion_id: top.champion.id.clone(),
        role: player.role,
    });

    let mut next_picks = Vec::new();
    for (step_index, step) in
        pick_steps_after(template, turn.step_index, request.draft.side).take(2)
    {
        let Some(pick_number) = step.pick_number else {
            continue;
        };
        let Some(next_player) = request.roster.player_for_pick(pick_number) else {
            warnings.push(format!(
                "No hay jugador asignado al pick {} del equipo.",
                pick_number
            ));
            continue;
        };

        let mut next_state = simulated.clone();
        next_state.step_index = step_index;
        next_state.current_player_id = Some(next_player.id.clone());
        let next_request = RecommendRequest {
            draft: next_state,
            roster: request.roster.clone(),
            options: RecommendOptions {
                top_n: 3,
                allow_offrole_flex: request.options.allow_offrole_flex,
                pool_precedence: request.options.pool_precedence,
                include_next_picks: false,
            },
        };

        match recommend(data, &next_request) {
            Ok(response) => {
                if !response.recommendations.is_empty() {
                    next_picks.push(NextPickSuggestions {
                        step_index,
                        turn_label: step.label.clone(),
                        player: Some(PlayerView {
                            id: next_player.id.clone(),
                            name: next_player.name.clone(),
                            role: next_player.role,
                        }),
                        suggestions: response.recommendations,
                    });
                }
            }
            Err(error) => warnings.push(format!(
                "No se pudieron calcular los próximos picks: {error}"
            )),
        }
    }

    next_picks
}

pub fn validate_app_state(data: &GameData, state: &AppState) -> crate::model::ValidationReport {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    let Some(template) = data.template(&state.draft.template_id) else {
        errors.push(format!(
            "La plantilla {} no existe.",
            state.draft.template_id
        ));
        return crate::model::ValidationReport {
            valid: false,
            errors,
            warnings,
        };
    };

    if state.draft.manual.is_none() && state.draft.step_index > template.steps.len() {
        errors.push(format!(
            "step_index {} está fuera de la plantilla {} ({} pasos).",
            state.draft.step_index,
            template.id,
            template.steps.len()
        ));
    }

    let mut player_ids = std::collections::HashSet::new();
    for player in &state.roster.players {
        if !player_ids.insert(player.id.as_str()) {
            errors.push(format!("Jugador duplicado: {}.", player.id));
        }
        if !state.roster.pick_order.iter().any(|id| id == &player.id) {
            warnings.push(format!(
                "{} no aparece en pick_order; se usará el orden del roster.",
                player.name
            ));
        }
    }

    if state.roster.players.len() != 5 {
        warnings.push("El roster debería tener 5 jugadores.".into());
    }

    let drafted = state.draft.unavailable();
    let mut seen = std::collections::HashSet::new();
    for id in state.draft.all_bans().chain(state.draft.all_pick_ids()) {
        if data.champion(id).is_none() {
            errors.push(format!("Campeón desconocido en el draft: {id}."));
        }
        if !seen.insert(id.as_str()) {
            errors.push(format!("Campeón duplicado en el draft: {id}."));
        }
    }
    if drafted.len() > 20 {
        errors.push("Hay más de 20 campeones baneados/pickeados.".into());
    }

    if state.draft.our_picks.len() > 5 {
        errors.push("Hay más de 5 picks aliados.".into());
    }
    if state.draft.enemy_picks.len() > 5 {
        errors.push("Hay más de 5 picks enemigos.".into());
    }
    if state.draft.our_bans.len() > 5 {
        errors.push("Hay más de 5 bans aliados.".into());
    }
    if state.draft.enemy_bans.len() > 5 {
        errors.push("Hay más de 5 bans enemigos.".into());
    }

    for pick in &state.draft.our_picks {
        if state.roster.player(&pick.player_id).is_none() {
            errors.push(format!(
                "El pick {} referencia a un jugador inexistente.",
                pick.champion_id
            ));
        }
    }

    crate::model::ValidationReport {
        valid: errors.is_empty(),
        errors,
        warnings,
    }
}

fn champion_view(data: &GameData, champion: &crate::model::Champion) -> Option<ChampionView> {
    let meta = data.meta(&champion.id)?;
    Some(ChampionView {
        id: champion.id.clone(),
        name: champion.name.clone(),
        title: champion.title.clone(),
        image: champion.image.clone(),
        roles: meta.roles.clone(),
        tags: champion.tags.clone(),
        damage: meta.damage,
        priority: meta.priority,
    })
}

fn champion_ref(data: &GameData, id: &str) -> Option<ChampionRef> {
    let champion = data.champion(id)?;
    let meta = data.meta(id)?;
    Some(ChampionRef {
        id: champion.id.clone(),
        name: champion.name.clone(),
        image: champion.image.clone(),
        roles: meta.roles.clone(),
    })
}

fn justification(reasons: &[String]) -> String {
    let parts: Vec<String> = reasons.iter().take(2).cloned().collect();
    if parts.is_empty() {
        "Se ajusta al rol y a los filtros actuales del draft.".into()
    } else {
        parts.join(" ")
    }
}

fn round1(value: f32) -> f32 {
    (value * 10.0).round() / 10.0
}
