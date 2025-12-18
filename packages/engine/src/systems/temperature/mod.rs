//! Temperature System - Thermodynamics and Phase Changes
//! 
//! Port from: apps/web/src/lib/engine/core/Simulation.ts
//! EXACT 1:1 port of the TypeScript temperature algorithms
//! 
//! - Heat transfer using Newton's law of cooling (simplified)
//! - Stochastic: only check ONE random neighbor for performance
//! - Phase changes (melting, freezing, boiling, condensing)

mod perf;
mod rng;
mod transform;
mod scalar;
mod legacy_air;
mod chunked;
mod simd;

pub use perf::{reset_phase_change_counter, take_phase_change_counter, PERF_PHASE_CHANGES};
pub use crate::elements::check_phase_change;
pub use scalar::process_temperature_grid;
pub use chunked::process_temperature_grid_chunked;
pub use simd::{diffuse_horizontal_simd, update_air_temperature_simd};
