use super::credentials::LcuCredentials;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use reqwest::{Client, StatusCode};
use serde::de::DeserializeOwned;
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum LcuError {
    #[error("Error HTTP del cliente: {0}")]
    Http(#[from] reqwest::Error),
    #[error("El cliente respondió {status} en {path}")]
    Status { status: u16, path: String },
}

impl LcuError {
    /// Mensaje apto para la UI. Nunca incluye URL, puerto ni detalles de red.
    pub fn user_message(&self) -> &'static str {
        match self {
            Self::Http(error) if error.is_timeout() || error.is_connect() || error.is_request() => {
                "Cliente de League no disponible. Reintentando…"
            }
            Self::Http(_) => "No se pudo comunicar con el cliente. Reintentando…",
            Self::Status { status, .. } => match status {
                401 | 403 => "La sesión del cliente cambió. Reconectando…",
                404 => "El cliente todavía no está listo. Reintentando…",
                500..=599 => "El cliente no está listo. Reintentando…",
                _ => "El cliente devolvió una respuesta inesperada. Reintentando…",
            },
        }
    }
}

pub struct LcuClient {
    http: Client,
    base_url: String,
    authorization: String,
}

impl LcuClient {
    pub fn new(credentials: &LcuCredentials) -> Result<Self, LcuError> {
        let http = Client::builder()
            .danger_accept_invalid_certs(true)
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(3))
            .build()?;
        let authorization = format!(
            "Basic {}",
            STANDARD.encode(format!("riot:{}", credentials.token))
        );

        Ok(Self {
            http,
            base_url: credentials.base_url(),
            authorization,
        })
    }

    pub async fn get_json<T: DeserializeOwned>(&self, path: &str) -> Result<T, LcuError> {
        let response = self
            .http
            .get(format!("{}{path}", self.base_url))
            .header("Authorization", &self.authorization)
            .header("Accept", "application/json")
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(LcuError::Status {
                status: response.status().as_u16(),
                path: path.into(),
            });
        }

        response.json::<T>().await.map_err(LcuError::Http)
    }

    pub async fn get_optional_json<T: DeserializeOwned>(
        &self,
        path: &str,
    ) -> Result<Option<T>, LcuError> {
        let response = self
            .http
            .get(format!("{}{path}", self.base_url))
            .header("Authorization", &self.authorization)
            .header("Accept", "application/json")
            .send()
            .await?;

        if response.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }

        if !response.status().is_success() {
            return Err(LcuError::Status {
                status: response.status().as_u16(),
                path: path.into(),
            });
        }

        response.json::<T>().await.map(Some).map_err(LcuError::Http)
    }

    pub async fn get_phase(&self) -> Result<String, LcuError> {
        self.get_json("/lol-gameflow/v1/gameflow-phase").await
    }
}

#[cfg(test)]
mod tests {
    use super::LcuError;

    #[test]
    fn unauthorized_errors_are_explained_without_transport_details() {
        let error = LcuError::Status {
            status: 401,
            path: "/lol-lobby/v2/lobby".into(),
        };

        assert_eq!(
            error.user_message(),
            "La sesión del cliente cambió. Reconectando…"
        );
        assert!(!error.user_message().contains("127.0.0.1"));
        assert!(!error.user_message().contains("lol-lobby"));
    }

    #[test]
    fn missing_endpoint_errors_are_explained_without_the_url() {
        let error = LcuError::Status {
            status: 404,
            path: "/lol-champ-select/v1/session".into(),
        };

        assert_eq!(
            error.user_message(),
            "El cliente todavía no está listo. Reintentando…"
        );
    }
}
