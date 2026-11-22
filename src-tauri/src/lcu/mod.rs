mod clash;
mod client;
mod credentials;
mod lobby;
mod mapping;
mod model;
mod scouting;
mod tracker;

use draft_engine::data::GameData;

pub use clash::{ClashOverview, ClashView};
pub use lobby::LobbyScoutingView;
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

pub async fn lobby_scouting(data: &GameData) -> Result<LobbyScoutingView, String> {
    let client = lcu_client().await?;
    lobby::fetch(&client, data)
        .await
        .map_err(|error| error.user_message().to_string())
}

pub async fn rival_scouting(data: &GameData) -> Result<LobbyScoutingView, String> {
    let client = lcu_client().await?;
    lobby::fetch_rival(&client, data)
        .await
        .map_err(|error| error.user_message().to_string())
}

#[cfg(test)]
mod live_tests {
    use super::{clash_overview, clash_view, lobby_scouting, rival_scouting};

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

    #[test]
    #[ignore = "requires a running League client in champ select"]
    fn reads_the_live_rival_scouting() {
        let data = draft_engine::data::GameData::embedded().expect("embedded data");
        let view = tauri::async_runtime::block_on(rival_scouting(&data))
            .expect("the live rival scouting should be available");
        println!("{view:#?}");
    }

    #[test]
    #[ignore = "requires a running League client in Clash scouting"]
    fn reads_the_live_clash_team_scouting() {
        let data = draft_engine::data::GameData::embedded().expect("embedded data");
        let view = tauri::async_runtime::block_on(lobby_scouting(&data))
            .expect("the live team scouting should be available");
        println!("{view:#?}");
    }
}
