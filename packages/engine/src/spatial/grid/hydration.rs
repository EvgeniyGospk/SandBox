use super::*;

mod chunk;

#[cfg(target_arch = "wasm32")]
mod lerp_wasm32;

#[cfg(not(target_arch = "wasm32"))]
mod lerp_scalar;

impl Grid {
    // === Lazy Hydration: Chunk temperature methods ===

    /// Hydrate chunk - fill air cells with virtual temperature
    /// Called when chunk wakes up from sleep
    /// PHASE 1 OPT: Uses SIMD for contiguous empty cell runs
    pub fn hydrate_chunk(&mut self, cx: u32, cy: u32, temp: f32) {
        chunk::hydrate_chunk_impl(self, cx, cy, temp)
    }

    /// Get average air temperature in chunk (for sync when going to sleep)
    /// PHASE 1 OPT: Uses SIMD horizontal sum for accumulation
    pub fn get_average_air_temp(&self, cx: u32, cy: u32) -> f32 {
        chunk::get_average_air_temp_impl(self, cx, cy)
    }

    // === PHASE 1: SIMD-optimized batch operations ===

    /// Batch lerp air temperatures towards target (for active chunks)
    /// Processes contiguous empty cell runs with SIMD
    /// Returns number of cells processed
    #[cfg(target_arch = "wasm32")]
    pub unsafe fn batch_lerp_air_temps(&mut self, cx: u32, cy: u32, target_temp: f32, lerp_speed: f32) -> u32 {
        lerp_wasm32::batch_lerp_air_temps_impl(self, cx, cy, target_temp, lerp_speed)
    }

    /// Non-WASM fallback for batch_lerp_air_temps
    #[cfg(not(target_arch = "wasm32"))]
    pub unsafe fn batch_lerp_air_temps(&mut self, cx: u32, cy: u32, target_temp: f32, lerp_speed: f32) -> u32 {
        lerp_scalar::batch_lerp_air_temps_impl(self, cx, cy, target_temp, lerp_speed)
    }
}
