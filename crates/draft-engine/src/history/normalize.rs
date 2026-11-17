use crate::data::GameData;
use crate::model::{ChampionId, Role};
use std::collections::HashMap;

const RANKS: &[&str] = &[
    "hierro",
    "bronce",
    "plata",
    "oro",
    "platino",
    "esmeralda",
    "diamante",
    "maestro",
    "retador",
];

const ALIASES: &[(&str, &str)] = &[
    ("fiddlestick", "Fiddlesticks"),
    ("evelyn", "Evelynn"),
    ("evelin", "Evelynn"),
    ("renata", "Renata"),
    ("renataglask", "Renata"),
    ("glask", "Renata"),
    ("yummi", "Yuumi"),
    ("yumii", "Yuumi"),
    ("bardo", "Bard"),
    ("leblanck", "Leblanc"),
    ("lysandra", "Lissandra"),
    ("lisandra", "Lissandra"),
    ("chogat", "Chogath"),
    ("lilia", "Lillia"),
    ("maestroyi", "MasterYi"),
    ("quiyana", "Qiyana"),
    ("reel", "Rell"),
    ("zeraphine", "Seraphine"),
    ("maoaki", "Maokai"),
    ("ekkos", "Ekko"),
    ("dianaa", "Diana"),
    ("blitzcranck", "Blitzcrank"),
    ("blitzcrack", "Blitzcrank"),
    ("blitcranck", "Blitzcrank"),
    ("brlitzcranck", "Blitzcrank"),
    ("tresh", "Thresh"),
    ("thamkench", "TahmKench"),
    ("mordekaise", "Mordekaiser"),
    ("mordekaier", "Mordekaiser"),
    ("mordekaiaser", "Mordekaiser"),
    ("modekaiser", "Mordekaiser"),
    ("morde", "Mordekaiser"),
    ("cailtyn", "Caitlyn"),
    ("caityln", "Caitlyn"),
    ("caitlytn", "Caitlyn"),
    ("oriana", "Orianna"),
    ("velkos", "Velkoz"),
    ("kazix", "Khazix"),
    ("kha", "Khazix"),
    ("casiopeia", "Cassiopeia"),
    ("cassipeia", "Cassiopeia"),
    ("jana", "Janna"),
    ("sena", "Senna"),
    ("phanteon", "Pantheon"),
    ("panteon", "Pantheon"),
    ("vayen", "Vayne"),
    ("zaheen", "Zaahen"),
    ("kogmow", "KogMaw"),
    ("kog", "KogMaw"),
    ("mundo", "DrMundo"),
    ("drmundo", "DrMundo"),
    ("ksante", "KSante"),
    ("reksai", "RekSai"),
    ("kaisa", "Kaisa"),
    ("nunu", "Nunu"),
    ("nunuwillump", "Nunu"),
    ("jarvan", "JarvanIV"),
    ("jarvaniv", "JarvanIV"),
    ("xin", "XinZhao"),
    ("xinzhao", "XinZhao"),
    ("milio", "Milio"),
    ("millio", "Milio"),
    ("nafiri", "Naafiri"),
    ("gp", "Gangplank"),
    ("yi", "MasterYi"),
    ("tf", "TwistedFate"),
    ("j4", "JarvanIV"),
    ("ww", "Warwick"),
    ("mf", "MissFortune"),
    ("tk", "TahmKench"),
    ("velbeth", "Belveth"),
    ("belbeth", "Belveth"),
    ("orn", "Ornn"),
    ("orrn", "Ornn"),
    ("popy", "Poppy"),
    ("huawei", "Hwei"),
    ("negra", "Senna"),
    ("loca", "Briar"),
    ("cantautora", "Seraphine"),
    ("raka", "Soraka"),
    ("thersh", "Thresh"),
    ("apehlios", "Aphelios"),
    ("gankplank", "Gangplank"),
    ("darisu", "Darius"),
    ("ryse", "Ryze"),
    ("ryzen", "Ryze"),
    ("svir", "Sivir"),
    ("moderkaiser", "Mordekaiser"),
    ("dian", "Diana"),
    ("rakshan", "Akshan"),
    ("kaysa", "Kaisa"),
    ("vez", "Vex"),
    ("graren", "Garen"),
    ("malphithe", "Malphite"),
    ("camile", "Camille"),
    ("aoshin", "AurelionSol"),
    ("huei", "Hwei"),
    ("ramus", "Rammus"),
    ("alisatar", "Alistar"),
    ("dairus", "Darius"),
    ("warwik", "Warwick"),
    ("blitz", "Blitzcrank"),
    ("namim", "Nami"),
];

#[derive(Debug, Clone)]
pub struct ChampionResolver {
    keys: HashMap<String, ChampionId>,
    names: HashMap<ChampionId, String>,
}

#[derive(Debug, Clone, Default)]
pub struct LineMatch {
    pub champions: Vec<ChampionId>,
    pub unknown: Vec<String>,
}

impl ChampionResolver {
    pub fn new(data: &GameData) -> Self {
        let mut resolver = Self {
            keys: HashMap::new(),
            names: HashMap::new(),
        };

        for champion in &data.champions {
            resolver
                .names
                .insert(champion.id.clone(), champion.name.clone());
            resolver
                .keys
                .insert(compact(&champion.id), champion.id.clone());
            resolver
                .keys
                .insert(compact(&champion.name), champion.id.clone());
        }

        for (alias, champion_id) in ALIASES {
            if resolver.names.contains_key(*champion_id) {
                resolver
                    .keys
                    .insert(compact(alias), (*champion_id).to_string());
            }
        }

        resolver
    }

    pub fn name(&self, champion_id: &str) -> String {
        self.names
            .get(champion_id)
            .cloned()
            .unwrap_or_else(|| champion_id.to_string())
    }

    pub fn resolve_line(&self, line: &str) -> LineMatch {
        let cleaned = line.replace(['/', '|', ',', ';', '(', ')', '[', ']'], " ");
        let tokens: Vec<&str> = cleaned.split_whitespace().collect();
        let mut result = LineMatch::default();
        let mut index = 0;

        while index < tokens.len() {
            let mut found: Option<(ChampionId, usize)> = None;
            for length in (1..=3.min(tokens.len() - index)).rev() {
                let key = compact(&tokens[index..index + length].join(""));
                if let Some(champion_id) = self.keys.get(&key) {
                    found = Some((champion_id.clone(), length));
                    break;
                }
            }

            if let Some((champion_id, length)) = found {
                result.champions.push(champion_id);
                index += length;
            } else {
                let token = tokens[index].trim_matches(|character: char| {
                    !character.is_alphanumeric() && character != '\''
                });
                if !token.is_empty() {
                    result.unknown.push(token.to_string());
                }
                index += 1;
            }
        }

        result
    }

    pub fn is_champion_name(&self, name: &str) -> bool {
        self.keys.contains_key(&compact(name))
    }
}

pub fn compact(input: &str) -> String {
    input
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

pub fn collapse_ws(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn is_separator(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.len() >= 3 && trimmed.chars().all(|character| character == '/')
}

pub fn role_from_header(line: &str) -> Option<(Option<Role>, Option<String>)> {
    let normalized = collapse_ws(&line.to_ascii_lowercase());
    let normalized = normalized
        .strip_suffix(" lane")
        .unwrap_or(&normalized)
        .trim()
        .to_string();
    let normalized = normalized
        .strip_suffix(" x")
        .unwrap_or(&normalized)
        .trim()
        .to_string();

    let role = match normalized.as_str() {
        "top" => Some(Role::Top),
        "jungle" | "jg" | "jungla" => Some(Role::Jungle),
        "mid" | "middle" => Some(Role::Mid),
        "adc" | "bottom" | "bot" => Some(Role::Adc),
        "support" | "sup" | "utility" => Some(Role::Support),
        _ => None,
    };
    if let Some(role) = role {
        return Some((Some(role), None));
    }

    let label = match normalized.as_str() {
        "fill" => Some("fill"),
        "comodin" | "commodin" => Some("comodin"),
        "random" => Some("random"),
        "aram" => Some("aram"),
        "autofill" => Some("autofill"),
        "nada" => Some("nada"),
        _ => None,
    };
    label.map(|label| (None, Some(label.to_string())))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SideLabel {
    Us,
    Them,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SectionKind {
    Ban,
    Pick,
}

pub fn section_header(line: &str) -> Option<(SectionKind, SideLabel, String)> {
    let normalized = collapse_ws(&line.to_ascii_lowercase());
    let (kind, rest) = if let Some(rest) = normalized.strip_prefix("bans") {
        (SectionKind::Ban, rest)
    } else if let Some(rest) = normalized.strip_prefix("ban") {
        (SectionKind::Ban, rest)
    } else if let Some(rest) = normalized.strip_prefix("picks") {
        (SectionKind::Pick, rest)
    } else if let Some(rest) = normalized.strip_prefix("pick") {
        (SectionKind::Pick, rest)
    } else {
        return None;
    };

    let rest = rest.trim();
    if rest.is_empty() {
        return Some((kind, SideLabel::Unknown, String::new()));
    }

    for (token, label) in [
        ("ellos", SideLabel::Them),
        ("rival", SideLabel::Them),
        ("rivales", SideLabel::Them),
        ("enemy", SideLabel::Them),
        ("nos", SideLabel::Us),
        ("nosotros", SideLabel::Us),
        ("nuestro", SideLabel::Us),
        ("nuestros", SideLabel::Us),
        ("us", SideLabel::Us),
    ] {
        if rest == token || rest.starts_with(&format!("{token} ")) {
            let remainder = rest[token.len()..].trim().to_string();
            return Some((kind, label, remainder));
        }
    }

    Some((kind, SideLabel::Unknown, rest.to_string()))
}

pub fn is_note_line(line: &str) -> bool {
    let normalized = collapse_ws(&line.to_ascii_lowercase());
    let note_prefixes = [
        "no ",
        "no, ",
        "nada",
        "no vi",
        "no llegue",
        "no llegó",
        "no lleg",
        "afk",
        "se romp",
        "aram",
        "random",
        "ff",
        "nota",
        "intro",
        "gg",
        "wp",
        "porque",
        "sin ",
        "falta",
        "nunca",
    ];
    note_prefixes
        .iter()
        .any(|prefix| normalized.starts_with(prefix))
}

pub fn parse_name(
    raw: &str,
    resolver: &ChampionResolver,
) -> (String, String, Option<String>, Vec<String>) {
    let raw_name = collapse_ws(raw)
        .trim_end_matches([',', ';', ':'])
        .trim()
        .to_string();
    let mut name = raw_name.clone();
    let mut rank = None;
    let mut warnings = Vec::new();

    let mut stripped_name = None;
    {
        let tokens: Vec<&str> = name.split_whitespace().collect();
        if tokens.len() >= 3 {
            let division = tokens[tokens.len() - 1].to_ascii_lowercase();
            let rank_word = tokens[tokens.len() - 2].to_ascii_lowercase();
            let is_division = matches!(division.as_str(), "i" | "ii" | "iii" | "iv");
            if is_division && RANKS.contains(&rank_word.as_str()) {
                rank = Some(format!(
                    "{} {}",
                    tokens[tokens.len() - 2],
                    tokens[tokens.len() - 1]
                ));
                stripped_name = Some(tokens[..tokens.len() - 2].join(" "));
            }
        }

        if tokens.len() >= 4 {
            let division = tokens[tokens.len() - 1].to_ascii_lowercase();
            let second = tokens[tokens.len() - 2].to_ascii_lowercase();
            let first = tokens[tokens.len() - 3].to_ascii_lowercase();
            let is_division = matches!(division.as_str(), "i" | "ii" | "iii" | "iv");
            if is_division && first == "gran" && second == "maestro" {
                rank = Some(format!(
                    "{} {} {}",
                    tokens[tokens.len() - 3],
                    tokens[tokens.len() - 2],
                    tokens[tokens.len() - 1]
                ));
                stripped_name = Some(tokens[..tokens.len() - 3].join(" "));
            }
        }
    }

    if let Some(stripped) = stripped_name {
        name = stripped;
    }

    if name.is_empty() {
        warnings.push("Nombre vacío.".into());
    }
    if name.to_ascii_lowercase().contains("afk") {
        warnings.push("El nombre contiene 'afk'; puede ser una nota.".into());
    }
    if resolver.is_champion_name(&name) {
        warnings.push("El nombre coincide con un campeón; se conserva como jugador.".into());
    }
    if name.len() > 32 {
        warnings.push("Nombre inusualmente largo.".into());
    }

    (name, raw_name, rank, warnings)
}

#[cfg(test)]
mod tests {
    use super::{ChampionResolver, compact, parse_name, role_from_header, section_header};

    fn resolver() -> ChampionResolver {
        ChampionResolver::new(&crate::data::GameData::embedded().unwrap())
    }

    #[test]
    fn compacts_champion_names() {
        assert_eq!(compact("Kai'Sa"), "kaisa");
        assert_eq!(compact("Dr. Mundo"), "drmundo");
        assert_eq!(compact("Nunu & Willump"), "nunuwillump");
    }

    #[test]
    fn resolves_known_typos_and_nicknames() {
        let resolver = resolver();
        let line = resolver
            .resolve_line("fiddlestick evelyn renata yummi bardo huawei negra loca cantautora");
        assert_eq!(
            line.champions,
            vec![
                "Fiddlesticks",
                "Evelynn",
                "Renata",
                "Yuumi",
                "Bard",
                "Hwei",
                "Senna",
                "Briar",
                "Seraphine"
            ]
        );
        assert!(line.unknown.is_empty());
    }

    #[test]
    fn resolves_multiword_champions() {
        let resolver = resolver();
        let line = resolver.resolve_line("lee sin kog mow dr mundo jarvan iv kai sa");
        assert_eq!(
            line.champions,
            vec!["LeeSin", "KogMaw", "DrMundo", "JarvanIV", "Kaisa"]
        );
    }

    #[test]
    fn extracts_rank_with_division_only() {
        let resolver = resolver();
        let (name, _, rank, _) = parse_name("LuciferMM Plata II", &resolver);
        assert_eq!(name, "LuciferMM");
        assert_eq!(rank.as_deref(), Some("Plata II"));

        let (name, _, rank, _) = parse_name("Anillo de Oro", &resolver);
        assert_eq!(name, "Anillo de Oro");
        assert!(rank.is_none());
    }

    #[test]
    fn detects_roles_and_fill_labels() {
        assert!(role_from_header("jungle x").is_some());
        assert_eq!(
            role_from_header("comodin"),
            Some((None, Some("comodin".into())))
        );
    }

    #[test]
    fn detects_sections_with_champion_remainder() {
        let (kind, side, rest) = section_header("bans yone").unwrap();
        assert_eq!(kind, super::SectionKind::Ban);
        assert_eq!(side, super::SideLabel::Unknown);
        assert_eq!(rest, "yone");

        let (kind, side, rest) = section_header("pick nos").unwrap();
        assert_eq!(kind, super::SectionKind::Pick);
        assert_eq!(side, super::SideLabel::Us);
        assert!(rest.is_empty());
    }
}
