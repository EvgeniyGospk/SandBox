//! Particula Engine - High-performance particle simulation in WASM
//! 
//! Phase 4: Spatial Optimization with Chunks
//! 
//! Architecture (SOLID):
//! - elements.rs    - Element definitions and properties
//! - grid.rs        - SoA data storage
//! - chunks.rs      - Spatial optimization (32x32 chunks)
//! - behaviors/     - Particle physics (one file per category)
//! - reactions.rs   - Chemical reactions
//! - temperature.rs - Thermodynamics and phase changes
//! - world.rs       - Orchestration only

// Phase 4: Utils with safety macros (must be first for macro export!)
#[macro_use]
mod utils;

mod generated_elements;
mod elements;
mod grid;
mod chunks;
mod behaviors;
mod reactions;
mod temperature;
mod physics;  // Phase 2: Newtonian Physics
mod rigid_body;  // Rigid body structure
mod rigid_body_system;  // Rigid body manager
mod world;

use wasm_bindgen::prelude::*;

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
pub use world::World;
pub use elements::ElementType;

// Export element constants for JS
#[wasm_bindgen]
pub fn el_empty() -> u8 { elements::EL_EMPTY }
#[wasm_bindgen]
pub fn el_stone() -> u8 { elements::EL_STONE }
#[wasm_bindgen]
pub fn el_sand() -> u8 { elements::EL_SAND }
#[wasm_bindgen]
pub fn el_wood() -> u8 { elements::EL_WOOD }
#[wasm_bindgen]
pub fn el_metal() -> u8 { elements::EL_METAL }
#[wasm_bindgen]
pub fn el_ice() -> u8 { elements::EL_ICE }
#[wasm_bindgen]
pub fn el_water() -> u8 { elements::EL_WATER }
#[wasm_bindgen]
pub fn el_oil() -> u8 { elements::EL_OIL }
#[wasm_bindgen]
pub fn el_lava() -> u8 { elements::EL_LAVA }
#[wasm_bindgen]
pub fn el_acid() -> u8 { elements::EL_ACID }
#[wasm_bindgen]
pub fn el_steam() -> u8 { elements::EL_STEAM }
#[wasm_bindgen]
pub fn el_smoke() -> u8 { elements::EL_SMOKE }
#[wasm_bindgen]
pub fn el_fire() -> u8 { elements::EL_FIRE }
#[wasm_bindgen]
pub fn el_spark() -> u8 { elements::EL_SPARK }
#[wasm_bindgen]
pub fn el_electricity() -> u8 { elements::EL_ELECTRICITY }
#[wasm_bindgen]
pub fn el_gunpowder() -> u8 { elements::EL_GUNPOWDER }
#[wasm_bindgen]
pub fn el_clone() -> u8 { elements::EL_CLONE }
#[wasm_bindgen]
pub fn el_void() -> u8 { elements::EL_VOID }
#[wasm_bindgen]
pub fn el_dirt() -> u8 { elements::EL_DIRT }
#[wasm_bindgen]
pub fn el_seed() -> u8 { elements::EL_SEED }
#[wasm_bindgen]
pub fn el_plant() -> u8 { elements::EL_PLANT }
