use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone)]
pub struct PerfStats {
    pub(super) step_ms: f64,
    pub(super) rigid_ms: f64,
    pub(super) physics_ms: f64,
    pub(super) chunks_ms: f64,
    pub(super) temperature_ms: f64,
    pub(super) powder_ms: f64,
    pub(super) liquid_ms: f64,
    pub(super) gas_ms: f64,
    pub(super) energy_ms: f64,
    pub(super) utility_ms: f64,
    pub(super) bio_ms: f64,
    pub(super) particles_processed: u32,
    pub(super) particles_moved: u32,
    pub(super) reactions_checked: u32,
    pub(super) reactions_applied: u32,
    pub(super) temp_cells: u32,
    pub(super) simd_air_cells: u32,
    pub(super) phase_changes: u32,
    pub(super) liquid_scans: u32,
    pub(super) physics_calls: u32,
    pub(super) raycast_steps_total: u32,
    pub(super) raycast_collisions: u32,
    pub(super) raycast_speed_max: f32,
    pub(super) non_empty_cells: u32,
    pub(super) behavior_calls: u32,
    pub(super) behavior_powder: u32,
    pub(super) behavior_liquid: u32,
    pub(super) behavior_gas: u32,
    pub(super) behavior_energy: u32,
    pub(super) behavior_utility: u32,
    pub(super) behavior_bio: u32,
    pub(super) memory_bytes: u32,
    pub(super) grid_size: u32,
    pub(super) active_chunks: u32,
    pub(super) dirty_chunks: u32,
    pub(super) particle_count: u32,
}

impl PerfStats {
    pub(crate) fn reset(&mut self) {
        *self = PerfStats::default();
    }
}

impl Default for PerfStats {
    fn default() -> Self {
        PerfStats {
            step_ms: 0.0,
            rigid_ms: 0.0,
            physics_ms: 0.0,
            chunks_ms: 0.0,
            temperature_ms: 0.0,
            powder_ms: 0.0,
            liquid_ms: 0.0,
            gas_ms: 0.0,
            energy_ms: 0.0,
            utility_ms: 0.0,
            bio_ms: 0.0,
            particles_processed: 0,
            particles_moved: 0,
            reactions_checked: 0,
            reactions_applied: 0,
            temp_cells: 0,
            simd_air_cells: 0,
            phase_changes: 0,
            liquid_scans: 0,
            physics_calls: 0,
            raycast_steps_total: 0,
            raycast_collisions: 0,
            raycast_speed_max: 0.0,
            non_empty_cells: 0,
            behavior_calls: 0,
            behavior_powder: 0,
            behavior_liquid: 0,
            behavior_gas: 0,
            behavior_energy: 0,
            behavior_utility: 0,
            behavior_bio: 0,
            memory_bytes: 0,
            grid_size: 0,
            active_chunks: 0,
            dirty_chunks: 0,
            particle_count: 0,
        }
    }
}

#[wasm_bindgen]
impl PerfStats {
    #[wasm_bindgen(getter)]
    pub fn step_ms(&self) -> f64 { self.step_ms }
    #[wasm_bindgen(getter)]
    pub fn rigid_ms(&self) -> f64 { self.rigid_ms }
    #[wasm_bindgen(getter)]
    pub fn physics_ms(&self) -> f64 { self.physics_ms }
    #[wasm_bindgen(getter)]
    pub fn chunks_ms(&self) -> f64 { self.chunks_ms }
    #[wasm_bindgen(getter)]
    pub fn temperature_ms(&self) -> f64 { self.temperature_ms }
    #[wasm_bindgen(getter)]
    pub fn powder_ms(&self) -> f64 { self.powder_ms }
    #[wasm_bindgen(getter)]
    pub fn liquid_ms(&self) -> f64 { self.liquid_ms }
    #[wasm_bindgen(getter)]
    pub fn gas_ms(&self) -> f64 { self.gas_ms }
    #[wasm_bindgen(getter)]
    pub fn energy_ms(&self) -> f64 { self.energy_ms }
    #[wasm_bindgen(getter)]
    pub fn utility_ms(&self) -> f64 { self.utility_ms }
    #[wasm_bindgen(getter)]
    pub fn bio_ms(&self) -> f64 { self.bio_ms }
    #[wasm_bindgen(getter)]
    pub fn particles_processed(&self) -> u32 { self.particles_processed }
    #[wasm_bindgen(getter)]
    pub fn particles_moved(&self) -> u32 { self.particles_moved }
    #[wasm_bindgen(getter)]
    pub fn reactions_checked(&self) -> u32 { self.reactions_checked }
    #[wasm_bindgen(getter)]
    pub fn reactions_applied(&self) -> u32 { self.reactions_applied }
    #[wasm_bindgen(getter)]
    pub fn temp_cells(&self) -> u32 { self.temp_cells }
    #[wasm_bindgen(getter)]
    pub fn simd_air_cells(&self) -> u32 { self.simd_air_cells }
    #[wasm_bindgen(getter)]
    pub fn phase_changes(&self) -> u32 { self.phase_changes }
    #[wasm_bindgen(getter)]
    pub fn liquid_scans(&self) -> u32 { self.liquid_scans }
    #[wasm_bindgen(getter)]
    pub fn physics_calls(&self) -> u32 { self.physics_calls }
    #[wasm_bindgen(getter)]
    pub fn raycast_steps_total(&self) -> u32 { self.raycast_steps_total }
    #[wasm_bindgen(getter)]
    pub fn raycast_collisions(&self) -> u32 { self.raycast_collisions }
    #[wasm_bindgen(getter)]
    pub fn raycast_speed_max(&self) -> f32 { self.raycast_speed_max }
    #[wasm_bindgen(getter)]
    pub fn non_empty_cells(&self) -> u32 { self.non_empty_cells }
    #[wasm_bindgen(getter)]
    pub fn behavior_calls(&self) -> u32 { self.behavior_calls }
    #[wasm_bindgen(getter)]
    pub fn behavior_powder(&self) -> u32 { self.behavior_powder }
    #[wasm_bindgen(getter)]
    pub fn behavior_liquid(&self) -> u32 { self.behavior_liquid }
    #[wasm_bindgen(getter)]
    pub fn behavior_gas(&self) -> u32 { self.behavior_gas }
    #[wasm_bindgen(getter)]
    pub fn behavior_energy(&self) -> u32 { self.behavior_energy }
    #[wasm_bindgen(getter)]
    pub fn behavior_utility(&self) -> u32 { self.behavior_utility }
    #[wasm_bindgen(getter)]
    pub fn behavior_bio(&self) -> u32 { self.behavior_bio }
    #[wasm_bindgen(getter)]
    pub fn memory_bytes(&self) -> u32 { self.memory_bytes }
    #[wasm_bindgen(getter)]
    pub fn grid_size(&self) -> u32 { self.grid_size }
    #[wasm_bindgen(getter)]
    pub fn active_chunks(&self) -> u32 { self.active_chunks }
    #[wasm_bindgen(getter)]
    pub fn dirty_chunks(&self) -> u32 { self.dirty_chunks }
    #[wasm_bindgen(getter)]
    pub fn particle_count(&self) -> u32 { self.particle_count }
}
