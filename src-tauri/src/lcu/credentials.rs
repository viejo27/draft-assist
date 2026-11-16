use std::path::{Path, PathBuf};
use sysinfo::System;
use thiserror::Error;

#[derive(Debug, Clone)]
pub struct LcuCredentials {
    pub port: u16,
    pub token: String,
}

impl LcuCredentials {
    pub fn base_url(&self) -> String {
        format!("https://127.0.0.1:{}", self.port)
    }
}

#[derive(Debug, Error)]
pub enum CredentialsError {
    #[error("League of Legends no está abierto o no se pudo encontrar el cliente.")]
    NotFound,
    #[error("No se pudo leer el lockfile: {0}")]
    Io(String),
    #[error("El lockfile del cliente no tiene el formato esperado.")]
    InvalidLockfile,
    #[error("El cliente devolvió un puerto inválido.")]
    InvalidPort,
}

pub fn resolve() -> Result<LcuCredentials, CredentialsError> {
    if let Some(credentials) = from_process() {
        return Ok(credentials);
    }

    for path in known_lockfiles() {
        if let Ok(credentials) = parse_lockfile(&path) {
            return Ok(credentials);
        }
    }

    Err(CredentialsError::NotFound)
}

pub fn parse_lockfile(path: &Path) -> Result<LcuCredentials, CredentialsError> {
    let content = std::fs::read_to_string(path)
        .map_err(|error| CredentialsError::Io(format!("{}: {error}", path.display())))?;
    parse_lockfile_content(&content)
}

pub fn parse_lockfile_content(content: &str) -> Result<LcuCredentials, CredentialsError> {
    let mut parts = content.trim().splitn(5, ':');
    let _name = parts.next().ok_or(CredentialsError::InvalidLockfile)?;
    let _pid = parts.next().ok_or(CredentialsError::InvalidLockfile)?;
    let port = parts
        .next()
        .ok_or(CredentialsError::InvalidLockfile)?
        .parse::<u16>()
        .map_err(|_| CredentialsError::InvalidPort)?;
    let token = parts.next().ok_or(CredentialsError::InvalidLockfile)?;
    let _protocol = parts.next().ok_or(CredentialsError::InvalidLockfile)?;

    if token.is_empty() {
        return Err(CredentialsError::InvalidLockfile);
    }

    Ok(LcuCredentials {
        port,
        token: token.to_string(),
    })
}

fn known_lockfiles() -> Vec<PathBuf> {
    let mut paths = vec![PathBuf::from(r"C:\Riot Games\League of Legends\lockfile")];

    for variable in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Ok(base) = std::env::var(variable) {
            paths.push(
                PathBuf::from(base)
                    .join("Riot Games")
                    .join("League of Legends")
                    .join("lockfile"),
            );
        }
    }

    paths
}

fn from_process() -> Option<LcuCredentials> {
    let mut system = System::new_all();
    system.refresh_all();

    for process in system.processes().values() {
        let name = process.name().to_string_lossy().to_ascii_lowercase();
        if name != "leagueclientux.exe" && name != "leagueclientux" {
            continue;
        }

        let args: Vec<String> = process
            .cmd()
            .iter()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect();

        if let Some(install_directory) = arg_value(&args, "--install-directory") {
            let lockfile = PathBuf::from(install_directory).join("lockfile");
            if let Ok(credentials) = parse_lockfile(&lockfile) {
                return Some(credentials);
            }
        }

        let Some(port) = arg_value(&args, "--app-port") else {
            continue;
        };
        let Some(token) = arg_value(&args, "--remoting-auth-token") else {
            continue;
        };
        let Ok(port) = port.parse::<u16>() else {
            continue;
        };
        if token.is_empty() {
            continue;
        }
        return Some(LcuCredentials { port, token });
    }

    None
}

fn arg_value(args: &[String], key: &str) -> Option<String> {
    for (index, argument) in args.iter().enumerate() {
        if let Some(value) = argument.strip_prefix(&format!("{key}=")) {
            return Some(value.trim_matches('"').to_string());
        }
        if argument == key {
            return args
                .get(index + 1)
                .map(|value| value.trim_matches('"').to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{arg_value, parse_lockfile_content};

    #[test]
    fn parses_a_valid_lockfile() {
        let credentials =
            parse_lockfile_content("LeagueClient:1234:51234:secret-token:https").unwrap();

        assert_eq!(credentials.port, 51234);
        assert_eq!(credentials.token, "secret-token");
        assert_eq!(credentials.base_url(), "https://127.0.0.1:51234");
    }

    #[test]
    fn rejects_a_lockfile_without_token() {
        let error = parse_lockfile_content("LeagueClient:1234:51234::https").unwrap_err();

        assert!(error.to_string().contains("formato"));
    }

    #[test]
    fn reads_process_arguments_in_both_forms() {
        let args = vec![
            "--app-port=51234".to_string(),
            "--remoting-auth-token".to_string(),
            "secret".to_string(),
        ];

        assert_eq!(arg_value(&args, "--app-port").as_deref(), Some("51234"));
        assert_eq!(
            arg_value(&args, "--remoting-auth-token").as_deref(),
            Some("secret")
        );
    }
}
