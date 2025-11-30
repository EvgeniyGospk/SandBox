//! World - High-performance particle simulation
//! 
//! Phase 4: Chunk-based spatial optimization
//! 
//! Refactored for SOLID principles:
//! - Single Responsibility: World only orchestrates, delegates to behaviors/reactions/temperature
//! - Open/Closed: New behaviors can be added without modifying this file
//! 
//! All particle physics are in behaviors/ module
//! Chemical reactions are in reactions.rs
//! Temperature system is in temperature.rs
//! Chunk optimization in chunks.rs

use wasm_bindgen::prelude::*;
#[cfg(target_arch = "wasm32")]
use js_sys;
use crate::grid::Grid;
use crate::chunks::{ChunkGrid, CHUNK_SIZE, MergedDirtyRects};
use crate::elements::{
    ELEMENT_DATA, ElementId, EL_EMPTY, ELEMENT_COUNT,
    get_color_with_variation, get_props, CAT_SOLID, CAT_POWDER, CAT_LIQUID, CAT_GAS, CAT_ENERGY, CAT_UTILITY, CAT_BIO
};
use crate::behaviors::{BehaviorRegistry, UpdateContext};
use crate::reactions::{Reaction, ReactionSystem};
use crate::temperature::process_temperature_grid_chunked;
use crate::physics::{update_particle_physics, reset_physics_perf_counters, take_physics_perf_counters};
use crate::rigid_body::RigidBody;
use crate::rigid_body_system::RigidBodySystem;
use crate::behaviors::{reset_liquid_scan_counter, take_liquid_scan_counter};
use crate::temperature::{reset_phase_change_counter, take_phase_change_counter};

// Lightweight timer that works both in wasm and native
#[derive(Clone, Copy)]
struct PerfTimer {
    #[cfg(target_arch = "wasm32")]
    start_ms: f64,
    #[cfg(not(target_arch = "wasm32"))]
    start: std::time::Instant,
}

impl PerfTimer {
    fn start() -> Self {
        #[cfg(target_arch = "wasm32")]
        {
            PerfTimer { start_ms: js_sys::Date::now() }
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            PerfTimer { start: std::time::Instant::now() }
        }
    }

    fn elapsed_ms(&self) -> f64 {
        #[cfg(target_arch = "wasm32")]
        {
            js_sys::Date::now() - self.start_ms
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            self.start.elapsed().as_secs_f64() * 1000.0
        }
    }
}

/// Per-step performance snapshot (filled only when perf metrics are enabled)
#[wasm_bindgen]
#[derive(Clone)]
pub struct PerfStats {
    step_ms: f64,
    hydrate_ms: f64,
    rigid_ms: f64,
    physics_ms: f64,
    chunks_ms: f64,
    apply_moves_ms: f64,
    temperature_ms: f64,
    powder_ms: f64,
    liquid_ms: f64,
    gas_ms: f64,
    energy_ms: f64,
    utility_ms: f64,
    bio_ms: f64,
    particles_processed: u32,
    particles_moved: u32,
    reactions_checked: u32,
    reactions_applied: u32,
    temp_cells: u32,
    simd_air_cells: u32,
    phase_changes: u32,
    liquid_scans: u32,
    physics_calls: u32,
    raycast_steps_total: u32,
    raycast_collisions: u32,
    raycast_speed_max: f32,
    non_empty_cells: u32,
    chunk_particle_sum: u32,
    chunk_particle_max: u32,
    behavior_calls: u32,
    behavior_powder: u32,
    behavior_liquid: u32,
    behavior_gas: u32,
    behavior_energy: u32,
    behavior_utility: u32,
    behavior_bio: u32,
    move_buffer_overflows: u32,
    move_buffer_usage: f32,
    chunks_woken: u32,
    chunks_slept: u32,
    memory_bytes: u32,
    grid_size: u32,
    active_chunks: u32,
    dirty_chunks: u32,
    pending_moves: u32,
    particle_count: u32,
}

impl PerfStats {
    fn reset(&mut self) {
        *self = PerfStats::default();
    }
}

impl Default for PerfStats {
    fn default() -> Self {
        PerfStats {
            step_ms: 0.0,
            hydrate_ms: 0.0,
            rigid_ms: 0.0,
            physics_ms: 0.0,
            chunks_ms: 0.0,
            apply_moves_ms: 0.0,
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
            chunk_particle_sum: 0,
            chunk_particle_max: 0,
            behavior_calls: 0,
            behavior_powder: 0,
            behavior_liquid: 0,
            behavior_gas: 0,
            behavior_energy: 0,
            behavior_utility: 0,
            behavior_bio: 0,
            move_buffer_overflows: 0,
            move_buffer_usage: 0.0,
            chunks_woken: 0,
            chunks_slept: 0,
            memory_bytes: 0,
            grid_size: 0,
            active_chunks: 0,
            dirty_chunks: 0,
            pending_moves: 0,
            particle_count: 0,
        }
    }
}

#[wasm_bindgen]
impl PerfStats {
    #[wasm_bindgen(getter)]
    pub fn step_ms(&self) -> f64 { self.step_ms }
    #[wasm_bindgen(getter)]
    pub fn hydrate_ms(&self) -> f64 { self.hydrate_ms }
    #[wasm_bindgen(getter)]
    pub fn rigid_ms(&self) -> f64 { self.rigid_ms }
    #[wasm_bindgen(getter)]
    pub fn physics_ms(&self) -> f64 { self.physics_ms }
    #[wasm_bindgen(getter)]
    pub fn chunks_ms(&self) -> f64 { self.chunks_ms }
    #[wasm_bindgen(getter)]
    pub fn apply_moves_ms(&self) -> f64 { self.apply_moves_ms }
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
    pub fn chunk_particle_sum(&self) -> u32 { self.chunk_particle_sum }
    #[wasm_bindgen(getter)]
    pub fn chunk_particle_max(&self) -> u32 { self.chunk_particle_max }
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
    pub fn move_buffer_overflows(&self) -> u32 { self.move_buffer_overflows }
    #[wasm_bindgen(getter)]
    pub fn move_buffer_usage(&self) -> f32 { self.move_buffer_usage }
    #[wasm_bindgen(getter)]
    pub fn chunks_woken(&self) -> u32 { self.chunks_woken }
    #[wasm_bindgen(getter)]
    pub fn chunks_slept(&self) -> u32 { self.chunks_slept }
    #[wasm_bindgen(getter)]
    pub fn memory_bytes(&self) -> u32 { self.memory_bytes }
    #[wasm_bindgen(getter)]
    pub fn grid_size(&self) -> u32 { self.grid_size }
    #[wasm_bindgen(getter)]
    pub fn active_chunks(&self) -> u32 { self.active_chunks }
    #[wasm_bindgen(getter)]
    pub fn dirty_chunks(&self) -> u32 { self.dirty_chunks }
    #[wasm_bindgen(getter)]
    pub fn pending_moves(&self) -> u32 { self.pending_moves }
    #[wasm_bindgen(getter)]
    pub fn particle_count(&self) -> u32 { self.particle_count }
}

/// Random number generator (xorshift32)
#[inline]
fn xorshift32(state: &mut u32) -> u32 {
    let mut x = *state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *state = x;
    x
}

/// The simulation world
#[wasm_bindgen]
pub struct World {
    grid: Grid,
    chunks: ChunkGrid,
    behaviors: BehaviorRegistry,
    reactions: ReactionSystem,  // Phase 1: Data-driven O(1) reaction lookup
    rigid_bodies: RigidBodySystem,  // Rigid body physics system
    
    // Settings
    gravity_x: f32,
    gravity_y: f32,
    ambient_temperature: f32,
    
    // State
    particle_count: u32,
    frame: u64,
    rng_state: u32,
    
    // Phase 3: Smart Rendering buffers
    dirty_list: Vec<u32>,           // List of dirty chunk indices for rendering
    chunk_transfer_buffer: Vec<u32>, // 32x32 pixel buffer for chunk extraction
    
    // Phase 2: Merged dirty rectangles for GPU batching
    merged_rects: MergedDirtyRects,
    rect_transfer_buffer: Vec<u32>, // Larger buffer for merged rect extraction

    // Perf metrics
    perf_enabled: bool,
    perf_stats: PerfStats,
    perf_stats_last_speed_max: f32,
}

#[wasm_bindgen]
impl World {
    /// Create a new world with given dimensions
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            grid: Grid::new(width, height),
            chunks: ChunkGrid::new(width, height),
            behaviors: BehaviorRegistry::new(),
            reactions: ReactionSystem::new(), // Phase 1: O(1) reaction lookup
            rigid_bodies: RigidBodySystem::new(), // Rigid body physics
            gravity_x: 0.0,
            gravity_y: 1.0,
            ambient_temperature: 20.0,
            particle_count: 0,
            frame: 0,
            rng_state: 12345,
            // Phase 3: Smart Rendering
            dirty_list: Vec::with_capacity(1000),
            chunk_transfer_buffer: vec![0u32; (CHUNK_SIZE * CHUNK_SIZE) as usize],
            
            // Phase 2: GPU Batching
            merged_rects: MergedDirtyRects::new(500), // Max 500 rectangles
            rect_transfer_buffer: vec![0u32; (CHUNK_SIZE * CHUNK_SIZE * 16) as usize], // Max 4x4 chunks = 128x128 pixels

            perf_enabled: false,
            perf_stats: PerfStats::default(),
            perf_stats_last_speed_max: 0.0,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 { self.grid.width() }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 { self.grid.height() }

    #[wasm_bindgen(getter)]
    pub fn particle_count(&self) -> u32 { self.particle_count }

    #[wasm_bindgen(getter)]
    pub fn frame(&self) -> u64 { self.frame }

    /// Enable or disable per-step perf metrics (adds timing overhead when enabled)
    pub fn enable_perf_metrics(&mut self, enabled: bool) {
        self.perf_enabled = enabled;
    }

    /// Get last step perf snapshot (zeros when perf disabled)
    pub fn get_perf_stats(&self) -> PerfStats {
        self.perf_stats.clone()
    }

    pub fn set_gravity(&mut self, x: f32, y: f32) {
        // Phase 2: Use actual gravity values for velocity-based physics
        // Higher values = faster acceleration
        self.gravity_x = x;
        self.gravity_y = y;
    }

    pub fn set_ambient_temperature(&mut self, temp: f32) {
        self.ambient_temperature = temp;
    }
    
    /// DEBUG: Get current ambient temperature
    pub fn get_ambient_temperature(&self) -> f32 {
        self.ambient_temperature
    }

    /// Add a particle at position
    pub fn add_particle(&mut self, x: u32, y: u32, element: u8) -> bool {
        if x >= self.grid.width() || y >= self.grid.height() {
            return false;
        }
        
        // Validate element ID
        if (element as usize) >= ELEMENT_COUNT || element == EL_EMPTY {
            return false;
        }
        
        if !self.grid.is_empty(x as i32, y as i32) {
            return false;
        }
        
        let seed = ((x * 7 + y * 13 + self.frame as u32) & 31) as u8;
        let props = get_props(element);
        
        self.grid.set_particle(
            x, y, 
            element, 
            get_color_with_variation(element, seed),
            props.lifetime,
            props.default_temp
        );
        
        // Phase 4: Track particle in chunk
        self.chunks.add_particle(x, y);
        
        self.particle_count += 1;
        true
    }

    /// Add particles in radius (brush)
    pub fn add_particles_in_radius(&mut self, cx: i32, cy: i32, radius: i32, element: u8) {
        let r2 = radius * radius;
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                if dx * dx + dy * dy <= r2 {
                    let x = cx + dx;
                    let y = cy + dy;
                    if x >= 0 && y >= 0 {
                        self.add_particle(x as u32, y as u32, element);
                    }
                }
            }
        }
    }

    /// Remove particle at position
    pub fn remove_particle(&mut self, x: u32, y: u32) -> bool {
        if x >= self.grid.width() || y >= self.grid.height() {
            return false;
        }
        
        if self.grid.is_empty(x as i32, y as i32) {
            return false;
        }
        
        // Phase 4: Track removal in chunk
        self.chunks.remove_particle(x, y);
        self.chunks.mark_dirty(x, y); // Ensure render updates even without movement
        
        self.grid.clear_cell(x, y);
        if self.particle_count > 0 {
            self.particle_count -= 1;
        }
        true
    }

    /// Remove particles in radius
    pub fn remove_particles_in_radius(&mut self, cx: i32, cy: i32, radius: i32) {
        let r2 = radius * radius;
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                if dx * dx + dy * dy <= r2 {
                    let x = cx + dx;
                    let y = cy + dy;
                    if x >= 0 && y >= 0 {
                        self.remove_particle(x as u32, y as u32);
                    }
                }
            }
        }
    }

    /// Clear all particles
    pub fn clear(&mut self) {
        self.grid.clear();
        self.chunks.reset();
        self.particle_count = 0;
        self.frame = 0;
    }
    
    // === RIGID BODY API ===
    
    /// Spawn a rectangular rigid body at position (x, y) with size (w, h)
    /// Returns the body ID
    pub fn spawn_rigid_body(&mut self, x: f32, y: f32, w: i32, h: i32, element_id: u8) -> u32 {
        let body = RigidBody::new_rect(x, y, w, h, element_id, 0);
        self.rigid_bodies.add_body(body, &mut self.grid, &mut self.chunks)
    }
    
    /// Spawn a circular rigid body at position (x, y) with given radius
    /// Returns the body ID
    pub fn spawn_rigid_circle(&mut self, x: f32, y: f32, radius: i32, element_id: u8) -> u32 {
        let body = RigidBody::new_circle(x, y, radius, element_id, 0);
        self.rigid_bodies.add_body(body, &mut self.grid, &mut self.chunks)
    }
    
    /// Remove a rigid body by ID
    pub fn remove_rigid_body(&mut self, id: u32) {
        self.rigid_bodies.remove_body(id);
    }
    
    /// Get number of active rigid bodies
    pub fn rigid_body_count(&self) -> usize {
        self.rigid_bodies.body_count()
    }

    /// Step the simulation forward
    /// Phase 4: Only process active chunks!
    /// Phase 2: Newtonian physics with velocity
    pub fn step(&mut self) {
        let perf_on = self.perf_enabled;
        if perf_on {
            self.perf_stats.reset();
            self.perf_stats_last_speed_max = 0.0;
            // Snapshot pre-step counts
            self.perf_stats.active_chunks = self.chunks.active_chunk_count() as u32;
            self.perf_stats.dirty_chunks = self.chunks.dirty_chunk_count() as u32;
            self.perf_stats.pending_moves = self.grid.pending_moves.count as u32;
            self.perf_stats.particle_count = self.particle_count;
            self.perf_stats.grid_size = self.grid.size() as u32;
            // rough memory estimate of SoA arrays (bytes)
            self.perf_stats.memory_bytes = (self.grid.size() as u32)
                .saturating_mul(20); // types(1)+colors(4)+life(2)+updated(1)+temp(4)+vx(4)+vy(4)
            reset_physics_perf_counters();
            reset_liquid_scan_counter();
            reset_phase_change_counter();
        }
        let step_start = if perf_on { Some(PerfTimer::start()) } else { None };

        // === LAZY HYDRATION: Process waking chunks ===
        // When a chunk transitions Sleep -> Active, we need to fill its air cells
        // with the current virtual_temp (which has been smoothly animating)
        if perf_on {
            let t0 = PerfTimer::start();
            self.hydrate_waking_chunks();
            self.perf_stats.hydrate_ms = t0.elapsed_ms();
        } else {
            self.hydrate_waking_chunks();
        }
        
        // Reset updated flags and clear move tracking
        self.grid.reset_updated();
        self.grid.clear_moves();
        // Refresh sparse markers for rows/chunks (keeps skips accurate)
        self.grid.refresh_chunk_bits();
        
        // Phase 4: Begin frame for chunk tracking
        self.chunks.begin_frame();
        
        // === RIGID BODY PHYSICS ===
        // Update rigid bodies BEFORE particle physics so particles can react to new body positions
        if perf_on {
            let t0 = PerfTimer::start();
            self.rigid_bodies.update(&mut self.grid, &mut self.chunks, self.gravity_y);
            self.perf_stats.rigid_ms = t0.elapsed_ms();
        } else {
            self.rigid_bodies.update(&mut self.grid, &mut self.chunks, self.gravity_y);
        }
        
        // === PHASE 2: PHYSICS PASS ===
        // Apply gravity and velocity-based movement BEFORE behavior pass
        if perf_on {
            let t0 = PerfTimer::start();
            self.process_physics();
            self.perf_stats.physics_ms = t0.elapsed_ms();
        } else {
            self.process_physics();
        }
        
        let go_right = (self.frame & 1) == 0;
        let (chunks_x, chunks_y) = self.chunks.dimensions();
        
        if perf_on {
            let t0 = PerfTimer::start();
            // Process chunks from bottom to top (for gravity)
            if self.gravity_y >= 0.0 {
                for cy in (0..chunks_y).rev() {
                    self.process_chunk_row(cy, chunks_x, go_right);
                }
            } else {
                for cy in 0..chunks_y {
                    self.process_chunk_row(cy, chunks_x, go_right);
                }
            }
            self.perf_stats.chunks_ms = t0.elapsed_ms();
        } else {
            // Process chunks from bottom to top (for gravity)
            if self.gravity_y >= 0.0 {
                for cy in (0..chunks_y).rev() {
                    self.process_chunk_row(cy, chunks_x, go_right);
                }
            } else {
                for cy in 0..chunks_y {
                    self.process_chunk_row(cy, chunks_x, go_right);
                }
            }
        }
        
        // Phase 4.1: Apply recorded moves to chunk system
        if perf_on {
            let t0 = PerfTimer::start();
            self.apply_pending_moves();
            self.perf_stats.apply_moves_ms = t0.elapsed_ms();
        } else {
            self.apply_pending_moves();
        }
        
        // Temperature pass - run every 4th frame for performance
        // Lazy Hydration: now updates virtual_temp for sleeping chunks!
        // PERF: Use bitwise AND instead of modulo (4x less temperature updates)
        if self.frame & 3 == 0 {
            if perf_on {
                let t0 = PerfTimer::start();
                let (temp_processed, air_processed) = process_temperature_grid_chunked(
                    &mut self.grid,
                    &mut self.chunks,  // Now mutable for virtual_temp updates
                    self.ambient_temperature,
                    self.frame,
                    &mut self.rng_state
                );
                self.perf_stats.temperature_ms = t0.elapsed_ms();
                self.perf_stats.temp_cells = temp_processed;
                self.perf_stats.simd_air_cells = air_processed;
            } else {
                process_temperature_grid_chunked(
                    &mut self.grid,
                    &mut self.chunks,  // Now mutable for virtual_temp updates
                    self.ambient_temperature,
                    self.frame,
                    &mut self.rng_state
                );
            }
        }

        if perf_on {
            // Post-step snapshot
            self.perf_stats.active_chunks = self.chunks.active_chunk_count() as u32;
            self.perf_stats.dirty_chunks = self.chunks.dirty_chunk_count() as u32;
            self.perf_stats.pending_moves = self.grid.pending_moves.count as u32;
            self.perf_stats.particle_count = self.particle_count;
            self.perf_stats.move_buffer_overflows = self.grid.pending_moves.overflow_count() as u32;
            self.perf_stats.move_buffer_usage = if self.grid.pending_moves.capacity() > 0 {
                (self.grid.pending_moves.count as f32) / (self.grid.pending_moves.capacity() as f32)
            } else { 0.0 };
            let (ray_steps, ray_collisions) = take_physics_perf_counters();
            self.perf_stats.raycast_steps_total = ray_steps as u32;
            self.perf_stats.raycast_collisions = ray_collisions as u32;
            self.perf_stats.raycast_speed_max = self.perf_stats_last_speed_max;
            self.perf_stats.chunks_woken = self.chunks.woke_this_frame;
            self.perf_stats.chunks_slept = self.chunks.slept_this_frame;
            self.perf_stats.phase_changes = take_phase_change_counter() as u32;
            self.perf_stats.liquid_scans = 0;
            let liquid_scans = take_liquid_scan_counter();
            self.perf_stats.liquid_scans = liquid_scans as u32;
            self.perf_stats.raycast_speed_max = self.perf_stats.raycast_speed_max.max(self.perf_stats_last_speed_max);
            // Full grid scan for non-empty cells (only when perf_enabled)
            let mut non_empty = 0u32;
            for t in self.grid.types.iter() {
                if *t != EL_EMPTY {
                    non_empty = non_empty.saturating_add(1);
                }
            }
            self.perf_stats.non_empty_cells = non_empty;
            // Chunk particle stats
            let mut sum = 0u32;
            let mut maxp = 0u32;
            for &c in self.chunks.particle_counts().iter() {
                sum = sum.saturating_add(c);
                if c > maxp { maxp = c; }
            }
            self.perf_stats.chunk_particle_sum = sum;
            self.perf_stats.chunk_particle_max = maxp;
            if let Some(start) = step_start {
                self.perf_stats.step_ms = start.elapsed_ms();
            }
        }
        
        self.frame += 1;
    }
    
    /// Lazy Hydration: Fill waking chunks with their virtual temperature
    /// This ensures particles entering a previously-sleeping chunk
    /// encounter the correct (smoothly animated) air temperature
    fn hydrate_waking_chunks(&mut self) {
        let (chunks_x, _) = self.chunks.dimensions();
        
        for (idx, &woke) in self.chunks.just_woke_up.iter().enumerate() {
            if woke {
                let cx = (idx as u32) % chunks_x;
                let cy = (idx as u32) / chunks_x;
                let v_temp = self.chunks.virtual_temp[idx];
                
                // Fill all air cells in this chunk with the virtual temperature
                self.grid.hydrate_chunk(cx, cy, v_temp);
            }
        }
        
        // Clear wake flags after processing
        self.chunks.clear_wake_flags();
    }
    
    /// Phase 4.1: Apply all recorded moves to chunk tracking
    /// Zero-allocation: uses raw pointer iteration instead of drain()
    fn apply_pending_moves(&mut self) {
        let count = self.grid.pending_moves.count;
        let moves_ptr = self.grid.pending_moves.as_ptr();
        
        // SAFETY: We iterate only over valid data (0..count)
        // ParticleMove is Copy, so we can read directly
        unsafe {
            for i in 0..count {
                let (from_x, from_y, to_x, to_y) = *moves_ptr.add(i);
                self.chunks.move_particle(from_x, from_y, to_x, to_y);
            }
        }
    }
    
    /// Phase 2: Process physics for all particles in active chunks
    /// Applies gravity and velocity-based movement
    /// 
    /// CRITICAL: Processing order depends on gravity direction!
    /// - Positive gravity (down): process bottom-to-top
    /// - Negative gravity (up): process top-to-bottom
    fn process_physics(&mut self) {
        let (chunks_x, chunks_y) = self.chunks.dimensions();
        let gravity_y = self.gravity_y;
        
        // Choose processing order based on gravity direction
        if gravity_y >= 0.0 {
            // Positive gravity: particles fall DOWN → process bottom-to-top
            for cy in (0..chunks_y).rev() {
                for cx in 0..chunks_x {
                    self.process_physics_chunk(cx, cy, gravity_y, false);
                }
            }
        } else {
            // Negative gravity: particles fly UP → process top-to-bottom
            for cy in 0..chunks_y {
                for cx in 0..chunks_x {
                    self.process_physics_chunk(cx, cy, gravity_y, true);
                }
            }
        }
    }
    
    /// Process physics for a single chunk
    fn process_physics_chunk(&mut self, cx: u32, cy: u32, gravity_y: f32, top_to_bottom: bool) {
        if self.chunks.is_sleeping(cx, cy) {
            return;
        }
        
        let start_x = cx * CHUNK_SIZE;
        let start_y = cy * CHUNK_SIZE;
        let end_x = (start_x + CHUNK_SIZE).min(self.grid.width());
        let end_y = (start_y + CHUNK_SIZE).min(self.grid.height());

        // Sparse skip: if chunk has no non-empty rows, return early
        let mut chunk_has_rows = false;
        for ry in start_y..end_y {
            if self.grid.row_has_data[ry as usize] {
                chunk_has_rows = true;
                break;
            }
        }
        if !chunk_has_rows {
            return;
        }
        
        if top_to_bottom {
            // For negative gravity: process top-to-bottom
            for y in start_y..end_y {
                // PERF: Use row_has_data instead of scanning row (O(1) vs O(32))
                if !self.grid.row_has_data[y as usize] {
                    continue;
                }
                for x in start_x..end_x {
                    let element = self.grid.get_type(x as i32, y as i32);
                    if element != EL_EMPTY {
                        let res = update_particle_physics(&mut self.grid, &mut self.chunks, x, y, gravity_y);
                        if self.perf_enabled {
                            self.perf_stats.physics_calls = self.perf_stats.physics_calls.saturating_add(1);
                            self.perf_stats.raycast_steps_total = self.perf_stats.raycast_steps_total.saturating_add(res.steps);
                            if res.collided { self.perf_stats.raycast_collisions = self.perf_stats.raycast_collisions.saturating_add(1); }
                            if res.speed > self.perf_stats_last_speed_max {
                                self.perf_stats_last_speed_max = res.speed;
                            }
                        }
                    }
                }
            }
        } else {
            // For positive gravity: process bottom-to-top
            for y in (start_y..end_y).rev() {
                // PERF: Use row_has_data instead of scanning row (O(1) vs O(32))
                if !self.grid.row_has_data[y as usize] {
                    continue;
                }
                for x in start_x..end_x {
                    let element = self.grid.get_type(x as i32, y as i32);
                    if element != EL_EMPTY {
                        let res = update_particle_physics(&mut self.grid, &mut self.chunks, x, y, gravity_y);
                        if self.perf_enabled {
                            self.perf_stats.physics_calls = self.perf_stats.physics_calls.saturating_add(1);
                            self.perf_stats.raycast_steps_total = self.perf_stats.raycast_steps_total.saturating_add(res.steps);
                            if res.collided { self.perf_stats.raycast_collisions = self.perf_stats.raycast_collisions.saturating_add(1); }
                            if res.speed > self.perf_stats_last_speed_max {
                                self.perf_stats_last_speed_max = res.speed;
                            }
                        }
                    }
                }
            }
        }
    }
    
    /// Get active chunk count (for debugging/stats)
    pub fn active_chunks(&self) -> usize {
        self.chunks.active_chunk_count()
    }
    
    /// Get total chunk count
    pub fn total_chunks(&self) -> usize {
        self.chunks.total_chunks()
    }

    /// Get pointer to types array (for JS rendering)
    pub fn types_ptr(&self) -> *const u8 {
        self.grid.types_ptr()
    }

    /// Get pointer to colors array (for JS rendering)
    pub fn colors_ptr(&self) -> *const u32 {
        self.grid.colors_ptr()
    }

    /// Get grid size for types
    pub fn types_len(&self) -> usize {
        self.grid.size()
    }

    /// Get grid size for colors
    pub fn colors_len(&self) -> usize {
        self.grid.size() * 4
    }
    
    /// Get pointer to temperature array (for JS thermal rendering)
    pub fn temperature_ptr(&self) -> *const f32 {
        self.grid.temperature_ptr()
    }
    
    /// Get temperature array length
    pub fn temperature_len(&self) -> usize {
        self.grid.size()
    }
    
    // === PHASE 3: SMART RENDERING API ===
    
    /// Collect list of dirty chunks that need rendering
    /// Uses visual_dirty (separate from physics dirty) to avoid state desync
    pub fn collect_dirty_chunks(&mut self) -> usize {
        self.dirty_list.clear();
        let total = self.chunks.total_chunks();
        
        for i in 0..total {
            if self.chunks.visual_dirty[i] {
                self.dirty_list.push(i as u32);
                self.chunks.clear_visual_dirty(i);
            }
        }
        
        self.dirty_list.len()
    }
    
    /// Get pointer to dirty chunk list
    pub fn get_dirty_list_ptr(&self) -> *const u32 {
        self.dirty_list.as_ptr()
    }
    
    /// Extract pixels from a chunk into transfer buffer (strided -> linear)
    /// Returns pointer to the transfer buffer
    pub fn extract_chunk_pixels(&mut self, chunk_idx: u32) -> *const u32 {
        let (cx_count, _) = self.chunks.dimensions();
        let cx = chunk_idx % cx_count;
        let cy = chunk_idx / cx_count;
        
        let start_x = cx * CHUNK_SIZE;
        let start_y = cy * CHUNK_SIZE;
        let end_x = (start_x + CHUNK_SIZE).min(self.grid.width());
        let end_y = (start_y + CHUNK_SIZE).min(self.grid.height());
        
        let grid_width = self.grid.width() as usize;
        let colors_ptr = self.grid.colors.as_ptr();
        let buffer_ptr = self.chunk_transfer_buffer.as_mut_ptr();
        
        let mut buf_idx = 0usize;
        
        unsafe {
            for y in start_y..end_y {
                let row_offset = (y as usize) * grid_width;
                let src_start = row_offset + (start_x as usize);
                let row_len = (end_x - start_x) as usize;
                
                // Fast memcpy for each row
                std::ptr::copy_nonoverlapping(
                    colors_ptr.add(src_start),
                    buffer_ptr.add(buf_idx),
                    row_len
                );
                
                // Move to next row in 32x32 buffer
                buf_idx += CHUNK_SIZE as usize;
            }
        }
        
        self.chunk_transfer_buffer.as_ptr()
    }
    
    /// Get chunk transfer buffer size (32*32 = 1024 pixels * 4 bytes = 4096 bytes)
    pub fn chunk_buffer_byte_size(&self) -> usize {
        (CHUNK_SIZE * CHUNK_SIZE * 4) as usize
    }
    
    /// Get chunks X count (for JS coordinate calculation)
    pub fn chunks_x(&self) -> u32 {
        self.chunks.dimensions().0
    }
    
    /// Get chunks Y count
    pub fn chunks_y(&self) -> u32 {
        self.chunks.dimensions().1
    }
    
    // === PHASE 2: MERGED DIRTY RECTANGLES API ===
    
    /// Collect dirty chunks and merge into rectangles for GPU batching
    /// Returns number of merged rectangles
    /// 
    /// Call get_merged_rect_* functions to get each rectangle's properties
    pub fn collect_merged_rects(&mut self) -> usize {
        // Collect and merge horizontally
        let _count = self.chunks.collect_merged_dirty_rects(&mut self.merged_rects);
        
        // Also try to merge vertically
        self.chunks.merge_vertical(&mut self.merged_rects);
        
        // Clear visual dirty flags for collected chunks
        let total = self.chunks.total_chunks();
        for i in 0..total {
            if self.chunks.visual_dirty[i] {
                self.chunks.clear_visual_dirty(i);
            }
        }
        
        self.merged_rects.count()
    }
    
    /// DEBUG: Count dirty chunks WITHOUT clearing (for logging)
    pub fn count_dirty_chunks(&self) -> usize {
        let mut count = 0;
        for i in 0..self.chunks.total_chunks() {
            if self.chunks.visual_dirty[i] {
                count += 1;
            }
        }
        count
    }
    
    /// Get merged rect X (in pixels)
    pub fn get_merged_rect_x(&self, idx: usize) -> u32 {
        self.merged_rects.get(idx).map(|r| r.cx * CHUNK_SIZE).unwrap_or(0)
    }
    
    /// Get merged rect Y (in pixels)
    pub fn get_merged_rect_y(&self, idx: usize) -> u32 {
        self.merged_rects.get(idx).map(|r| r.cy * CHUNK_SIZE).unwrap_or(0)
    }
    
    /// Get merged rect Width (in pixels)
    pub fn get_merged_rect_w(&self, idx: usize) -> u32 {
        self.merged_rects.get(idx).map(|r| r.cw * CHUNK_SIZE).unwrap_or(0)
    }
    
    /// Get merged rect Height (in pixels)
    pub fn get_merged_rect_h(&self, idx: usize) -> u32 {
        self.merged_rects.get(idx).map(|r| r.ch * CHUNK_SIZE).unwrap_or(0)
    }
    
    /// Extract pixels for a merged rectangle into transfer buffer
    /// Returns pointer to the buffer
    /// 
    /// The buffer is laid out as row-major: width * height pixels
    pub fn extract_rect_pixels(&mut self, idx: usize) -> *const u32 {
        let rect = match self.merged_rects.get(idx) {
            Some(r) => r.clone(),
            None => return self.rect_transfer_buffer.as_ptr(),
        };
        
        let px = rect.cx * CHUNK_SIZE;
        let py = rect.cy * CHUNK_SIZE;
        let pw = rect.cw * CHUNK_SIZE;
        let ph = rect.ch * CHUNK_SIZE;
        
        // Clamp to world bounds
        let end_x = (px + pw).min(self.grid.width());
        let end_y = (py + ph).min(self.grid.height());
        let actual_w = end_x - px;
        let _actual_h = end_y - py;
        
        let grid_width = self.grid.width() as usize;
        let colors_ptr = self.grid.colors.as_ptr();
        let buffer_ptr = self.rect_transfer_buffer.as_mut_ptr();
        
        let mut buf_idx = 0usize;
        
        unsafe {
            for y in py..end_y {
                let row_offset = (y as usize) * grid_width;
                let src_start = row_offset + (px as usize);
                let row_len = actual_w as usize;
                
                std::ptr::copy_nonoverlapping(
                    colors_ptr.add(src_start),
                    buffer_ptr.add(buf_idx),
                    row_len
                );
                
                buf_idx += pw as usize; // Stride is full rect width
            }
        }
        
        self.rect_transfer_buffer.as_ptr()
    }
    
    /// Get the size of the rect transfer buffer in bytes
    pub fn rect_buffer_size(&self) -> usize {
        self.rect_transfer_buffer.len() * 4
    }
}

// Private simulation methods
impl World {
    /// Process a row of chunks
    fn process_chunk_row(&mut self, cy: u32, chunks_x: u32, go_right: bool) {
        if go_right {
            for cx in 0..chunks_x {
                self.process_chunk(cx, cy, go_right);
            }
        } else {
            for cx in (0..chunks_x).rev() {
                self.process_chunk(cx, cy, go_right);
            }
        }
    }
    
    /// Process a single chunk
    fn process_chunk(&mut self, cx: u32, cy: u32, go_right: bool) {
        // Skip sleeping chunks with no activity
        if !self.chunks.should_process(cx, cy) {
            return;
        }
        
        // Calculate pixel bounds for this chunk
        let start_x = cx * CHUNK_SIZE;
        let start_y = cy * CHUNK_SIZE;
        let end_x = (start_x + CHUNK_SIZE).min(self.grid.width());
        let end_y = (start_y + CHUNK_SIZE).min(self.grid.height());
        
        let mut had_movement = false;
        let width = self.grid.width() as usize;
        
        // Process rows within chunk (bottom to top for gravity)
        if self.gravity_y >= 0.0 {
            for y in (start_y..end_y).rev() {
                // Sparse skip: check row_has_data
                if !self.grid.row_has_data[y as usize] {
                    continue;
                }
                if go_right {
                    for x in start_x..end_x {
                        let moved = self.update_particle_chunked(x, y);
                        if self.perf_enabled {
                            self.perf_stats.particles_processed += 1;
                            if moved {
                                self.perf_stats.particles_moved += 1;
                            }
                        }
                        if moved {
                            had_movement = true;
                        }
                    }
                } else {
                    for x in (start_x..end_x).rev() {
                        let moved = self.update_particle_chunked(x, y);
                        if self.perf_enabled {
                            self.perf_stats.particles_processed += 1;
                            if moved {
                                self.perf_stats.particles_moved += 1;
                            }
                        }
                        if moved {
                            had_movement = true;
                        }
                    }
                }
            }
        } else {
            for y in start_y..end_y {
                // Sparse skip: check row_has_data
                if !self.grid.row_has_data[y as usize] {
                    continue;
                }
                if go_right {
                    for x in start_x..end_x {
                        let moved = self.update_particle_chunked(x, y);
                        if self.perf_enabled {
                            self.perf_stats.particles_processed += 1;
                            if moved {
                                self.perf_stats.particles_moved += 1;
                            }
                        }
                        if moved {
                            had_movement = true;
                        }
                    }
                } else {
                    for x in (start_x..end_x).rev() {
                        let moved = self.update_particle_chunked(x, y);
                        if self.perf_enabled {
                            self.perf_stats.particles_processed += 1;
                            if moved {
                                self.perf_stats.particles_moved += 1;
                            }
                        }
                        if moved {
                            had_movement = true;
                        }
                    }
                }
            }
        }
        
        // Update chunk state
        self.chunks.end_chunk_update(cx, cy, had_movement);
    }
    
    /// Update particle and return true if it moved
    /// PHASE 1: Optimized with unsafe access - coordinates are guaranteed valid by process_chunk bounds
    fn update_particle_chunked(&mut self, x: u32, y: u32) -> bool {
        // SAFETY: x,y are bounded by process_chunk's min() calls
        unsafe {
            // Fast type read without bounds check
            let element = self.grid.get_type_unchecked(x, y);
            if element == EL_EMPTY { return false; }
            
            // Element ID bounds check (data could be corrupted)
            if (element as usize) >= ELEMENT_COUNT {
                self.grid.clear_cell_unchecked(x, y);
                return false;
            }
            
            let idx = self.grid.index_unchecked(x, y);
            
            // Fast updated check
            if self.grid.is_updated_unchecked(idx) { return false; }
            
            // Fast set updated
            self.grid.set_updated_unchecked(idx, true);
            
            // Handle lifetime with fast access
            let life = self.grid.get_life_unchecked(idx);
            if life > 0 {
                self.grid.set_life_unchecked(idx, life - 1);
                if life - 1 == 0 {
                    self.grid.clear_cell_unchecked(x, y);
                    self.chunks.remove_particle(x, y);
                    if self.particle_count > 0 {
                        self.particle_count -= 1;
                    }
                    return true; // Particle disappeared = activity
                }
            }
            
            // Get category and dispatch to behavior
            let category = ELEMENT_DATA[element as usize].category;
            
            // PERF: Skip solid and utility - they have no behavior
            if category == CAT_SOLID || category == CAT_UTILITY {
                return false;
            }
            
            // Remember position before update
            let old_type = element;
            
            // Create update context
            let mut ctx = UpdateContext {
                grid: &mut self.grid,
                chunks: &mut self.chunks,
                x,
                y,
                frame: self.frame,
                gravity_x: self.gravity_x,
                gravity_y: self.gravity_y,
                ambient_temp: self.ambient_temperature,
                rng: &mut self.rng_state,
            };
            
            // Delegate to behavior registry with perf timing
            if self.perf_enabled {
                let t_beh = PerfTimer::start();
                self.behaviors.update(category, &mut ctx);
                let dur = t_beh.elapsed_ms();
                self.perf_stats.behavior_calls = self.perf_stats.behavior_calls.saturating_add(1);
                match category {
                    CAT_POWDER => {
                        self.perf_stats.behavior_powder = self.perf_stats.behavior_powder.saturating_add(1);
                        self.perf_stats.powder_ms += dur;
                    }
                    CAT_LIQUID => {
                        self.perf_stats.behavior_liquid = self.perf_stats.behavior_liquid.saturating_add(1);
                        self.perf_stats.liquid_ms += dur;
                    }
                    CAT_GAS => {
                        self.perf_stats.behavior_gas = self.perf_stats.behavior_gas.saturating_add(1);
                        self.perf_stats.gas_ms += dur;
                    }
                    CAT_ENERGY => {
                        self.perf_stats.behavior_energy = self.perf_stats.behavior_energy.saturating_add(1);
                        self.perf_stats.energy_ms += dur;
                    }
                    CAT_UTILITY => {
                        self.perf_stats.behavior_utility = self.perf_stats.behavior_utility.saturating_add(1);
                        self.perf_stats.utility_ms += dur;
                    }
                    CAT_BIO => {
                        self.perf_stats.behavior_bio = self.perf_stats.behavior_bio.saturating_add(1);
                        self.perf_stats.bio_ms += dur;
                    }
                    _ => {}
                }
            } else {
                self.behaviors.update(category, &mut ctx);
            }
            
            // Drop ctx to release borrows
            drop(ctx);
            
            // Check if particle moved (cell is now empty or different)
            let new_type = self.grid.get_type_unchecked(x, y);
            let moved = new_type != old_type || new_type == EL_EMPTY;
            
            if moved {
                // Wake neighbors if particle moved
                self.chunks.wake_neighbors(x, y);
            }
            
            // Process chemical reactions AFTER movement (EXACT TypeScript)
            let current_type = self.grid.get_type_unchecked(x, y);
            if current_type != EL_EMPTY {
                self.process_reactions(x, y, current_type);
            }
            
            moved
        }
    }
    
    // Legacy method for compatibility
    fn process_row(&mut self, y: u32, w: u32, go_right: bool) {
        if go_right {
            for x in 0..w {
                self.update_particle(x, y);
            }
        } else {
            for x in (0..w).rev() {
                self.update_particle(x, y);
            }
        }
    }

    fn update_particle(&mut self, x: u32, y: u32) {
        let xi = x as i32;
        let yi = y as i32;
        
        let element = self.grid.get_type(xi, yi);
        if element == EL_EMPTY { return; }
        
        // Bounds check for element ID
        if (element as usize) >= ELEMENT_COUNT {
            self.grid.clear_cell(x, y);
            return;
        }
        
        if self.grid.is_updated(x, y) { return; }
        
        self.grid.set_updated(x, y, true);
        
        // Handle lifetime
        let life = self.grid.get_life(x, y);
        if life > 0 {
            self.grid.set_life(x, y, life - 1);
            if life - 1 == 0 {
                self.grid.clear_cell(x, y);
                if self.particle_count > 0 {
                    self.particle_count -= 1;
                }
                return;
            }
        }
        
        // Get category and dispatch to behavior
        let category = ELEMENT_DATA[element as usize].category;
        
        // Create update context
        let mut ctx = UpdateContext {
            grid: &mut self.grid,
            chunks: &mut self.chunks,
            x,
            y,
            frame: self.frame,
            gravity_x: self.gravity_x,
            gravity_y: self.gravity_y,
            ambient_temp: self.ambient_temperature,
            rng: &mut self.rng_state,
        };
        
        if self.perf_enabled {
            let t_beh = PerfTimer::start();
            self.behaviors.update(category, &mut ctx);
            let dur = t_beh.elapsed_ms();
            self.perf_stats.behavior_calls = self.perf_stats.behavior_calls.saturating_add(1);
            match category {
                CAT_POWDER => {
                    self.perf_stats.behavior_powder = self.perf_stats.behavior_powder.saturating_add(1);
                    self.perf_stats.powder_ms += dur;
                }
                CAT_LIQUID => {
                    self.perf_stats.behavior_liquid = self.perf_stats.behavior_liquid.saturating_add(1);
                    self.perf_stats.liquid_ms += dur;
                }
                CAT_GAS => {
                    self.perf_stats.behavior_gas = self.perf_stats.behavior_gas.saturating_add(1);
                    self.perf_stats.gas_ms += dur;
                }
                CAT_ENERGY => {
                    self.perf_stats.behavior_energy = self.perf_stats.behavior_energy.saturating_add(1);
                    self.perf_stats.energy_ms += dur;
                }
                CAT_UTILITY => {
                    self.perf_stats.behavior_utility = self.perf_stats.behavior_utility.saturating_add(1);
                    self.perf_stats.utility_ms += dur;
                }
                CAT_BIO => {
                    self.perf_stats.behavior_bio = self.perf_stats.behavior_bio.saturating_add(1);
                    self.perf_stats.bio_ms += dur;
                }
                _ => {}
            }
        } else {
            self.behaviors.update(category, &mut ctx);
        }
        
        // Process chemical reactions AFTER movement (EXACT TypeScript)
        let current_type = self.grid.get_type(x as i32, y as i32);
        if current_type != EL_EMPTY {
            self.process_reactions(x, y, current_type);
        }
    }
    
    /// Process chemical reactions (mirrors TypeScript processReactionsTyped)
    fn process_reactions(&mut self, x: u32, y: u32, element: ElementId) {
        if self.perf_enabled {
            self.perf_stats.reactions_checked = self.perf_stats.reactions_checked.saturating_add(1);
        }
        // Pick a random neighbor
        // PHASE 1 OPT: & 3 instead of % 4 (saves ~40 CPU cycles)
        let dir = xorshift32(&mut self.rng_state) & 3;
        let xi = x as i32;
        let yi = y as i32;
        
        let (nx, ny) = match dir {
            0 => (xi, yi - 1),     // Up
            1 => (xi, yi + 1),     // Down
            2 => (xi - 1, yi),     // Left
            _ => (xi + 1, yi),     // Right
        };
        
        if !self.grid.in_bounds(nx, ny) { return; }
        
        let neighbor_type = self.grid.get_type(nx, ny);
        if neighbor_type == EL_EMPTY { return; }
        
        // Phase 1: O(1) reaction lookup from LUT
        if let Some(reaction) = self.reactions.get(element, neighbor_type) {
            // Roll the dice (chance is 0-255 in new system)
            let roll = (xorshift32(&mut self.rng_state) & 0xFF) as u8;
            if roll >= reaction.chance { return; }
            
            // Copy reaction to release the borrow before apply
            let r = *reaction;
            self.apply_reaction(x, y, nx as u32, ny as u32, &r);
        }
    }
    
    /// Apply a bilateral reaction (mirrors TypeScript applyReaction)
    fn apply_reaction(&mut self, src_x: u32, src_y: u32, target_x: u32, target_y: u32, reaction: &Reaction) {
        if self.perf_enabled {
            self.perf_stats.reactions_applied = self.perf_stats.reactions_applied.saturating_add(1);
        }
        // A. Transform the TARGET (victim)
        if reaction.target_becomes == EL_EMPTY {
            self.remove_particle(target_x, target_y);
        } else {
            self.replace_particle(target_x, target_y, reaction.target_becomes);
        }
        
        // B. Transform the SOURCE (aggressor) - BILATERAL!
        if reaction.source_becomes != Reaction::NO_CHANGE {
            if reaction.source_becomes == EL_EMPTY {
                self.remove_particle(src_x, src_y);
            } else {
                self.replace_particle(src_x, src_y, reaction.source_becomes);
            }
        }
        
        // C. Spawn byproduct (smoke, steam)
        if reaction.spawn != EL_EMPTY {
            let sxi = src_x as i32;
            let syi = src_y as i32;
            let txi = target_x as i32;
            let tyi = target_y as i32;
            
            // Try to spawn above the reaction site
            if self.grid.is_empty(sxi, syi - 1) {
                self.add_particle(src_x, (syi - 1) as u32, reaction.spawn);
            } else if self.grid.is_empty(txi, tyi - 1) {
                self.add_particle(target_x, (tyi - 1) as u32, reaction.spawn);
            }
        }
    }
    
    /// Replace a particle with a new element type
    /// PRESERVES temperature like TypeScript! Hot stone from lava stays hot
    fn replace_particle(&mut self, x: u32, y: u32, element: ElementId) {
        let seed = ((x * 7 + y * 13 + self.frame as u32) & 31) as u8;
        let props = &ELEMENT_DATA[element as usize];
        
        // Save current temperature BEFORE replacing
        let current_temp = self.grid.get_temp(x as i32, y as i32);
        
        self.grid.set_particle(
            x, y,
            element,
            get_color_with_variation(element, seed),
            props.lifetime,
            current_temp  // Keep temperature! (was: props.default_temp)
        );
        
        // Mark as updated
        self.grid.set_updated(x, y, true);
        
        // CRITICAL: Mark chunk as dirty for rendering!
        // Without this, reactions don't trigger re-render!
        self.chunks.mark_dirty(x, y);
    }
}
