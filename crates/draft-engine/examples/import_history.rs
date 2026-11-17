use draft_engine::data::GameData;
use draft_engine::history::{
    HistoryStore, history_to_clean_text, import_report_json, import_review_markdown, parse_legacy,
};
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let input = args.next().unwrap_or_else(|| "ban-clash.txt".into());
    let output = args.next().unwrap_or_else(|| "private".into());
    let input = PathBuf::from(input);
    let output = PathBuf::from(output);

    let text = std::fs::read_to_string(&input)?;
    let data = GameData::embedded()?;
    let import = parse_legacy(&text, &data);
    std::fs::create_dir_all(&output)?;

    let store = HistoryStore {
        version: 1,
        matches: import.matches.clone(),
        name_aliases: Vec::new(),
        updated_at: None,
    };

    let json_path = output.join("clash-history.json");
    let clean_path = output.join("clash-history.clean.txt");
    let review_path = output.join("clash-history.review.md");
    let report_path = output.join("clash-import-report.json");

    std::fs::write(
        &json_path,
        format!("{}\n", serde_json::to_string_pretty(&store)?),
    )?;
    std::fs::write(&clean_path, history_to_clean_text(&store, &data))?;
    std::fs::write(&review_path, import_review_markdown(&import, &data))?;
    std::fs::write(&report_path, format!("{}\n", import_report_json(&import)?))?;

    println!("Entrada: {}", input.display());
    println!("Salida: {}", output.display());
    println!(
        "Bloques: {} · partidas: {} · victorias: {} · derrotas: {} · sin resultado: {}",
        import.stats.blocks,
        import.stats.matches,
        import.stats.wins,
        import.stats.losses,
        import.stats.unknown_results
    );
    println!(
        "Rebalanceos: {} picks · {} bans · tokens no reconocidos: {} · nombres faltantes: {} · flex: {}",
        import.stats.rebalanced_picks,
        import.stats.rebalanced_bans,
        import.stats.unknown_tokens,
        import.stats.missing_names,
        import.stats.fill_players
    );
    println!("JSON: {}", json_path.display());
    println!("Limpio: {}", clean_path.display());
    println!("Revisión: {}", review_path.display());
    println!("Reporte: {}", report_path.display());

    Ok(())
}
