//! Particula Engine - High-performance particle simulation in WASM
//! 
//! Phase 4: Spatial Optimization with Chunks
//! Phase 5: Parallel Processing with Rayon
//! 
//! Architecture (SOLID):
//! - core/          - Core functionality
//! - domain/        - Domain logic
//! - systems/       - Systems and behaviors
//! - world/         - Orchestration only
//! - api/           - Public API

// Phase 4: Utils with safety macros (must be first for macro export!)
#[macro_use]
pub mod core;
pub mod spatial;
pub mod domain;
pub mod systems;
pub mod simulation;
pub mod api;

pub mod world {
    pub use crate::simulation::*;
}

// Compatibility re-exports (keeps existing internal/external paths working)
pub use spatial::chunks;
pub use spatial::grid;
pub use domain::elements;
pub use domain::generated_elements;
pub use systems::behaviors;
pub use systems::physics;
pub use systems::reactions;
pub use systems::rigid_body;
pub use systems::rigid_body_system;
pub use systems::temperature;

use wasm_bindgen::prelude::*;

// Phase 5: Re-export wasm-bindgen-rayon for thread pool initialization
#[cfg(feature = "parallel")]
pub use wasm_bindgen_rayon::init_thread_pool;

// Better error messages in debug mode
#[cfg(feature = "console_error_panic_hook")]
pub fn set_panic_hook() {
    console_error_panic_hook::set_once();
}

/// Initialize the engine
#[wasm_bindgen]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    set_panic_hook();
    
    web_sys::console::log_1(&"🦀 Particula WASM Engine initialized!".into());
}

/// Get engine version
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// Re-export main types
pub use api::wasm::World;
pub use domain::elements::ElementType;

// Export element constants for JS
#[wasm_bindgen]
pub fn el_empty() -> u8 { domain::elements::EL_EMPTY }
#[wasm_bindgen]
pub fn el_stone() -> u8 { domain::elements::EL_STONE }
#[wasm_bindgen]
pub fn el_sand() -> u8 { domain::elements::EL_SAND }
#[wasm_bindgen]
pub fn el_wood() -> u8 { domain::elements::EL_WOOD }
#[wasm_bindgen]
pub fn el_metal() -> u8 { domain::elements::EL_METAL }
#[wasm_bindgen]
pub fn el_ice() -> u8 { domain::elements::EL_ICE }
#[wasm_bindgen]
pub fn el_water() -> u8 { domain::elements::EL_WATER }
#[wasm_bindgen]
pub fn el_oil() -> u8 { domain::elements::EL_OIL }
#[wasm_bindgen]
pub fn el_lava() -> u8 { domain::elements::EL_LAVA }
#[wasm_bindgen]
pub fn el_acid() -> u8 { domain::elements::EL_ACID }
#[wasm_bindgen]
pub fn el_steam() -> u8 { domain::elements::EL_STEAM }
#[wasm_bindgen]
pub fn el_smoke() -> u8 { domain::elements::EL_SMOKE }
#[wasm_bindgen]
pub fn el_fire() -> u8 { domain::elements::EL_FIRE }
#[wasm_bindgen]
pub fn el_spark() -> u8 { domain::elements::EL_SPARK }
#[wasm_bindgen]
pub fn el_electricity() -> u8 { domain::elements::EL_ELECTRICITY }
#[wasm_bindgen]
pub fn el_gunpowder() -> u8 { domain::elements::EL_GUNPOWDER }
#[wasm_bindgen]
pub fn el_clone() -> u8 { domain::elements::EL_CLONE }
#[wasm_bindgen]
pub fn el_void() -> u8 { domain::elements::EL_VOID }
#[wasm_bindgen]
pub fn el_dirt() -> u8 { domain::elements::EL_DIRT }
#[wasm_bindgen]
pub fn el_seed() -> u8 { domain::elements::EL_SEED }
#[wasm_bindgen]
pub fn el_plant() -> u8 { domain::elements::EL_PLANT }
