//! Live Client Data integration for the in-game view.

mod mapping;
mod match_record;
mod model;
mod runtime;

pub use match_record::build_match_record;
pub use model::LiveSnapshot;
pub use runtime::LiveRuntime;
