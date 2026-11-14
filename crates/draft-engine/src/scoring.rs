use crate::data::GameData;
use crate::model::{
    Archetype, BanWeights, ChampionMeta, DamageSplit, DamageType, DraftState, EnemyPick,
    NeedAssessment, Player, ProfileWeights, RecommendOptions, Role, Roster, ScoreBreakdown,
    TeamNeed, TeamPick, Traits,
};
use std::collections::HashSet;

pub struct PickEvaluationContext<'a> {
    pub data: &'a GameData,
    pub draft: &'a DraftState,
    pub roster: &'a Roster,
    pub player: &'a Player,
    pub our_traits: &'a Traits,
    pub our_damage: &'a DamageSplit,
    pub needs: &'a [NeedAssessment],
    pub our_picks: &'a [TeamPick],
    pub enemy_picks: &'a [EnemyPick],
    pub unavailable: &'a HashSet<&'a str>,
    pub lane_opponent: Option<&'a EnemyPick>,
    pub profile: &'a ProfileWeights,
    pub pick_number: Option<u8>,
    pub options: &'a RecommendOptions,
}

#[derive(Debug, Clone, Default)]
pub struct CandidateScore {
    pub breakdown: ScoreBreakdown,
    pub score: f32,
    pub tier: String,
    pub in_pool: bool,
    pub comfort: Option<u8>,
    pub reasons: Vec<String>,
    pub risks: Vec<String>,
    pub off_pool_warning: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub struct MatchupAssessment {
    pub value: f32,
    pub score: f32,
    pub severity: u8,
    pub has_data: bool,
}

pub fn damage_split(picks: &[TeamPick], data: &GameData) -> DamageSplit {
    let mut physical = 0.0_f32;
    let mut magic = 0.0_f32;
    let mut mixed = 0.0_f32;

    for pick in picks {
        let Some(meta) = data.meta(&pick.champion_id) else {
            continue;
        };
        match meta.damage {
            DamageType::Physical => physical += 1.0,
            DamageType::Magic => magic += 1.0,
            DamageType::Mixed => {
                physical += 0.5;
                magic += 0.5;
                mixed += 1.0;
            }
        }
    }

    let total = physical + magic;
    if total <= f32::EPSILON {
        return DamageSplit {
            physical: 0.0,
            magic: 0.0,
            mixed: 0.0,
        };
    }

    DamageSplit {
        physical: physical / total,
        magic: magic / total,
        mixed: (mixed / picks.len() as f32).clamp(0.0, 1.0),
    }
}

pub fn sum_traits(picks: &[TeamPick], data: &GameData) -> Traits {
    let mut totals = Traits::default();
    for pick in picks {
        if let Some(meta) = data.meta(&pick.champion_id) {
            totals.add(&meta.traits);
        }
    }
    totals
}

pub fn enemy_tank_count(enemy_picks: &[EnemyPick], data: &GameData) -> usize {
    enemy_picks
        .iter()
        .filter(|pick| {
            data.meta(&pick.champion_id)
                .is_some_and(|meta| meta.traits.frontline >= 4.0)
        })
        .count()
}

pub fn compute_needs(
    data: &GameData,
    our_traits: &Traits,
    our_damage: &DamageSplit,
    priorities: &[TeamNeed],
    enemy_picks: &[EnemyPick],
) -> Vec<NeedAssessment> {
    let thresholds = &data.config.needs;
    let mut needs = Vec::new();

    let mut add = |id: TeamNeed, severity: f32| {
        let severity = severity.clamp(0.0, 1.0);
        if severity > 0.05 {
            needs.push(NeedAssessment {
                id,
                label: id.label_es().into(),
                severity,
            });
        }
    };

    let frontline = our_traits.frontline;
    add(
        TeamNeed::Frontline,
        (thresholds.frontline_min - frontline) / thresholds.frontline_min,
    );
    add(
        TeamNeed::Engage,
        (thresholds.engage_min - our_traits.engage) / thresholds.engage_min,
    );
    add(
        TeamNeed::Cc,
        (thresholds.cc_min - our_traits.cc) / thresholds.cc_min,
    );
    add(
        TeamNeed::Peel,
        (thresholds.peel_min - our_traits.peel) / thresholds.peel_min,
    );
    add(
        TeamNeed::Waveclear,
        (thresholds.waveclear_min - our_traits.waveclear) / thresholds.waveclear_min,
    );
    add(
        TeamNeed::ApDamage,
        (thresholds.ap_min_share - our_damage.magic) / thresholds.ap_min_share,
    );
    add(
        TeamNeed::AdDamage,
        (thresholds.ad_min_share - our_damage.physical) / thresholds.ad_min_share,
    );

    let tanks = enemy_tank_count(enemy_picks, data);
    if tanks >= 2 {
        let severity = ((thresholds.anti_tank_min - our_traits.anti_tank)
            / thresholds.anti_tank_min)
            .max(0.15 * tanks as f32);
        add(TeamNeed::AntiTank, severity);
    }

    for priority in priorities {
        if let Some(existing) = needs.iter_mut().find(|need| need.id == *priority) {
            existing.severity = existing.severity.max(0.55);
        } else {
            needs.push(NeedAssessment {
                id: *priority,
                label: priority.label_es().into(),
                severity: 0.55,
            });
        }
    }

    needs.sort_by(|a, b| {
        b.severity
            .partial_cmp(&a.severity)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    needs
}

pub fn compute_archetype(traits: &Traits) -> Archetype {
    if traits.engage >= 6.0 && traits.aoe >= 5.0 {
        Archetype::Engage
    } else if traits.frontline >= 6.0 && traits.carry >= 6.0 {
        Archetype::FrontToBack
    } else if traits.poke >= 6.0 && traits.engage < 4.0 {
        Archetype::Poke
    } else if traits.splitpush >= 5.0 && traits.frontline < 4.0 {
        Archetype::Splitpush
    } else if traits.cc >= 6.0 && traits.mobility >= 6.0 {
        Archetype::Pick
    } else {
        Archetype::Balanced
    }
}

pub fn matchup_for(data: &GameData, candidate: &str, opponent: &str) -> Option<MatchupAssessment> {
    data.matchup_value(candidate, opponent)
        .map(|(value, severity, _)| {
            let score = (0.5 + value * 0.5).clamp(0.0, 1.0);
            MatchupAssessment {
                value,
                score,
                severity,
                has_data: true,
            }
        })
}

pub fn lane_opponent<'a>(
    data: &GameData,
    enemy_picks: &'a [EnemyPick],
    role: Role,
) -> Option<&'a EnemyPick> {
    enemy_picks
        .iter()
        .find(|pick| pick.role == Some(role))
        .or_else(|| {
            enemy_picks.iter().find(|pick| {
                data.meta(&pick.champion_id)
                    .is_some_and(|meta| meta.primary_role() == role)
            })
        })
}

fn pool_entry<'a>(player: &'a Player, champion_id: &str) -> Option<&'a crate::model::PoolEntry> {
    player
        .pool
        .iter()
        .find(|entry| entry.champion_id == champion_id)
}

fn comfort_score(entry: Option<&crate::model::PoolEntry>) -> f32 {
    let Some(entry) = entry else {
        return 0.1;
    };
    let base = 0.2 + 0.8 * (f32::from(entry.comfort.clamp(1, 5)) - 1.0) / 4.0;
    match entry.winrate {
        Some(winrate) => {
            let winrate_norm = ((winrate - 40.0) / 20.0).clamp(0.0, 1.0);
            0.8 * base + 0.2 * winrate_norm
        }
        None => base,
    }
}

fn needs_score(ctx: &PickEvaluationContext<'_>, meta: &ChampionMeta) -> f32 {
    if ctx.needs.is_empty() {
        return 0.5;
    }
    let mut weighted = 0.0;
    let mut total = 0.0;
    for need in ctx.needs {
        let fit = match need.id {
            TeamNeed::ApDamage => match meta.damage {
                DamageType::Magic => 1.0,
                DamageType::Mixed => 0.6,
                DamageType::Physical => 0.1,
            },
            TeamNeed::AdDamage => match meta.damage {
                DamageType::Physical => 1.0,
                DamageType::Mixed => 0.6,
                DamageType::Magic => 0.1,
            },
            other => (meta.traits.get(other) / 5.0).clamp(0.0, 1.0),
        };
        weighted += need.severity * fit;
        total += need.severity;
    }
    if total <= f32::EPSILON {
        0.5
    } else {
        (weighted / total).clamp(0.0, 1.0)
    }
}

fn curated_synergy(ctx: &PickEvaluationContext<'_>, candidate_id: &str) -> Option<(f32, String)> {
    let mut best: Option<(f32, String)> = None;
    for ally in ctx.our_picks {
        let Some((value, note)) = ctx.data.synergy_value(candidate_id, &ally.champion_id) else {
            continue;
        };
        let ally_name = ctx
            .data
            .champion(&ally.champion_id)
            .map_or(ally.champion_id.as_str(), |champion| champion.name.as_str());
        let text = if note.is_empty() {
            format!("Sinergia con {ally_name}.")
        } else {
            format!("Sinergia con {ally_name}: {note}")
        };
        if best
            .as_ref()
            .is_none_or(|(best_value, _)| value > *best_value)
        {
            best = Some((value, text));
        }
    }
    best
}

fn structural_synergy(ctx: &PickEvaluationContext<'_>, meta: &ChampionMeta) -> f32 {
    if ctx.our_picks.is_empty() {
        return 0.5;
    }

    let ally = ctx.our_traits;
    let mut score = 0.5_f32;

    if meta.traits.frontline >= 3.0 && ally.carry >= 6.0 {
        score = score.max(0.85);
    }
    if meta.traits.engage >= 3.0 && ally.aoe >= 4.0 {
        score = score.max(0.85);
    }
    if ally.engage >= 3.0 && meta.traits.aoe >= 3.0 {
        score = score.max(0.85);
    }
    if (meta.traits.peel >= 2.0 || meta.traits.shield >= 2.0)
        && ally.carry >= 5.0
        && ally.mobility <= 3.0
    {
        score = score.max(0.8);
    }
    if meta.damage == DamageType::Magic && ctx.our_damage.physical >= 0.6 {
        score = score.max(0.78);
    }
    if meta.damage == DamageType::Physical && ctx.our_damage.magic >= 0.6 {
        score = score.max(0.78);
    }
    if meta.traits.splitpush >= 4.0 && ally.splitpush >= 4.0 {
        score = score.max(0.62);
    }
    if meta.traits.frontline <= 1.0 && ally.frontline < 4.0 {
        score = score.min(0.25);
    }
    if meta.damage == DamageType::Physical && ctx.our_damage.physical >= 0.75 {
        score = score.min(0.4);
    }
    if meta.damage == DamageType::Magic && ctx.our_damage.magic >= 0.75 {
        score = score.min(0.4);
    }

    score.clamp(0.0, 1.0)
}

fn counter_risk(ctx: &PickEvaluationContext<'_>, candidate_id: &str) -> (f32, Vec<String>) {
    let mut risk = 0.0_f32;
    let mut names = Vec::new();

    for enemy in ctx.enemy_picks {
        if let Some((value, severity, _)) = ctx.data.matchup_value(candidate_id, &enemy.champion_id)
            && value < -0.05
        {
            let relevance = if enemy.role == Some(ctx.player.role) {
                1.0
            } else {
                0.65
            };
            let severity_factor = 0.7 + 0.1 * f32::from(severity);
            let contribution = (-value).clamp(0.0, 1.0) * relevance * severity_factor;
            if contribution > risk {
                risk = contribution;
                if let Some(enemy_champion) = ctx.data.champion(&enemy.champion_id) {
                    names.clear();
                    names.push(enemy_champion.name.clone());
                }
            }
        }
    }

    // Si el rival de línea ya está confirmado, los counters de la misma línea
    // que siguen libres ya no pueden entrar a esa lane. Pesar menos ese riesgo.
    let counter_weight = if ctx.lane_opponent.is_some() {
        0.015
    } else {
        0.06
    };
    let mut available_counters = 0_u8;
    for matchup in &ctx.data.matchups {
        if matchup.opponent == candidate_id && matchup.value > 0.15 {
            if ctx.unavailable.contains(matchup.champion.as_str()) {
                continue;
            }
            available_counters = available_counters.saturating_add(1);
            if names.len() < 3
                && let Some(counter) = ctx.data.champion(&matchup.champion)
            {
                names.push(counter.name.clone());
            }
        }
    }

    risk += (f32::from(available_counters) * counter_weight).min(0.35);
    (risk.clamp(0.0, 1.0), names)
}

fn flex_score(meta: &ChampionMeta, risk: f32) -> f32 {
    let role_count = meta.roles.len().min(3);
    let role_norm = if role_count <= 1 {
        0.0
    } else {
        (role_count as f32 - 1.0) / 2.0
    };
    let blind = 1.0 - risk;
    (0.4 * role_norm + 0.4 * blind + 0.2 * (f32::from(meta.priority) / 5.0)).clamp(0.0, 1.0)
}

fn tier_for(score: f32, data: &GameData) -> String {
    if score >= data.config.tiers.s {
        "S".into()
    } else if score >= data.config.tiers.a {
        "A".into()
    } else if score >= data.config.tiers.b {
        "B".into()
    } else if score >= data.config.tiers.c {
        "C".into()
    } else {
        "D".into()
    }
}

fn needs_reason(ctx: &PickEvaluationContext<'_>, meta: &ChampionMeta) -> Option<String> {
    let need = ctx
        .needs
        .iter()
        .filter(|need| need.severity >= 0.25)
        .find(|need| match need.id {
            TeamNeed::ApDamage => matches!(meta.damage, DamageType::Magic | DamageType::Mixed),
            TeamNeed::AdDamage => {
                matches!(meta.damage, DamageType::Physical | DamageType::Mixed)
            }
            other => meta.traits.get(other) >= 3.0,
        })?;
    Some(format!("Cubre la carencia: {}.", need.label))
}

pub fn evaluate_pick(
    ctx: &PickEvaluationContext<'_>,
    champion_id: &str,
    meta: &ChampionMeta,
) -> CandidateScore {
    let entry = pool_entry(ctx.player, champion_id);
    let in_pool = entry.is_some();
    let comfort = entry.map(|entry| entry.comfort.clamp(1, 5));
    let comfort_component = comfort_score(entry);
    let matchup = ctx
        .lane_opponent
        .and_then(|opponent| matchup_for(ctx.data, champion_id, &opponent.champion_id));
    let matchup_component = matchup.map_or(0.5, |assessment| assessment.score);
    let (risk, counter_names) = counter_risk(ctx, champion_id);
    let curated = curated_synergy(ctx, champion_id);
    let structural = structural_synergy(ctx, meta);
    let synergy_component = curated.as_ref().map_or(structural, |(value, _)| {
        (0.6 * value + 0.4 * structural).clamp(0.0, 1.0)
    });
    let needs_component = needs_score(ctx, meta);
    let meta_component = f32::from(meta.priority) / 5.0;
    let flex_component = flex_score(meta, risk);

    let weights = ctx.profile;
    let positive_sum = weights.matchup
        + weights.synergy
        + weights.needs
        + weights.comfort
        + weights.meta
        + weights.flex;
    let positive_sum = if positive_sum.abs() < f32::EPSILON {
        1.0
    } else {
        positive_sum
    };

    let mut score = 100.0
        * ((weights.matchup * matchup_component
            + weights.synergy * synergy_component
            + weights.needs * needs_component
            + weights.comfort * comfort_component
            + weights.meta * meta_component
            + weights.flex * flex_component)
            / positive_sum
            - weights.risk * risk);

    let before_pool_penalty = score;
    if !in_pool {
        score = score * ctx.data.config.off_pool_multiplier - ctx.data.config.off_pool_penalty;
    }
    score = score.clamp(0.0, 100.0);
    let pool_penalty = if in_pool {
        0.0
    } else {
        (before_pool_penalty - score).max(0.0)
    };

    let mut reasons = Vec::new();
    let mut risks = Vec::new();

    if let Some(entry) = entry {
        let mut text = format!(
            "Comfort {}/5 en el pool de {}.",
            entry.comfort.clamp(1, 5),
            ctx.player.name
        );
        if let Some(winrate) = entry.winrate {
            text.push_str(&format!(" Winrate personal: {winrate:.0}%."));
        }
        reasons.push(text);
    } else {
        let warning = format!(
            "Fuera del pool de {}; requeriría práctica.",
            ctx.player.name
        );
        risks.push(warning.clone());
    }

    if let Some(opponent) = ctx.lane_opponent {
        let opponent_name = ctx
            .data
            .champion(&opponent.champion_id)
            .map_or(opponent.champion_id.as_str(), |champion| {
                champion.name.as_str()
            });
        match matchup {
            Some(assessment) if assessment.value > 0.15 => {
                let note = ctx
                    .data
                    .matchup_value(champion_id, &opponent.champion_id)
                    .map_or("", |(_, _, note)| note);
                if note.is_empty() {
                    reasons.push(format!("Ventaja de matchup contra {opponent_name}."));
                } else {
                    reasons.push(format!("Ventaja contra {opponent_name}: {note}"));
                }
            }
            Some(assessment) if assessment.value < -0.15 => {
                let note = ctx
                    .data
                    .matchup_value(champion_id, &opponent.champion_id)
                    .map_or("", |(_, _, note)| note);
                if note.is_empty() {
                    risks.push(format!("Matchup complicado contra {opponent_name}."));
                } else {
                    risks.push(format!("Matchup complicado contra {opponent_name}: {note}"));
                }
            }
            Some(_) => {}
            None => {
                risks.push(format!("Sin datos de matchup contra {opponent_name}."));
            }
        }
    }

    if let Some((_, text)) = &curated {
        reasons.push(text.clone());
    } else if structural >= 0.75 {
        if meta.traits.frontline >= 3.0 && ctx.our_traits.carry >= 6.0 {
            reasons.push("Aporta frontline para el carry aliado.".into());
        } else if (meta.traits.engage >= 3.0 && ctx.our_traits.aoe >= 4.0)
            || (ctx.our_traits.engage >= 3.0 && meta.traits.aoe >= 3.0)
        {
            reasons.push("Aporta engage o follow-up para el wombo aliado.".into());
        } else if meta.traits.peel >= 2.0 || meta.traits.shield >= 2.0 {
            reasons.push("Añade peel y protección para el carry.".into());
        } else if (meta.damage == DamageType::Magic && ctx.our_damage.physical >= 0.6)
            || (meta.damage == DamageType::Physical && ctx.our_damage.magic >= 0.6)
        {
            reasons.push("Equilibra el reparto de daño AD/AP.".into());
        }
    }

    if let Some(reason) = needs_reason(ctx, meta) {
        reasons.push(reason);
    }

    if let Some(pick_number) = ctx.pick_number {
        if pick_number <= ctx.data.config.early_pick_max {
            if meta.flex || meta.roles.len() > 1 {
                reasons.push("Pick temprano: flexible y difícil de counterear.".into());
            } else if meta.priority >= 4 {
                reasons.push("Pick temprano: prioridad alta del parche.".into());
            }
        } else if pick_number >= ctx.data.config.late_pick_min {
            reasons.push("Pick tardío: buen momento para castigar el matchup.".into());
        }
    }

    if risk >= 0.45 && !counter_names.is_empty() {
        risks.push(format!(
            "Riesgo: {} sigue(n) disponible(s) como counter.",
            counter_names.join(", ")
        ));
    }

    if !in_pool {
        reasons.push(format!(
            "Alternativa meta fuera del pool de {}.",
            ctx.player.name
        ));
    }

    let off_pool_warning = (!in_pool).then(|| {
        format!(
            "Fuera del pool de {}; úsalo solo si el equipo asume el costo de práctica.",
            ctx.player.name
        )
    });

    reasons.truncate(4);
    risks.truncate(4);

    CandidateScore {
        breakdown: ScoreBreakdown {
            matchup: matchup_component,
            synergy: synergy_component,
            needs: needs_component,
            comfort: comfort_component,
            meta: meta_component,
            flex: flex_component,
            counter_risk: risk,
            pool_penalty,
            ..ScoreBreakdown::default()
        },
        score,
        tier: tier_for(score, ctx.data),
        in_pool,
        comfort,
        reasons,
        risks,
        off_pool_warning,
    }
}

pub struct BanEvaluationContext<'a> {
    pub data: &'a GameData,
    pub draft: &'a DraftState,
    pub roster: &'a Roster,
    pub our_picks: &'a [TeamPick],
    pub weights: &'a BanWeights,
}

#[derive(Debug, Clone)]
pub struct BanCandidateScore {
    pub breakdown: ScoreBreakdown,
    pub score: f32,
    pub tier: String,
    pub self_pool_comfort: Option<u8>,
    pub reasons: Vec<String>,
    pub risks: Vec<String>,
}

pub fn evaluate_ban(
    ctx: &BanEvaluationContext<'_>,
    champion_id: &str,
    meta: &ChampionMeta,
) -> BanCandidateScore {
    let meta_component = f32::from(meta.priority) / 5.0;
    let mut threat = 0.0_f32;
    let mut threat_reasons = Vec::new();

    for pick in ctx.our_picks {
        if let Some((value, _, _)) = ctx.data.matchup_value(champion_id, &pick.champion_id)
            && value > 0.1
        {
            let name = ctx
                .data
                .champion(&pick.champion_id)
                .map_or(pick.champion_id.as_str(), |champion| champion.name.as_str());
            threat = threat.max(value.clamp(0.0, 1.0));
            threat_reasons.push(format!("Counterea a {name}."));
        }
    }

    for player in &ctx.roster.players {
        for entry in &player.pool {
            if let Some((value, _, _)) = ctx.data.matchup_value(champion_id, &entry.champion_id)
                && value > 0.1
            {
                let weight = f32::from(entry.comfort.clamp(1, 5)) / 5.0;
                threat = threat.max((value * weight).clamp(0.0, 1.0));
            }
        }
    }

    let role_count = meta.roles.len().min(3);
    let flex = if role_count <= 1 {
        0.2
    } else {
        (0.4 + 0.2 * (role_count as f32 - 1.0)).min(1.0)
    };
    let denial = 0.5_f32;
    let contested = meta_component;

    let mut self_pool_comfort: Option<u8> = None;
    let mut self_ban_reason = None;
    for player in &ctx.roster.players {
        if let Some(entry) = player
            .pool
            .iter()
            .find(|entry| entry.champion_id == champion_id)
        {
            let comfort = entry.comfort.clamp(1, 5);
            if self_pool_comfort.is_none_or(|current| comfort > current) {
                self_pool_comfort = Some(comfort);
                if comfort >= 4 {
                    self_ban_reason = Some(format!(
                        "Está en el pool de {} ({comfort}/5): evita el autoban.",
                        player.name
                    ));
                }
            }
        }
    }
    let self_ban = self_pool_comfort
        .map(|comfort| (f32::from(comfort) - 1.0) / 4.0)
        .unwrap_or(0.0);

    let weights = ctx.weights;
    let score = (100.0
        * (weights.meta * meta_component
            + weights.threat * threat
            + weights.flex * flex
            + weights.denial * denial
            + weights.contested * contested
            - weights.self_ban * self_ban))
        .clamp(0.0, 100.0);

    let mut reasons = Vec::new();
    if meta.priority >= 4 {
        reasons.push(format!("Prioridad meta {}/5 del parche.", meta.priority));
    }
    reasons.extend(threat_reasons.into_iter().take(2));
    if role_count > 1 {
        let roles = meta
            .roles
            .iter()
            .map(|role| role.label_es())
            .collect::<Vec<_>>()
            .join(" / ");
        reasons.push(format!("Flexible ({roles}); difícil de responder."));
    }

    let mut risks = Vec::new();
    if let Some(reason) = self_ban_reason {
        risks.push(reason);
        reasons.push("No lo banearía salvo que el rival lo amenace.".into());
    }

    BanCandidateScore {
        breakdown: ScoreBreakdown {
            meta: meta_component,
            flex,
            threat,
            denial,
            self_ban,
            ..ScoreBreakdown::default()
        },
        score,
        tier: tier_for(score, ctx.data),
        self_pool_comfort,
        reasons,
        risks,
    }
}
