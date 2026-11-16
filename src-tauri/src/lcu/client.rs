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
