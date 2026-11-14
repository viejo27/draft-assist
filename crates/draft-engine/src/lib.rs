pub mod data;
pub mod model;
pub mod recommend;
pub mod scoring;
pub mod templates;

pub use data::{DataError, GameData, example_state};
pub use model::{
    AppState, ChampionView, DraftState, DraftSummary, RecommendRequest, Recommendation,
    RecommendationResponse, Role, Side, ValidationReport,
};
pub use recommend::{recommend, validate_app_state};

use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("Error de datos: {0}")]
    Data(#[from] DataError),
    #[error("Plantilla desconocida: {0}")]
    UnknownTemplate(String),
    #[error("Estado de draft inválido: {0}")]
    InvalidState(String),
}

#[derive(Debug, Clone)]
pub struct Engine {
    data: GameData,
}

impl Engine {
    pub fn new(data: GameData) -> Self {
        Self { data }
    }

    pub fn embedded() -> Result<Self, EngineError> {
        Ok(Self::new(GameData::embedded()?))
    }

    pub fn from_paths(dir: &Path) -> Result<Self, EngineError> {
        Ok(Self::new(GameData::from_paths(dir)?))
    }

    pub fn data(&self) -> &GameData {
        &self.data
    }

    pub fn recommend(
        &self,
        request: &RecommendRequest,
    ) -> Result<RecommendationResponse, EngineError> {
        recommend::recommend(&self.data, request)
    }

    pub fn validate_app_state(&self, state: &AppState) -> ValidationReport {
        validate_app_state(&self.data, state)
    }
}
