use crate::model::{
    AppState, Champion, ChampionMeta, DraftTemplate, Matchup, Side, Synergy, ValidationReport,
};
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::Path;
use thiserror::Error;

pub const EXAMPLE_STATE: &str = include_str!("../data/example-state.json");

const CHAMPIONS_JSON: &str = include_str!("../data/champions.json");
const META_JSON: &str = include_str!("../data/champion-meta.json");
const MATCHUPS_JSON: &str = include_str!("../data/matchups.json");
const SYNERGIES_JSON: &str = include_str!("../data/synergies.json");
const TEMPLATES_JSON: &str = include_str!("../data/templates.json");
const SCORING_JSON: &str = include_str!("../data/scoring.json");

const DATA_FILES: [(&str, &str); 6] = [
    ("champions.json", CHAMPIONS_JSON),
    ("champion-meta.json", META_JSON),
    ("matchups.json", MATCHUPS_JSON),
    ("synergies.json", SYNERGIES_JSON),
    ("templates.json", TEMPLATES_JSON),
    ("scoring.json", SCORING_JSON),
];

#[derive(Debug, Error)]
pub enum DataError {
    #[error("No se pudo leer {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("JSON inválido en {file}: {source}")]
    Json {
        file: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("Datos inválidos: {0}")]
    Invalid(String),
    #[error("Falta el archivo de datos {0}")]
    Missing(String),
}

#[derive(Debug, Deserialize)]
struct ChampionCatalogFile {
    version: String,
    champions: Vec<Champion>,
}

#[derive(Debug, Deserialize)]
struct MetaCatalogFile {
    #[allow(dead_code)]
    version: String,
    champions: BTreeMap<String, ChampionMeta>,
}

#[derive(Debug, Deserialize)]
struct MatchupFile {
    matchups: Vec<Matchup>,
}

#[derive(Debug, Deserialize)]
struct SynergyFile {
    synergies: Vec<Synergy>,
}

#[derive(Debug, Deserialize)]
struct TemplateFile {
    templates: Vec<DraftTemplate>,
}

#[derive(Debug, Clone)]
pub struct GameData {
    pub version: String,
    pub champions: Vec<Champion>,
    pub meta: BTreeMap<String, ChampionMeta>,
    pub matchups: Vec<Matchup>,
    pub synergies: Vec<Synergy>,
    pub templates: Vec<DraftTemplate>,
    pub config: crate::model::ScoringConfig,
    champion_index: HashMap<String, usize>,
}

impl GameData {
    pub fn embedded() -> Result<Self, DataError> {
        Self::from_json_strs(
            CHAMPIONS_JSON,
            META_JSON,
            MATCHUPS_JSON,
            SYNERGIES_JSON,
            TEMPLATES_JSON,
            SCORING_JSON,
        )
    }

    pub fn from_json_strs(
        champions_json: &str,
        meta_json: &str,
        matchups_json: &str,
        synergies_json: &str,
        templates_json: &str,
        scoring_json: &str,
    ) -> Result<Self, DataError> {
        let catalog: ChampionCatalogFile =
            serde_json::from_str(champions_json).map_err(|source| DataError::Json {
                file: "champions.json".into(),
                source,
            })?;
        let meta: MetaCatalogFile =
            serde_json::from_str(meta_json).map_err(|source| DataError::Json {
                file: "champion-meta.json".into(),
                source,
            })?;
        let matchups: MatchupFile =
            serde_json::from_str(matchups_json).map_err(|source| DataError::Json {
                file: "matchups.json".into(),
                source,
            })?;
        let synergies: SynergyFile =
            serde_json::from_str(synergies_json).map_err(|source| DataError::Json {
                file: "synergies.json".into(),
                source,
            })?;
        let templates: TemplateFile =
            serde_json::from_str(templates_json).map_err(|source| DataError::Json {
                file: "templates.json".into(),
                source,
            })?;
        let config: crate::model::ScoringConfig =
            serde_json::from_str(scoring_json).map_err(|source| DataError::Json {
                file: "scoring.json".into(),
                source,
            })?;

        let champion_index = catalog
            .champions
            .iter()
            .enumerate()
            .map(|(index, champion)| (champion.id.clone(), index))
            .collect();

        let data = Self {
            version: catalog.version,
            champions: catalog.champions,
            meta: meta.champions,
            matchups: matchups.matchups,
            synergies: synergies.synergies,
            templates: templates.templates,
            config,
            champion_index,
        };
        data.validate_self()?;
        Ok(data)
    }

    pub fn from_paths(dir: &Path) -> Result<Self, DataError> {
        let read = |name: &str| -> Result<String, DataError> {
            let path = dir.join(name);
            if !path.is_file() {
                return Err(DataError::Missing(path.display().to_string()));
            }
            std::fs::read_to_string(&path).map_err(|source| DataError::Io {
                path: path.display().to_string(),
                source,
            })
        };

        Self::from_json_strs(
            &read("champions.json")?,
            &read("champion-meta.json")?,
            &read("matchups.json")?,
            &read("synergies.json")?,
            &read("templates.json")?,
            &read("scoring.json")?,
        )
    }

    pub fn ensure_defaults(dir: &Path) -> Result<(), DataError> {
        std::fs::create_dir_all(dir).map_err(|source| DataError::Io {
            path: dir.display().to_string(),
            source,
        })?;
        for (name, contents) in DATA_FILES {
            let path = dir.join(name);
            if !path.exists() {
                std::fs::write(&path, contents).map_err(|source| DataError::Io {
                    path: path.display().to_string(),
                    source,
                })?;
            }
        }
        Ok(())
    }

    pub fn champion(&self, id: &str) -> Option<&Champion> {
        self.champion_index
            .get(id)
            .and_then(|index| self.champions.get(*index))
    }

    pub fn meta(&self, id: &str) -> Option<&ChampionMeta> {
        self.meta.get(id)
    }

    pub fn template(&self, id: &str) -> Option<&DraftTemplate> {
        self.templates.iter().find(|template| template.id == id)
    }

    pub fn default_template(&self) -> Option<&DraftTemplate> {
        self.template("tournament")
            .or_else(|| self.templates.first())
    }

    pub fn stats(&self) -> crate::model::DataStats {
        crate::model::DataStats {
            version: self.version.clone(),
            champions: self.champions.len(),
            meta_entries: self.meta.len(),
            matchups: self.matchups.len(),
            synergies: self.synergies.len(),
            templates: self.templates.len(),
        }
    }

    pub fn matchup_value(&self, champion: &str, opponent: &str) -> Option<(f32, u8, &str)> {
        if champion == opponent {
            return Some((0.0, 3, ""));
        }
        if let Some(found) = self
            .matchups
            .iter()
            .find(|entry| entry.champion == champion && entry.opponent == opponent)
        {
            return Some((found.value, found.severity, found.note.as_str()));
        }
        self.matchups
            .iter()
            .find(|entry| entry.champion == opponent && entry.opponent == champion)
            .map(|found| (-found.value * 0.8, found.severity, found.note.as_str()))
    }

    pub fn synergy_value(&self, a: &str, b: &str) -> Option<(f32, &str)> {
        if a == b {
            return None;
        }
        self.synergies
            .iter()
            .find(|entry| (entry.a == a && entry.b == b) || (entry.a == b && entry.b == a))
            .map(|entry| (entry.value, entry.note.as_str()))
    }

    fn validate_self(&self) -> Result<(), DataError> {
        let report = self.validate();
        if report.valid {
            Ok(())
        } else {
            Err(DataError::Invalid(report.errors.join(" | ")))
        }
    }

    pub fn validate(&self) -> ValidationReport {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        if self.champions.is_empty() {
            errors.push("El catálogo de campeones está vacío.".into());
        }

        let mut champion_ids = HashSet::new();
        for champion in &self.champions {
            if champion.id.trim().is_empty() {
                errors.push("Hay un campeón con id vacío.".into());
            }
            if !champion_ids.insert(champion.id.as_str()) {
                errors.push(format!("Campeón duplicado: {}.", champion.id));
            }
        }

        for champion in &self.champions {
            let Some(meta) = self.meta.get(&champion.id) else {
                errors.push(format!("Falta metadata para {}.", champion.id));
                continue;
            };
            if meta.roles.is_empty() {
                errors.push(format!("{} no tiene roles asignados.", champion.id));
            }
            if !(1..=5).contains(&meta.priority) {
                errors.push(format!(
                    "{} tiene prioridad {} (debe estar entre 1 y 5).",
                    champion.id, meta.priority
                ));
            }
            for (trait_name, value) in [
                ("frontline", meta.traits.frontline),
                ("engage", meta.traits.engage),
                ("peel", meta.traits.peel),
                ("cc", meta.traits.cc),
                ("carry", meta.traits.carry),
                ("scaling", meta.traits.scaling),
                ("early", meta.traits.early),
                ("splitpush", meta.traits.splitpush),
                ("poke", meta.traits.poke),
                ("sustain", meta.traits.sustain),
                ("waveclear", meta.traits.waveclear),
                ("mobility", meta.traits.mobility),
                ("anti_tank", meta.traits.anti_tank),
                ("anti_heal", meta.traits.anti_heal),
                ("shield", meta.traits.shield),
                ("utility", meta.traits.utility),
                ("aoe", meta.traits.aoe),
            ] {
                if !(0.0..=5.0).contains(&value) {
                    errors.push(format!(
                        "{}.{} = {value}; los traits deben estar entre 0 y 5.",
                        champion.id, trait_name
                    ));
                }
            }
        }

        for champion_id in self.meta.keys() {
            if !champion_ids.contains(champion_id.as_str()) {
                warnings.push(format!(
                    "Hay metadata para un campeón que no está en el catálogo: {champion_id}."
                ));
            }
        }

        for matchup in &self.matchups {
            if !champion_ids.contains(matchup.champion.as_str()) {
                errors.push(format!(
                    "Matchup con campeón desconocido: {}.",
                    matchup.champion
                ));
            }
            if !champion_ids.contains(matchup.opponent.as_str()) {
                errors.push(format!(
                    "Matchup con rival desconocido: {}.",
                    matchup.opponent
                ));
            }
            if matchup.champion == matchup.opponent {
                errors.push(format!(
                    "Matchup inválido: {} contra sí mismo.",
                    matchup.champion
                ));
            }
            if !(-1.0..=1.0).contains(&matchup.value) {
                errors.push(format!(
                    "Matchup {} vs {} fuera de rango: {}.",
                    matchup.champion, matchup.opponent, matchup.value
                ));
            }
            if !(1..=3).contains(&matchup.severity) {
                errors.push(format!(
                    "Severidad inválida en {} vs {}.",
                    matchup.champion, matchup.opponent
                ));
            }
        }

        for synergy in &self.synergies {
            if !champion_ids.contains(synergy.a.as_str()) {
                errors.push(format!("Sinergia con campeón desconocido: {}.", synergy.a));
            }
            if !champion_ids.contains(synergy.b.as_str()) {
                errors.push(format!("Sinergia con campeón desconocido: {}.", synergy.b));
            }
            if synergy.a == synergy.b {
                errors.push(format!("Sinergia inválida: {} consigo mismo.", synergy.a));
            }
            if !(0.0..=1.0).contains(&synergy.value) {
                errors.push(format!(
                    "Sinergia {} + {} fuera de rango: {}.",
                    synergy.a, synergy.b, synergy.value
                ));
            }
        }

        if self.templates.is_empty() {
            errors.push("No hay plantillas de draft.".into());
        }

        for template in &self.templates {
            let mut blue_picks = 0_u8;
            let mut red_picks = 0_u8;
            let mut blue_bans = 0_u8;
            let mut red_bans = 0_u8;

            for step in &template.steps {
                match step.kind {
                    crate::model::Phase::Pick => match step.team {
                        Some(Side::Blue) => blue_picks += 1,
                        Some(Side::Red) => red_picks += 1,
                        None => errors.push(format!(
                            "La plantilla {} tiene un pick sin equipo.",
                            template.id
                        )),
                    },
                    crate::model::Phase::Ban => match step.team {
                        Some(Side::Blue) => blue_bans += step.ban_slots_per_team.max(1),
                        Some(Side::Red) => red_bans += step.ban_slots_per_team.max(1),
                        None if step.simultaneous => {
                            let slots = step.ban_slots_per_team.max(1);
                            blue_bans += slots;
                            red_bans += slots;
                        }
                        None => errors.push(format!(
                            "La plantilla {} tiene un ban sin equipo y sin modo simultáneo.",
                            template.id
                        )),
                    },
                }
            }

            if blue_picks != 5 || red_picks != 5 {
                errors.push(format!(
                    "La plantilla {} tiene {blue_picks} picks azules y {red_picks} rojos (esperado 5 y 5).",
                    template.id
                ));
            }
            if blue_bans != 5 || red_bans != 5 {
                errors.push(format!(
                    "La plantilla {} tiene {blue_bans} bans azules y {red_bans} rojos (esperado 5 y 5).",
                    template.id
                ));
            }
        }

        for (name, weights) in &self.config.profiles {
            let positive = weights.matchup
                + weights.synergy
                + weights.needs
                + weights.comfort
                + weights.meta
                + weights.flex;
            if (positive - 1.0).abs() > 0.001 {
                warnings.push(format!(
                    "El perfil {name} suma {positive:.3} en pesos positivos (se normalizará a 1)."
                ));
            }
            if weights.risk < 0.0 {
                errors.push(format!("El perfil {name} tiene riesgo negativo."));
            }
        }

        for profile in ["EARLY", "MID", "LATE"] {
            if !self.config.profiles.contains_key(profile) {
                errors.push(format!("Falta el perfil de pesos {profile}."));
            }
        }

        ValidationReport {
            valid: errors.is_empty(),
            errors,
            warnings,
        }
    }
}

pub fn example_state() -> Result<AppState, DataError> {
    serde_json::from_str(EXAMPLE_STATE).map_err(|source| DataError::Json {
        file: "example-state.json".into(),
        source,
    })
}
