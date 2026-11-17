use draft_engine::AppState;
use draft_engine::history::HistoryStore;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn state_path(data_dir: &Path) -> PathBuf {
    data_dir.join("state.json")
}

pub fn history_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("history")
}

pub fn history_path(data_dir: &Path) -> PathBuf {
    history_dir(data_dir).join("history.json")
}

pub fn load_state(data_dir: &Path) -> Result<Option<AppState>, String> {
    let path = state_path(data_dir);
    if !path.is_file() {
        return Ok(None);
    }
    let contents = std::fs::read_to_string(&path)
        .map_err(|error| format!("No se pudo leer {}: {error}", path.display()))?;
    let state = serde_json::from_str(&contents)
        .map_err(|error| format!("El estado guardado no es JSON válido: {error}"))?;
    Ok(Some(state))
}

pub fn save_state(data_dir: &Path, state: &AppState) -> Result<PathBuf, String> {
    std::fs::create_dir_all(data_dir)
        .map_err(|error| format!("No se pudo crear {}: {error}", data_dir.display()))?;
    let path = state_path(data_dir);
    let json = serde_json::to_string_pretty(state)
        .map_err(|error| format!("No se pudo serializar el estado: {error}"))?;
    std::fs::write(&path, format!("{json}\n"))
        .map_err(|error| format!("No se pudo escribir {}: {error}", path.display()))?;
    Ok(path)
}

pub fn load_history(data_dir: &Path) -> Result<HistoryStore, String> {
    let path = history_path(data_dir);
    if !path.is_file() {
        return Ok(HistoryStore::default());
    }
    let contents = std::fs::read_to_string(&path)
        .map_err(|error| format!("No se pudo leer {}: {error}", path.display()))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("El historial guardado no es JSON válido: {error}"))
}

pub fn save_history(data_dir: &Path, history: &HistoryStore) -> Result<PathBuf, String> {
    let dir = history_dir(data_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("No se pudo crear {}: {error}", dir.display()))?;
    let path = history_path(data_dir);
    backup_history(&dir, &path)?;
    let json = serde_json::to_string_pretty(history)
        .map_err(|error| format!("No se pudo serializar el historial: {error}"))?;
    std::fs::write(&path, format!("{json}\n"))
        .map_err(|error| format!("No se pudo escribir {}: {error}", path.display()))?;
    cleanup_backups(&dir);
    Ok(path)
}

fn backup_history(dir: &Path, path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Ok(());
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let backup = dir.join(format!("history.backup-{stamp}.json"));
    std::fs::copy(path, &backup)
        .map_err(|error| format!("No se pudo crear el respaldo {}: {error}", backup.display()))?;
    Ok(())
}

fn cleanup_backups(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut backups: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("history.backup-"))
        })
        .collect();
    backups.sort();
    while backups.len() > 5 {
        if let Some(path) = backups.first().cloned() {
            let _ = std::fs::remove_file(path);
            backups.remove(0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{history_path, load_history, save_history};
    use draft_engine::history::{
        Confidence, HistoryStore, MatchQueue, MatchRecord, MatchResult, MatchSource,
    };

    fn temp_dir(label: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("draft-assist-{label}-{}", std::process::id()))
    }

    fn sample_match() -> MatchRecord {
        MatchRecord {
            id: "test-1".into(),
            source: MatchSource::Manual,
            played_at: None,
            queue: MatchQueue::Clash,
            result: MatchResult::Win,
            result_note: None,
            side: None,
            side_inferred: false,
            first_ban: None,
            first_ban_inferred: false,
            our_bans: Vec::new(),
            enemy_bans: Vec::new(),
            our_picks: Vec::new(),
            enemy_picks: Vec::new(),
            rivals: Vec::new(),
            notes: Vec::new(),
            warnings: Vec::new(),
            confidence: Confidence::High,
            rebalanced: false,
            legacy_index: None,
        }
    }

    #[test]
    fn history_roundtrips_and_creates_a_backup() {
        let dir = temp_dir("history");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let history = HistoryStore {
            version: 1,
            matches: vec![sample_match()],
            name_aliases: Vec::new(),
            updated_at: None,
        };

        let path = save_history(&dir, &history).unwrap();
        assert_eq!(path, history_path(&dir));
        let loaded = load_history(&dir).unwrap();
        assert_eq!(loaded.matches.len(), 1);
        assert_eq!(loaded.matches[0].id, "test-1");

        save_history(&dir, &history).unwrap();
        let backups = std::fs::read_dir(dir.join("history"))
            .unwrap()
            .flatten()
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("history.backup-")
            })
            .count();
        assert_eq!(backups, 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_history_returns_an_empty_store() {
        let dir = temp_dir("history-empty");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let history = load_history(&dir).unwrap();
        assert!(history.matches.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
