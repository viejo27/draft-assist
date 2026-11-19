mod clash;
mod client;
mod credentials;
mod mapping;
mod model;
mod tracker;

use draft_engine::data::GameData;

pub use clash::{ClashOverview, ClashView};
pub use mapping::{TrackingConfig, validate_roster};
pub use model::LcuStatus;
pub use tracker::LcuRuntime;

async fn lcu_client() -> Result<client::LcuClient, String> {
    let credentials = tokio::task::spawn_blocking(credentials::resolve)
        .await
        .map_err(|_| "No se pudo buscar el cliente. Reintentando…".to_string())?
        .map_err(|error| error.user_message().to_string())?;
    client::LcuClient::new(&credentials).map_err(|error| error.user_message().to_string())
}

pub async fn clash_overview() -> Result<ClashOverview, String> {
    let client = lcu_client().await?;
    clash::fetch_overview(&client)
        .await
        .map_err(|error| error.user_message().to_string())
}

pub async fn clash_view(data: &GameData) -> Result<ClashView, String> {
    let client = lcu_client().await?;
    clash::fetch(&client, data)
        .await
        .map_err(|error| error.user_message().to_string())
}

#[cfg(test)]
mod live_tests {
    use super::{clash_overview, clash_view};

    #[test]
    #[ignore = "requires a running League client"]
    fn reads_the_live_clash_overview() {
        let overview = tauri::async_runtime::block_on(clash_overview())
            .expect("the live Clash overview should be available");
        println!("{overview:#?}");
    }

    #[test]
    #[ignore = "requires a running League client"]
    fn reads_the_live_clash_view() {
        let data = draft_engine::data::GameData::embedded().expect("embedded data");
        let view = tauri::async_runtime::block_on(clash_view(&data))
            .expect("the live Clash view should be available");
        println!("{view:#?}");
    }
}
