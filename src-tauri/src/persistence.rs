use draft_engine::AppState;
use std::path::{Path, PathBuf};

pub fn state_path(data_dir: &Path) -> PathBuf {
    data_dir.join("state.json")
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
