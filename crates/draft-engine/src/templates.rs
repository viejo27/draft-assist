use crate::model::{
    DraftState, DraftStep, DraftTemplate, ManualTurn, Phase, Player, PlayerView, Roster, Side,
};

#[derive(Debug, Clone)]
pub struct TurnContext {
    pub step_index: usize,
    pub phase: Phase,
    pub acting_side: Option<Side>,
    pub is_our_turn: bool,
    pub pick_number: Option<u8>,
    pub label: String,
    pub manual: Option<ManualTurn>,
}

impl TurnContext {
    pub fn player<'a>(&self, draft: &DraftState, roster: &'a Roster) -> Option<&'a Player> {
        if self.phase != Phase::Pick {
            return None;
        }

        if let Some(manual) = self.manual.as_ref()
            && manual.acting_side == draft.side
            && let Some(player_id) = manual.player_id.as_deref()
        {
            return roster.player(player_id);
        }

        if !self.is_our_turn {
            return None;
        }

        if let Some(player_id) = draft.current_player_id.as_deref()
            && let Some(player) = roster.player(player_id)
        {
            return Some(player);
        }

        self.pick_number
            .and_then(|number| roster.player_for_pick(number))
    }

    pub fn player_view(&self, draft: &DraftState, roster: &Roster) -> Option<PlayerView> {
        self.player(draft, roster).map(|player| PlayerView {
            id: player.id.clone(),
            name: player.name.clone(),
            role: player.role,
        })
    }
}

pub fn current_turn(draft: &DraftState, template: Option<&DraftTemplate>) -> TurnContext {
    if let Some(manual) = draft.manual.as_ref() {
        let is_our_turn = manual.acting_side == draft.side;
        let pick_number = if manual.phase == Phase::Pick && is_our_turn {
            Some((draft.our_picks.len() as u8).saturating_add(1))
        } else {
            None
        };
        return TurnContext {
            step_index: draft.step_index,
            phase: manual.phase,
            acting_side: Some(manual.acting_side),
            is_our_turn,
            pick_number,
            label: format!(
                "Turno manual: {} {}",
                match manual.phase {
                    Phase::Ban => "ban",
                    Phase::Pick => "pick",
                },
                manual.acting_side.label_es()
            ),
            manual: Some(manual.clone()),
        };
    }

    let step = template.and_then(|template| template.steps.get(draft.step_index));
    if let Some(step) = step {
        let is_our_turn = step.team.is_none_or(|team| team == draft.side);
        let label = if step.label.trim().is_empty() {
            match (step.kind, step.team, step.pick_number) {
                (Phase::Ban, Some(team), _) => format!("Ban {}", team.label_es()),
                (Phase::Ban, None, _) => "Fase de bans".into(),
                (Phase::Pick, Some(team), Some(number)) => {
                    format!("Pick {} {}", team.label_es(), number)
                }
                _ => "Turno de draft".into(),
            }
        } else {
            step.label.clone()
        };
        return TurnContext {
            step_index: draft.step_index,
            phase: step.kind,
            acting_side: step.team,
            is_our_turn,
            pick_number: step.pick_number,
            label,
            manual: None,
        };
    }

    TurnContext {
        step_index: draft.step_index,
        phase: Phase::Pick,
        acting_side: Some(draft.side),
        is_our_turn: true,
        pick_number: Some((draft.our_picks.len() as u8).saturating_add(1)),
        label: "Turno de draft".into(),
        manual: None,
    }
}

pub fn pick_steps_after<'a>(
    template: &'a DraftTemplate,
    after_index: usize,
    side: Side,
) -> impl Iterator<Item = (usize, &'a DraftStep)> + 'a {
    template
        .steps
        .iter()
        .enumerate()
        .skip(after_index.saturating_add(1))
        .filter(move |(_, step)| step.kind == Phase::Pick && step.team == Some(side))
}

pub fn is_simultaneous_ban_step(step: Option<&DraftStep>) -> bool {
    step.is_some_and(|step| step.kind == Phase::Ban && step.simultaneous)
}

pub fn ban_phase_complete(draft: &DraftState, step: Option<&DraftStep>) -> bool {
    match step {
        Some(step) if step.kind == Phase::Ban && step.simultaneous => {
            let slots = usize::from(step.ban_slots_per_team.max(1));
            draft.our_bans.len() >= slots && draft.enemy_bans.len() >= slots
        }
        _ => false,
    }
}
