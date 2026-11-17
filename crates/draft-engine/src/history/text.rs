use super::model::{
    BanStarter, Confidence, HistoryStore, LegacyImport, MatchQueue, MatchRecord, MatchResult,
    RivalPlayer,
};
use super::normalize::ChampionResolver;
use crate::data::GameData;
use crate::model::Side;

pub fn history_to_clean_text(store: &HistoryStore, data: &GameData) -> String {
    let resolver = ChampionResolver::new(data);
    let mut output = String::new();
    output.push_str("# Draft Assist · Historial de Clash\n");
    output.push_str("# Formato: un bloque por partida. Los pools conservan main / last.\n");
    output.push_str("# Los campos marcados como (inferido) se pueden corregir en la app.\n\n");

    for (index, game) in store.matches.iter().enumerate() {
        output.push_str(&match_to_text(game, index + 1, &resolver));
        output.push('\n');
    }

    output
}

fn match_to_text(game: &MatchRecord, position: usize, resolver: &ChampionResolver) -> String {
    let mut output = String::new();
    let result = match game.result {
        MatchResult::Win => "victoria",
        MatchResult::Loss => "derrota",
        MatchResult::Unknown => "sin resultado",
    };
    let queue = match game.queue {
        MatchQueue::Clash => "Clash",
        MatchQueue::RankedSolo => "Ranked Solo",
        MatchQueue::RankedFlex => "Ranked Flex",
        MatchQueue::NormalDraft => "Normal Draft",
        MatchQueue::Custom => "Custom",
        MatchQueue::Unknown => "sin cola",
    };
    let side = match game.side {
        Some(Side::Blue) => "azul",
        Some(Side::Red) => "rojo",
        None => "sin lado",
    };
    let first_ban = match game.first_ban {
        Some(BanStarter::Us) => "nosotros",
        Some(BanStarter::Them) => "ellos",
        Some(BanStarter::Unknown) | None => "sin dato",
    };

    let side_suffix = if game.side_inferred {
        " (inferido)"
    } else {
        ""
    };
    let ban_suffix = if game.first_ban_inferred {
        " (inferido)"
    } else {
        ""
    };
    let rebalanced = if game.rebalanced {
        " · rebalanceado"
    } else {
        ""
    };
    output.push_str(&format!(
        "### {:03} · {} · {} · lado {}{} · primer ban: {}{}{}\n",
        game.legacy_index.unwrap_or(position),
        queue,
        result,
        side,
        side_suffix,
        first_ban,
        ban_suffix,
        rebalanced,
    ));

    if let Some(note) = &game.result_note {
        output.push_str(&format!("resultado: {}\n", note));
    }

    if game.rivals.is_empty() {
        output.push_str("rivales: sin datos de scouting\n");
    } else {
        for rival in &game.rivals {
            output.push_str(&rival_to_text(rival, resolver));
            output.push('\n');
        }
    }

    output.push('\n');
    output.push_str(&format!(
        "bans nosotros (orden): {}\n",
        list_champions(&game.our_bans, resolver)
    ));
    output.push_str(&format!(
        "picks nosotros (orden): {}\n",
        list_picks(&game.our_picks, resolver)
    ));
    output.push_str(&format!(
        "bans rivales (orden): {}\n",
        list_champions(&game.enemy_bans, resolver)
    ));
    output.push_str(&format!(
        "picks rivales (orden): {}\n",
        list_picks(&game.enemy_picks, resolver)
    ));

    if !game.notes.is_empty() {
        output.push_str(&format!("notas: {}\n", game.notes.join(" · ")));
    }
    let review: Vec<&str> = game
        .warnings
        .iter()
        .map(String::as_str)
        .filter(|warning| {
            !warning.starts_with("Picks rebalanceados")
                && !warning.starts_with("Bans rebalanceados")
                && !warning.starts_with("Había varios")
        })
        .collect();
    if !review.is_empty() {
        output.push_str(&format!("revisión: {}\n", review.join(" · ")));
    }

    output
}

fn rival_to_text(rival: &RivalPlayer, resolver: &ChampionResolver) -> String {
    let role = match rival.role {
        Some(role) => role.label_es().to_string(),
        None => rival
            .role_label
            .clone()
            .unwrap_or_else(|| "flex".to_string()),
    };
    let mut pools = Vec::new();
    for (index, group) in rival.pool_groups.iter().enumerate() {
        if group.is_empty() {
            continue;
        }
        let label = match index {
            0 => "main",
            1 => "last",
            _ => "extra",
        };
        pools.push(format!("{label}: {}", list_champions(group, resolver)));
    }
    let pool = if pools.is_empty() {
        "sin pool".to_string()
    } else {
        pools.join(" · ")
    };
    let rank = rival
        .rank
        .as_ref()
        .map(|rank| format!(" [{rank}]"))
        .unwrap_or_default();
    let notes = if rival.notes.is_empty() {
        String::new()
    } else {
        format!(" · notas: {}", rival.notes.join(" · "))
    };
    format!("{}: {}{} · {}{}", role, rival.name, rank, pool, notes)
}

fn list_champions(champions: &[String], resolver: &ChampionResolver) -> String {
    if champions.is_empty() {
        return "—".into();
    }
    champions
        .iter()
        .map(|champion| resolver.name(champion))
        .collect::<Vec<_>>()
        .join(", ")
}

fn list_picks(picks: &[super::model::HistoryPick], resolver: &ChampionResolver) -> String {
    if picks.is_empty() {
        return "—".into();
    }
    picks
        .iter()
        .map(|pick| resolver.name(&pick.champion_id))
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn import_review_markdown(import: &LegacyImport, data: &GameData) -> String {
    let resolver = ChampionResolver::new(data);
    let mut output = String::new();
    output.push_str("# Revisión de importación · Historial de Clash\n\n");
    output.push_str("## Resumen\n\n");
    output.push_str(&format!(
        "- Bloques: {}\n- Partidas importadas: {}\n- Victorias: {}\n- Derrotas: {}\n- Sin resultado: {}\n- Picks rebalanceados: {}\n- Bans rebalanceados: {}\n- Nombres faltantes: {}\n- Jugadores flex: {}\n- Tokens no reconocidos: {}\n\n",
        import.stats.blocks,
        import.stats.matches,
        import.stats.wins,
        import.stats.losses,
        import.stats.unknown_results,
        import.stats.rebalanced_picks,
        import.stats.rebalanced_bans,
        import.stats.missing_names,
        import.stats.fill_players,
        import.stats.unknown_tokens,
    ));

    if !import.unknown_tokens.is_empty() {
        output.push_str("## Tokens no reconocidos\n\n");
        output.push_str("| Token | Veces | Ejemplos |\n|---|---:|---|\n");
        for token in import.unknown_tokens.iter().take(60) {
            output.push_str(&format!(
                "| `{}` | {} | {} |\n",
                token.token,
                token.count,
                token
                    .examples
                    .iter()
                    .map(|example| example.replace('|', "\\|"))
                    .collect::<Vec<_>>()
                    .join("<br>")
            ));
        }
        output.push('\n');
    }

    output.push_str("## Nombres con posibles problemas\n\n");
    let mut name_counts: std::collections::HashMap<String, usize> =
        std::collections::HashMap::new();
    for game in &import.matches {
        for rival in &game.rivals {
            *name_counts
                .entry(rival.name.to_ascii_lowercase())
                .or_insert(0) += 1;
        }
    }

    let mut issues = Vec::new();
    let mut seen_issues = std::collections::HashSet::new();
    for game in &import.matches {
        let mut names_in_game = std::collections::HashSet::new();
        for rival in &game.rivals {
            let role = match rival.role {
                Some(role) => role.label_es().to_string(),
                None => rival
                    .role_label
                    .clone()
                    .unwrap_or_else(|| "flex".to_string()),
            };
            let mut rival_issues = Vec::new();
            if rival.rank.is_some() {
                rival_issues.push("rango separado del nombre");
            }
            if rival.name == "Sin nombre" {
                rival_issues.push("rol sin nombre");
            }
            if rival.role_label.is_some() {
                rival_issues.push("posición flex / no fija");
            }
            if resolver.is_champion_name(&rival.name) {
                rival_issues.push("el nombre coincide con un campeón");
            }
            if !names_in_game.insert(rival.name.to_ascii_lowercase()) {
                rival_issues.push("nombre duplicado en la misma partida");
            }
            let count = name_counts
                .get(&rival.name.to_ascii_lowercase())
                .copied()
                .unwrap_or(0);
            if count > 1 {
                rival_issues.push(if count == 2 {
                    "repetido en 2 partidas"
                } else {
                    "repetido en varias partidas"
                });
            }
            for issue in rival_issues {
                let key = format!("{}|{issue}", rival.name.to_ascii_lowercase());
                if seen_issues.insert(key) {
                    issues.push((rival.name.clone(), role.clone(), issue.to_string()));
                }
            }
        }
    }

    if issues.is_empty() {
        output.push_str("- Sin avisos de nombres.\n\n");
    } else {
        output.push_str("| Nombre | Rol | Aviso |\n|---|---|---|\n");
        for (name, role, issue) in issues {
            output.push_str(&format!("| **{name}** | {role} | {issue} |\n"));
        }
        output.push('\n');
    }

    output.push_str("## Índice de rivales\n\n");
    let mut seen_names = std::collections::HashSet::new();
    for game in &import.matches {
        for rival in &game.rivals {
            let key = rival.name.to_ascii_lowercase();
            if !seen_names.insert(key) {
                continue;
            }
            let role = match rival.role {
                Some(role) => role.label_es().to_string(),
                None => rival
                    .role_label
                    .clone()
                    .unwrap_or_else(|| "flex".to_string()),
            };
            let pool = rival
                .pool_groups
                .first()
                .map(|group| list_champions(group, &resolver))
                .unwrap_or_else(|| "—".into());
            output.push_str(&format!(
                "- **{}** · {} · {}{}\n",
                rival.name,
                role,
                pool,
                rival
                    .rank
                    .as_ref()
                    .map(|rank| format!(" · rango {rank}"))
                    .unwrap_or_default()
            ));
        }
    }
    output.push('\n');

    output.push_str("## Bloques que necesitan revisión\n\n");
    for block in import
        .blocks
        .iter()
        .filter(|block| !block.warnings.is_empty() || !matches!(block.confidence, Confidence::High))
    {
        output.push_str(&format!(
            "### Bloque {} · línea {} · {:?} · {:?}\n\n",
            block.index, block.line_start, block.kind, block.confidence
        ));
        output.push_str(&format!("{}\n\n", block.summary));
        if block.warnings.is_empty() {
            output.push_str("- Sin avisos.\n\n");
        } else {
            for warning in &block.warnings {
                output.push_str(&format!("- {warning}\n"));
            }
            output.push('\n');
        }
        output.push_str("<details><summary>Ver bloque original</summary>\n\n```text\n");
        output.push_str(&block.raw);
        output.push_str("\n```\n\n</details>\n\n");
    }

    output
}

pub fn import_report_json(import: &LegacyImport) -> Result<String, serde_json::Error> {
    serde_json::to_string_pretty(import)
}
