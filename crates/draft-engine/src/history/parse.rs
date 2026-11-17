use super::model::{
    BanStarter, BlockKind, BlockReport, Confidence, HistoryPick, LegacyImport, MatchQueue,
    MatchRecord, MatchResult, MatchSource, RivalPlayer, UnknownToken,
};
use super::normalize::{
    ChampionResolver, SectionKind, SideLabel, collapse_ws, is_note_line, is_separator, parse_name,
    role_from_header, section_header,
};
use crate::data::GameData;
use crate::model::{ChampionId, Role, Side};
use std::collections::HashMap;

#[derive(Debug, Clone)]
struct RawBlock {
    index: usize,
    line_start: usize,
    lines: Vec<String>,
}

#[derive(Debug, Clone)]
struct ParsedSection {
    kind: SectionKind,
    label: SideLabel,
    items: Vec<ChampionId>,
}

struct BlockParser<'a> {
    resolver: &'a ChampionResolver,
    sections: Vec<ParsedSection>,
    rivals: Vec<RivalPlayer>,
    notes: Vec<String>,
    warnings: Vec<String>,
    result: MatchResult,
    result_note: Option<String>,
    first_ban_section: Option<SideLabel>,
    first_pick_section: Option<SideLabel>,
    missing_names: usize,
    fill_players: usize,
    broken: bool,
    current_role: Option<Role>,
    current_role_label: Option<String>,
    current_rival: Option<RivalPlayer>,
    current_pool_raw: Vec<String>,
    expecting_name: bool,
    current_section: Option<usize>,
    pick_turn: u8,
    last_was_pick_item: bool,
    unknown: Vec<(String, String)>,
}

impl<'a> BlockParser<'a> {
    fn new(resolver: &'a ChampionResolver) -> Self {
        Self {
            resolver,
            sections: Vec::new(),
            rivals: Vec::new(),
            notes: Vec::new(),
            warnings: Vec::new(),
            result: MatchResult::Unknown,
            result_note: None,
            first_ban_section: None,
            first_pick_section: None,
            missing_names: 0,
            fill_players: 0,
            broken: false,
            current_role: None,
            current_role_label: None,
            current_rival: None,
            current_pool_raw: Vec::new(),
            expecting_name: false,
            current_section: None,
            pick_turn: 0,
            last_was_pick_item: false,
            unknown: Vec::new(),
        }
    }

    fn parse(mut self, block: &RawBlock) -> ParsedBlock {
        for (index, line) in block.lines.iter().enumerate() {
            let next_line = block.lines[index + 1..]
                .iter()
                .find(|candidate| !candidate.trim().is_empty())
                .map(|candidate| candidate.trim());
            self.parse_line(block.index, line, next_line);
        }
        self.finish_rival();
        self.finalize(block)
    }

    fn parse_line(&mut self, block_index: usize, raw_line: &str, next_line: Option<&str>) {
        let line = raw_line.trim();
        if line.is_empty() {
            if self
                .current_section
                .is_some_and(|index| self.sections[index].kind == SectionKind::Pick)
                && self.last_was_pick_item
            {
                self.pick_turn = self.pick_turn.saturating_add(1);
                self.last_was_pick_item = false;
            }
            return;
        }

        if let Some((role, role_label)) = role_from_header(line) {
            self.finish_rival();
            self.current_role = role;
            self.current_role_label = role_label;
            self.current_section = None;
            self.expecting_name = true;
            self.pick_turn = 0;
            self.last_was_pick_item = false;
            return;
        }

        if let Some((kind, side, remainder)) = section_header(line) {
            self.finish_rival();
            self.current_role = None;
            self.current_role_label = None;
            self.expecting_name = false;
            self.current_section = Some(self.sections.len());
            self.sections.push(ParsedSection {
                kind,
                label: side,
                items: Vec::new(),
            });
            self.pick_turn = 0;
            self.last_was_pick_item = false;

            if side != SideLabel::Unknown {
                match kind {
                    SectionKind::Ban if self.first_ban_section.is_none() => {
                        self.first_ban_section = Some(side);
                    }
                    SectionKind::Pick if self.first_pick_section.is_none() => {
                        self.first_pick_section = Some(side);
                    }
                    _ => {}
                }
            }

            if !remainder.is_empty() {
                let resolved = self.resolver.resolve_line(&remainder);
                if !resolved.champions.is_empty() {
                    self.add_section_items(&resolved.champions);
                }
                if !resolved.unknown.is_empty() {
                    self.record_unknown(block_index, &resolved.unknown, line);
                }
            }
            return;
        }

        if let Some((result, note)) = parse_result(line) {
            self.finish_rival();
            self.result = result;
            self.result_note = note;
            self.current_section = None;
            self.last_was_pick_item = false;
            if line.to_ascii_lowercase().contains("rompi") {
                self.broken = true;
            }
            return;
        }

        if let Some(index) = self.current_section {
            let kind = self.sections[index].kind;
            if is_note_line(line) {
                self.notes.push(line.to_string());
                self.last_was_pick_item = false;
                return;
            }
            let resolved = self.resolver.resolve_line(line);
            if resolved.champions.is_empty() {
                self.notes.push(line.to_string());
                if !resolved.unknown.is_empty() {
                    self.record_unknown(block_index, &resolved.unknown, line);
                }
                self.last_was_pick_item = false;
                return;
            }
            self.add_section_items(&resolved.champions);
            if !resolved.unknown.is_empty() {
                self.record_unknown(block_index, &resolved.unknown, line);
                if kind == SectionKind::Pick {
                    self.notes.push(line.to_string());
                }
            }
            self.last_was_pick_item = true;
            return;
        }

        if self.current_role.is_none() && self.current_role_label.is_none() {
            self.notes.push(line.to_string());
            return;
        }

        if self.expecting_name {
            self.accept_name_or_missing_name(block_index, line);
            return;
        }

        if self.current_rival.is_none() {
            self.expecting_name = true;
            self.accept_name_or_missing_name(block_index, line);
            return;
        }

        if is_note_line(line) {
            self.push_rival_note(line);
            return;
        }

        let resolved = self.resolver.resolve_line(line);
        let has_separator = line.contains('/') || line.contains('|');
        let word_count = line.split_whitespace().count();
        let next_is_pool = next_line
            .map(|next| {
                next.starts_with('/')
                    || next.starts_with('|')
                    || self.resolver.resolve_line(next).champions.len() >= 2
            })
            .unwrap_or(false);
        if resolved.champions.is_empty() && !has_separator && word_count >= 3 && !next_is_pool {
            self.push_rival_note(line);
            return;
        }
        let looks_like_second_name =
            !has_separator && resolved.champions.is_empty() && (word_count <= 2 || next_is_pool);
        if looks_like_second_name {
            self.finish_rival();
            self.expecting_name = true;
            self.accept_name_or_missing_name(block_index, line);
            return;
        }

        self.parse_pool_line(block_index, line, &resolved);
    }

    fn accept_name_or_missing_name(&mut self, block_index: usize, line: &str) {
        let resolved = self.resolver.resolve_line(line);
        let compact_words = line.split_whitespace().count();
        if resolved.champions.is_empty() && line.matches(',').count() >= 2 {
            self.missing_names += 1;
            self.current_rival = Some(RivalPlayer {
                name: "Sin nombre".into(),
                raw_name: String::new(),
                role: self.current_role,
                role_label: self.current_role_label.clone(),
                pool_groups: Vec::new(),
                pool_raw: String::new(),
                rank: None,
                notes: Vec::new(),
            });
            self.push_rival_note(line);
            self.expecting_name = false;
            return;
        }
        let missing_name = compact_words > 4 || resolved.champions.len() >= 2;
        if missing_name && !resolved.champions.is_empty() {
            self.missing_names += 1;
            self.warnings
                .push("Rol sin nombre: se usó la primera línea como pool.".into());
            self.current_rival = Some(RivalPlayer {
                name: "Sin nombre".into(),
                raw_name: String::new(),
                role: self.current_role,
                role_label: self.current_role_label.clone(),
                pool_groups: Vec::new(),
                pool_raw: String::new(),
                rank: None,
                notes: Vec::new(),
            });
            if self.current_role_label.is_some() {
                self.fill_players += 1;
            }
            self.expecting_name = false;
            self.parse_pool_line(block_index, line, &resolved);
            return;
        }

        let (name, raw_name, rank, mut name_warnings) = parse_name(line, self.resolver);
        self.warnings.append(&mut name_warnings);
        self.current_rival = Some(RivalPlayer {
            name,
            raw_name,
            role: self.current_role,
            role_label: self.current_role_label.clone(),
            pool_groups: Vec::new(),
            pool_raw: String::new(),
            rank,
            notes: Vec::new(),
        });
        if self.current_role_label.is_some() {
            self.fill_players += 1;
        }
        self.current_pool_raw.clear();
        self.expecting_name = false;
    }

    fn parse_pool_line(
        &mut self,
        block_index: usize,
        line: &str,
        resolved: &super::normalize::LineMatch,
    ) {
        let resolver = self.resolver;
        let mut unknown: Vec<(String, String)> = Vec::new();
        let mut pool_line = line.to_string();
        let mut leading_note = None;

        if let Some((first, rest)) = line.split_once(',') {
            let first_match = resolver.resolve_line(first);
            let rest_match = resolver.resolve_line(rest);
            if first_match.champions.is_empty() && !rest_match.champions.is_empty() {
                leading_note = Some(first.trim().to_string());
                pool_line = rest.trim().to_string();
            }
        }

        {
            let Some(rival) = self.current_rival.as_mut() else {
                return;
            };
            rival.pool_raw = collapse_ws(line);
            self.current_pool_raw.push(collapse_ws(line));
            if let Some(note) = leading_note {
                rival.notes.push(note);
            }

            let groups: Vec<&str> = pool_line
                .split(['/', '|'])
                .map(str::trim)
                .filter(|group| !group.is_empty())
                .collect();

            if groups.is_empty() {
                if !resolved.champions.is_empty() {
                    rival.pool_groups.push(resolved.champions.clone());
                }
            } else {
                for group in groups {
                    if is_note_line(group) {
                        rival.notes.push(group.to_string());
                        continue;
                    }
                    let match_for_group = resolver.resolve_line(group);
                    if !match_for_group.champions.is_empty() {
                        rival.pool_groups.push(match_for_group.champions);
                    }
                    for token in match_for_group.unknown {
                        unknown.push((token, group.to_string()));
                    }
                }
            }

            for token in &resolved.unknown {
                unknown.push((token.clone(), line.to_string()));
            }
        }

        for (token, context) in unknown {
            self.record_unknown(block_index, &[token], &context);
        }
    }

    fn add_section_items(&mut self, champions: &[ChampionId]) {
        let Some(index) = self.current_section else {
            return;
        };
        self.sections[index].items.extend_from_slice(champions);
    }

    fn push_rival_note(&mut self, line: &str) {
        if let Some(rival) = self.current_rival.as_mut() {
            rival.notes.push(line.to_string());
        } else {
            self.notes.push(line.to_string());
        }
    }

    fn finish_rival(&mut self) {
        let Some(mut rival) = self.current_rival.take() else {
            return;
        };
        if !self.current_pool_raw.is_empty() {
            rival.pool_raw = self.current_pool_raw.join(" | ");
        }
        let has_data = !rival.name.is_empty() || !rival.pool_groups.is_empty();
        if !has_data {
            return;
        }
        if rival.name.is_empty() {
            rival.name = "Sin nombre".into();
            self.missing_names += 1;
        }
        self.rivals.push(rival);
        self.current_pool_raw.clear();
    }

    fn record_unknown(&mut self, block_index: usize, tokens: &[String], context: &str) {
        for token in tokens {
            if token.len() <= 1 || token.chars().all(|character| character.is_ascii_digit()) {
                continue;
            }
            if is_noise_token(&token.to_ascii_lowercase()) {
                continue;
            }
            self.unknown
                .push((token.clone(), format!("bloque {block_index}: {context}")));
        }
    }

    fn finalize(mut self, _block: &RawBlock) -> ParsedBlock {
        let mut warnings = std::mem::take(&mut self.warnings);
        let mut our_picks = Vec::new();
        let mut enemy_picks = Vec::new();
        let mut our_bans = Vec::new();
        let mut enemy_bans = Vec::new();

        let mut pick_us: Vec<&ParsedSection> = self
            .sections
            .iter()
            .filter(|section| section.kind == SectionKind::Pick && section.label == SideLabel::Us)
            .collect();
        let mut pick_them: Vec<&ParsedSection> = self
            .sections
            .iter()
            .filter(|section| section.kind == SectionKind::Pick && section.label == SideLabel::Them)
            .collect();

        if pick_them.len() >= 2 && pick_us.is_empty() {
            let last = pick_them.pop().expect("sección de picks");
            pick_us.push(last);
            warnings.push(
                "Había varios 'pick ellos' y ningún 'pick nos': el último se tomó como nuestro."
                    .into(),
            );
        } else if pick_us.len() >= 2 && pick_them.is_empty() {
            let last = pick_us.pop().expect("sección de picks");
            pick_them.push(last);
            warnings.push(
                "Había varios 'pick nos' y ningún 'pick ellos': el último se tomó como rival."
                    .into(),
            );
        }

        for section in pick_us {
            our_picks.extend(section.items.iter().cloned());
        }
        for section in pick_them {
            enemy_picks.extend(section.items.iter().cloned());
        }

        let mut ban_us: Vec<&ParsedSection> = self
            .sections
            .iter()
            .filter(|section| section.kind == SectionKind::Ban && section.label == SideLabel::Us)
            .collect();
        let mut ban_them: Vec<&ParsedSection> = self
            .sections
            .iter()
            .filter(|section| section.kind == SectionKind::Ban && section.label == SideLabel::Them)
            .collect();

        if ban_them.len() >= 2 && ban_us.is_empty() {
            let last = ban_them.pop().expect("sección de bans");
            ban_us.push(last);
            warnings.push(
                "Había varios 'ban ellos' y ningún 'ban nos': el último se tomó como nuestro."
                    .into(),
            );
        } else if ban_us.len() >= 2 && ban_them.is_empty() {
            let last = ban_us.pop().expect("sección de bans");
            ban_them.push(last);
            warnings.push(
                "Había varios 'ban nos' y ningún 'ban ellos': el último se tomó como rival.".into(),
            );
        }

        for section in ban_us {
            our_bans.extend(section.items.iter().cloned());
        }
        for section in ban_them {
            enemy_bans.extend(section.items.iter().cloned());
        }

        for section in self
            .sections
            .iter()
            .filter(|section| section.label == SideLabel::Unknown)
        {
            if !section.items.is_empty() {
                let label = match section.kind {
                    SectionKind::Ban => "bans",
                    SectionKind::Pick => "picks",
                };
                warnings.push(format!(
                    "Sección de {label} sin lado: {} campeones quedaron como nota.",
                    section.items.len()
                ));
                self.notes.push(format!(
                    "{label} sin lado: {}",
                    section
                        .items
                        .iter()
                        .map(|champion| self.resolver.name(champion))
                        .collect::<Vec<_>>()
                        .join(", ")
                ));
            }
        }

        let mut rebalanced_picks = false;
        let moved_picks = rebalance(&mut our_picks, &mut enemy_picks, 5);
        if !moved_picks.is_empty() {
            rebalanced_picks = true;
            warnings.push(format!(
                "Picks rebalanceados a 5/5: {}.",
                moved_picks
                    .iter()
                    .map(|champion| self.resolver.name(champion))
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }

        let moved_bans = rebalance(&mut our_bans, &mut enemy_bans, 5);
        if !moved_bans.is_empty() {
            warnings.push(format!(
                "Bans rebalanceados a 5/5: {}.",
                moved_bans
                    .iter()
                    .map(|champion| self.resolver.name(champion))
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }

        let our_picks: Vec<HistoryPick> = our_picks
            .into_iter()
            .enumerate()
            .map(|(index, champion_id)| HistoryPick {
                champion_id,
                role: None,
                player_name: None,
                order: (index + 1) as u8,
                turn: None,
            })
            .collect();
        let enemy_picks: Vec<HistoryPick> = enemy_picks
            .into_iter()
            .enumerate()
            .map(|(index, champion_id)| HistoryPick {
                champion_id,
                role: None,
                player_name: None,
                order: (index + 1) as u8,
                turn: None,
            })
            .collect();

        let first_ban = match self.first_ban_section {
            Some(SideLabel::Us) => Some(BanStarter::Us),
            Some(SideLabel::Them) => Some(BanStarter::Them),
            _ => None,
        };
        let side = match self.first_pick_section {
            Some(SideLabel::Us) => Some(Side::Blue),
            Some(SideLabel::Them) => Some(Side::Red),
            _ => None,
        };

        if self.result == MatchResult::Unknown {
            warnings.push("Sin resultado: no cuenta para el winrate.".into());
        }
        if our_picks.len() < 5 || enemy_picks.len() < 5 {
            warnings.push(format!(
                "Picks incompletos: {}-{}.",
                our_picks.len(),
                enemy_picks.len()
            ));
        }
        if our_bans.len() < 4 || enemy_bans.len() < 4 {
            warnings.push(format!(
                "Bans incompletos: {}-{}.",
                our_bans.len(),
                enemy_bans.len()
            ));
        }
        if side.is_none() {
            warnings.push("No se pudo inferir el lado.".into());
        }
        if first_ban.is_none() {
            warnings.push("No se pudo inferir quién empezó los bans.".into());
        }

        let confidence = if self.result == MatchResult::Unknown
            || our_picks.len() < 3
            || enemy_picks.len() < 3
        {
            Confidence::Low
        } else if our_picks.len() == 5
            && enemy_picks.len() == 5
            && our_bans.len() >= 4
            && enemy_bans.len() >= 4
            && warnings.len() <= 2
        {
            Confidence::High
        } else {
            Confidence::Medium
        };

        let has_data = !our_picks.is_empty()
            || !enemy_picks.is_empty()
            || !our_bans.is_empty()
            || !enemy_bans.is_empty()
            || !self.rivals.is_empty();
        let kind = if !has_data {
            if self.broken {
                BlockKind::Broken
            } else {
                BlockKind::Scratch
            }
        } else if self.result != MatchResult::Unknown && !our_picks.is_empty() {
            BlockKind::Match
        } else {
            BlockKind::Incomplete
        };

        let summary = build_summary(
            self.resolver,
            &our_picks,
            &enemy_picks,
            &self.rivals,
            self.result,
        );

        ParsedBlock {
            sections: self.sections,
            rivals: self.rivals,
            notes: self.notes,
            warnings,
            result: self.result,
            result_note: self.result_note,
            first_ban,
            side,
            our_bans,
            enemy_bans,
            our_picks,
            enemy_picks,
            confidence,
            kind,
            summary,
            rebalanced: rebalanced_picks,
            unknown: self.unknown,
            missing_names: self.missing_names,
            fill_players: self.fill_players,
        }
    }
}

struct ParsedBlock {
    #[allow(dead_code)]
    sections: Vec<ParsedSection>,
    rivals: Vec<RivalPlayer>,
    notes: Vec<String>,
    warnings: Vec<String>,
    result: MatchResult,
    result_note: Option<String>,
    first_ban: Option<BanStarter>,
    side: Option<Side>,
    our_bans: Vec<ChampionId>,
    enemy_bans: Vec<ChampionId>,
    our_picks: Vec<HistoryPick>,
    enemy_picks: Vec<HistoryPick>,
    confidence: Confidence,
    kind: BlockKind,
    summary: String,
    rebalanced: bool,
    unknown: Vec<(String, String)>,
    missing_names: usize,
    fill_players: usize,
}

fn is_noise_token(token: &str) -> bool {
    matches!(
        token,
        "la" | "el"
            | "los"
            | "las"
            | "de"
            | "del"
            | "un"
            | "una"
            | "y"
            | "o"
            | "con"
            | "sin"
            | "no"
            | "se"
            | "que"
            | "por"
            | "para"
            | "en"
            | "al"
            | "afk"
            | "min"
            | "intro"
            | "main"
            | "aram"
            | "random"
            | "ellos"
            | "nos"
    )
}

fn rebalance(
    our: &mut Vec<ChampionId>,
    enemy: &mut Vec<ChampionId>,
    target: usize,
) -> Vec<ChampionId> {
    let mut moved = Vec::new();
    while our.len() > target && enemy.len() < target {
        if let Some(champion) = our.pop() {
            moved.push(champion.clone());
            enemy.push(champion);
        }
    }
    while enemy.len() > target && our.len() < target {
        if let Some(champion) = enemy.pop() {
            moved.push(champion.clone());
            our.push(champion);
        }
    }
    moved
}

fn parse_result(line: &str) -> Option<(MatchResult, Option<String>)> {
    let normalized = collapse_ws(&line.to_ascii_lowercase());
    let tokens: Vec<&str> = normalized
        .split(|character: char| !character.is_alphanumeric())
        .filter(|token| !token.is_empty())
        .collect();
    let has_win = tokens.contains(&"win") || tokens.contains(&"won");
    let has_loss = tokens.contains(&"loss") || tokens.contains(&"lost") || tokens.contains(&"ff");
    let broken = normalized.contains("rompi");

    if has_win && !has_loss {
        let note = (tokens.len() > 1).then(|| line.trim().to_string());
        return Some((MatchResult::Win, note));
    }
    if has_loss && !has_win {
        let note = (tokens.len() > 1).then(|| line.trim().to_string());
        return Some((MatchResult::Loss, note));
    }
    if broken {
        return Some((MatchResult::Unknown, Some(line.trim().to_string())));
    }
    None
}

fn build_summary(
    resolver: &ChampionResolver,
    our_picks: &[HistoryPick],
    enemy_picks: &[HistoryPick],
    rivals: &[RivalPlayer],
    result: MatchResult,
) -> String {
    let result_label = result.label_es();
    let our = our_picks
        .iter()
        .take(3)
        .map(|pick| resolver.name(&pick.champion_id))
        .collect::<Vec<_>>()
        .join(", ");
    let enemy = enemy_picks
        .iter()
        .take(3)
        .map(|pick| resolver.name(&pick.champion_id))
        .collect::<Vec<_>>()
        .join(", ");
    let rival = rivals
        .first()
        .map(|rival| rival.name.clone())
        .unwrap_or_else(|| "sin rivales".into());
    format!("{result_label} · nosotros: {our} · ellos: {enemy} · {rival}")
}

pub fn parse_legacy(text: &str, data: &GameData) -> LegacyImport {
    let resolver = ChampionResolver::new(data);
    let blocks = split_blocks(text);
    let mut matches = Vec::new();
    let mut reports = Vec::new();
    let mut unknown_counts: HashMap<String, (usize, Vec<String>)> = HashMap::new();
    let mut stats = super::model::ImportStats {
        blocks: blocks.len(),
        matches: 0,
        wins: 0,
        losses: 0,
        unknown_results: 0,
        rebalanced_picks: 0,
        rebalanced_bans: 0,
        unknown_tokens: 0,
        missing_names: 0,
        fill_players: 0,
    };

    for block in &blocks {
        let parsed = BlockParser::new(&resolver).parse(block);
        for (token, context) in &parsed.unknown {
            let entry = unknown_counts
                .entry(token.to_ascii_lowercase())
                .or_insert_with(|| (0, Vec::new()));
            entry.0 += 1;
            if entry.1.len() < 3 {
                entry.1.push(context.clone());
            }
        }
        stats.missing_names += parsed.missing_names;
        stats.fill_players += parsed.fill_players;

        let include = parsed.kind == BlockKind::Match || parsed.kind == BlockKind::Incomplete;
        if include {
            if parsed.rebalanced {
                stats.rebalanced_picks += 1;
            }
            if parsed
                .warnings
                .iter()
                .any(|warning| warning.starts_with("Bans rebalanceados"))
            {
                stats.rebalanced_bans += 1;
            }
            match parsed.result {
                MatchResult::Win => stats.wins += 1,
                MatchResult::Loss => stats.losses += 1,
                MatchResult::Unknown => stats.unknown_results += 1,
            }
            stats.matches += 1;
            matches.push(MatchRecord {
                id: format!("legacy-{:04}", block.index + 1),
                source: MatchSource::LegacyText,
                played_at: None,
                queue: MatchQueue::Clash,
                result: parsed.result,
                result_note: parsed.result_note.clone(),
                side: parsed.side,
                side_inferred: parsed.side.is_some(),
                first_ban: parsed.first_ban,
                first_ban_inferred: parsed.first_ban.is_some(),
                our_bans: parsed.our_bans.clone(),
                enemy_bans: parsed.enemy_bans.clone(),
                our_picks: parsed.our_picks.clone(),
                enemy_picks: parsed.enemy_picks.clone(),
                rivals: parsed.rivals.clone(),
                notes: dedupe(parsed.notes.clone()),
                warnings: dedupe(parsed.warnings.clone()),
                confidence: parsed.confidence,
                rebalanced: parsed.rebalanced,
                legacy_index: Some(block.index + 1),
            });
        }

        reports.push(BlockReport {
            index: block.index + 1,
            line_start: block.line_start,
            kind: parsed.kind,
            confidence: parsed.confidence,
            result: parsed.result,
            summary: parsed.summary,
            warnings: dedupe(parsed.warnings),
            raw: truncate(&block.lines.join("\n"), 1600),
        });
    }

    let mut unknown_tokens: Vec<UnknownToken> = unknown_counts
        .into_iter()
        .map(|(token, (count, examples))| UnknownToken {
            token,
            count,
            examples,
        })
        .collect();
    unknown_tokens.sort_by_key(|token| std::cmp::Reverse(token.count));
    stats.unknown_tokens = unknown_tokens.len();

    LegacyImport {
        matches,
        blocks: reports,
        stats,
        unknown_tokens,
    }
}

fn split_blocks(text: &str) -> Vec<RawBlock> {
    let mut blocks = Vec::new();
    let mut lines = Vec::new();
    let mut line_start = 1;
    let mut block_index = 0;

    for (index, line) in text.lines().enumerate() {
        if is_separator(line) {
            if lines.iter().any(|line: &String| !line.trim().is_empty()) {
                blocks.push(RawBlock {
                    index: block_index,
                    line_start,
                    lines: std::mem::take(&mut lines),
                });
                block_index += 1;
            } else {
                lines.clear();
            }
            line_start = index + 2;
            continue;
        }
        lines.push(line.to_string());
    }

    if lines.iter().any(|line| !line.trim().is_empty()) {
        blocks.push(RawBlock {
            index: block_index,
            line_start,
            lines,
        });
    }

    blocks
}

fn dedupe(values: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for value in values {
        let key = value.to_ascii_lowercase();
        if seen.insert(key) {
            result.push(value);
        }
    }
    result
}

fn truncate(value: &str, max: usize) -> String {
    if value.len() <= max {
        return value.to_string();
    }
    let mut end = max;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &value[..end])
}

#[cfg(test)]
mod tests {
    use super::parse_legacy;
    use crate::data::GameData;
    use crate::history::model::MatchResult;

    fn parse(text: &str) -> super::LegacyImport {
        parse_legacy(text, &GameData::embedded().unwrap())
    }

    #[test]
    fn parses_a_complete_block() {
        let import = parse(
            "top\nmicheltupro\ndarius sett garen / darius pyke zed\n\n\
             jungle\nalvin591\nkayn nunu master yi / shaco katarina veigar ojon vi\n\n\
             mid\nArytbdiet\nsylas diana wukong / ahri sylas\n\n\
             adc\nMr Andersson\npyke caitlyn leona / pyke miss fortune senna blitzcranck\n\n\
             support\nShantis16\nmiss fortune jhin caitlyn / sivir\n\n\
             ban ellos\nshen\ndarius\nlux\npyke\ncaitlyn\nsylas\n\n\
             pick ellos\nsivir\ndianaa\nezreal\nleona\nsett\nsyndra\n\n\
             ban nos\nkayn\ntahm kench\nahri\nmundo\n\n\
             pick nos\nshaco\nthresh\njax\nveigar\n\nloss",
        );
        assert_eq!(import.matches.len(), 1);
        let game = &import.matches[0];
        assert_eq!(game.result, MatchResult::Loss);
        assert_eq!(game.our_picks.len(), 5);
        assert_eq!(game.enemy_picks.len(), 5);
        assert_eq!(game.our_bans.len(), 5);
        assert_eq!(game.enemy_bans.len(), 5);
        assert!(game.rebalanced);
        assert_eq!(game.enemy_picks[1].champion_id, "Diana");
    }

    #[test]
    fn keeps_names_and_strips_rank() {
        let import = parse(
            "top\nLuciferMM Plata II\namumu talon morgana\n\n\
             ban nos\nkayn\n\npick nos\nshaco\n\nwin",
        );
        let rival = &import.matches[0].rivals[0];
        assert_eq!(rival.name, "LuciferMM");
        assert_eq!(rival.rank.as_deref(), Some("Plata II"));
    }

    #[test]
    fn maps_nicknames_to_champions() {
        let import = parse(
            "support\nCñoraOreo\nhuawei negra loca cantautora\n\n\
             ban ellos\nkayn\n\npick ellos\nshaco\n\nwin",
        );
        let rival = &import.matches[0].rivals[0];
        assert_eq!(
            rival.pool_groups[0],
            vec!["Hwei", "Senna", "Briar", "Seraphine"]
        );
    }

    #[test]
    fn detects_fill_roles() {
        let import = parse(
            "fill\nPineas\nnautilus mordekaiser chogath malphite\n\n\
             ban nos\nkayn\n\npick nos\nshaco\n\nwin",
        );
        let rival = &import.matches[0].rivals[0];
        assert_eq!(rival.role, None);
        assert_eq!(rival.role_label.as_deref(), Some("fill"));
    }

    #[test]
    fn ignores_notes_that_mention_champions() {
        let import = parse(
            "support\nCñoraOreo\nno llegue Soraka\n\n\
             ban nos\nkayn\n\npick nos\nshaco\n\nloss",
        );
        let rival = &import.matches[0].rivals[0];
        assert!(rival.pool_groups.is_empty());
        assert!(rival.notes.iter().any(|note| note.contains("Soraka")));
    }
}
