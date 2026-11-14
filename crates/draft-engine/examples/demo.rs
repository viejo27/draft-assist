use draft_engine::Engine;
use draft_engine::data::example_state;
use draft_engine::model::{RecommendOptions, RecommendRequest};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let engine = Engine::embedded()?;
    let state = example_state()?;
    let request = RecommendRequest {
        draft: state.draft,
        roster: state.roster,
        options: RecommendOptions {
            top_n: 5,
            allow_offrole_flex: state.settings.allow_offrole_flex,
            pool_precedence: state.settings.pool_precedence,
            include_next_picks: true,
        },
    };
    let response = engine.recommend(&request)?;
    println!("{}", serde_json::to_string_pretty(&response)?);
    Ok(())
}
