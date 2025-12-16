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
use crate::grid::Grid;
use crate::chunks::{ChunkGrid, CHUNK_SIZE, MergedDirtyRects};
use crate::elements::{
    ELEMENT_DATA, ElementId, EL_EMPTY, ELEMENT_COUNT,
    get_color_with_variation, get_props, CAT_SOLID, CAT_POWDER, CAT_LIQUID, CAT_GAS, CAT_ENERGY, CAT_UTILITY, CAT_BIO
};
use crate::behaviors::{BehaviorRegistry, UpdateContext};
use crate::reactions::{Reaction, ReactionSystem};
use crate::rigid_body_system::RigidBodySystem;

mod perf_timer;
mod perf_stats;
mod random;
mod hydration;
mod moves;
mod reactions;
mod update;
mod physics;
mod step;
mod chunk_processing;
mod render_extract;
mod api;
mod rigid;

use perf_timer::PerfTimer;
use perf_stats::PerfStats;


/// Random number generator (xorshift32)
#[inline]
fn xorshift32(state: &mut u32) -> u32 {
    random::xorshift32(state)
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
    rect_transfer_buffer: Vec<u32>, // Reused buffer for merged-rect extraction (resized on demand)

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
            // Start with a small buffer; `extract_rect_pixels` will resize on demand.
            rect_transfer_buffer: vec![0u32; (CHUNK_SIZE * CHUNK_SIZE) as usize],

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
        api::add_particle(self, x, y, element)
    }

    /// Add particles in radius (brush)
    pub fn add_particles_in_radius(&mut self, cx: i32, cy: i32, radius: i32, element: u8) {
        api::add_particles_in_radius(self, cx, cy, radius, element)
    }

    /// Remove particle at position
    pub fn remove_particle(&mut self, x: u32, y: u32) -> bool {
        api::remove_particle(self, x, y)
    }

    /// Remove particles in radius
    pub fn remove_particles_in_radius(&mut self, cx: i32, cy: i32, radius: i32) {
        api::remove_particles_in_radius(self, cx, cy, radius)
    }

    /// Clear all particles
    pub fn clear(&mut self) {
        api::clear(self)
    }
    
    // === RIGID BODY API ===
    
    /// Spawn a rectangular rigid body at position (x, y) with size (w, h)
    /// Returns the body ID
    pub fn spawn_rigid_body(&mut self, x: f32, y: f32, w: i32, h: i32, element_id: u8) -> u32 {
        rigid::spawn_rigid_body(self, x, y, w, h, element_id)
    }
    
    /// Spawn a circular rigid body at position (x, y) with given radius
    /// Returns the body ID
    pub fn spawn_rigid_circle(&mut self, x: f32, y: f32, radius: i32, element_id: u8) -> u32 {
        rigid::spawn_rigid_circle(self, x, y, radius, element_id)
    }
    
    /// Remove a rigid body by ID
    pub fn remove_rigid_body(&mut self, id: u32) {
        rigid::remove_rigid_body(self, id)
    }
    
    /// Get number of active rigid bodies
    pub fn rigid_body_count(&self) -> usize {
        rigid::rigid_body_count(self)
    }

    /// Step the simulation forward
    /// Phase 4: Only process active chunks!
    /// Phase 2: Newtonian physics with velocity
    pub fn step(&mut self) {
        step::step(self);
    }
    
    /// Lazy Hydration: Fill waking chunks with their virtual temperature
    /// This ensures particles entering a previously-sleeping chunk
    /// encounter the correct (smoothly animated) air temperature
    fn hydrate_waking_chunks(&mut self) {
        hydration::hydrate_waking_chunks(self);
    }
    
    /// Phase 4.1: Apply all recorded moves to chunk tracking
    /// Zero-allocation: uses raw pointer iteration instead of drain()
    fn apply_pending_moves(&mut self) {
        moves::apply_pending_moves(self);
    }
    
    /// Phase 2: Process physics for all particles in active chunks
    /// Applies gravity and velocity-based movement
    /// 
    /// CRITICAL: Processing order depends on gravity direction!
    /// - Positive gravity (down): process bottom-to-top
    /// - Negative gravity (up): process top-to-bottom
    fn process_physics(&mut self) {
        physics::process_physics(self);
    }
    
    /// Process physics for a single chunk
    fn process_physics_chunk(&mut self, cx: u32, cy: u32, gravity_x: f32, gravity_y: f32, top_to_bottom: bool) {
        physics::process_physics_chunk(self, cx, cy, gravity_x, gravity_y, top_to_bottom);
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
        render_extract::collect_dirty_chunks(self)
    }
    
    /// Get pointer to dirty chunk list
    pub fn get_dirty_list_ptr(&self) -> *const u32 {
        self.dirty_list.as_ptr()
    }
    
    /// Extract pixels from a chunk into transfer buffer (strided -> linear)
    /// Returns pointer to the transfer buffer
    pub fn extract_chunk_pixels(&mut self, chunk_idx: u32) -> *const u32 {
        render_extract::extract_chunk_pixels(self, chunk_idx)
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
        render_extract::collect_merged_rects(self)
    }
    
    /// DEBUG: Count dirty chunks WITHOUT clearing (for logging)
    pub fn count_dirty_chunks(&self) -> usize {
        render_extract::count_dirty_chunks(self)
    }
    
    /// Get merged rect X (in pixels)
    pub fn get_merged_rect_x(&self, idx: usize) -> u32 {
        render_extract::get_merged_rect_x(self, idx)
    }
    
    /// Get merged rect Y (in pixels)
    pub fn get_merged_rect_y(&self, idx: usize) -> u32 {
        render_extract::get_merged_rect_y(self, idx)
    }
    
    /// Get merged rect Width (in pixels)
    pub fn get_merged_rect_w(&self, idx: usize) -> u32 {
        render_extract::get_merged_rect_w(self, idx)
    }
    
    /// Get merged rect Height (in pixels)
    pub fn get_merged_rect_h(&self, idx: usize) -> u32 {
        render_extract::get_merged_rect_h(self, idx)
    }
    
    /// Extract pixels for a merged rectangle into transfer buffer
    /// Returns pointer to the buffer
    /// 
    /// The buffer is laid out as row-major: width * height pixels
    pub fn extract_rect_pixels(&mut self, idx: usize) -> *const u32 {
        render_extract::extract_rect_pixels(self, idx)
    }
    
    /// Get the size of the rect transfer buffer in bytes
    pub fn rect_buffer_size(&self) -> usize {
        render_extract::rect_buffer_size(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chunks::DirtyRect;
    use crate::elements::{EL_CLONE, EL_SAND, EL_STONE, EL_VOID};

    #[test]
    fn extract_rect_pixels_clamps_and_is_tightly_packed() {
        let mut world = World::new(100, 100);

        for (i, c) in world.grid.colors.iter_mut().enumerate() {
            *c = i as u32;
        }

        // Rect starting at x=64 with width=64 (clamps to x..100 => 36px wide)
        world.merged_rects.clear();
        world.merged_rects.push(DirtyRect {
            cx: 2,
            cy: 0,
            cw: 2,
            ch: 1,
        });

        world.extract_rect_pixels(0);

        let actual_w = 100 - (2 * CHUNK_SIZE);
        let actual_h = CHUNK_SIZE;
        let expected_len = (actual_w as usize) * (actual_h as usize);
        assert!(world.rect_transfer_buffer.len() >= expected_len);

        let buf = &world.rect_transfer_buffer[..expected_len];

        // First row should be grid[0, 64..99]
        assert_eq!(buf[0], 64);
        assert_eq!(buf[(actual_w as usize) - 1], 99);
        // Second row should start immediately after `actual_w` (tightly packed)
        assert_eq!(buf[actual_w as usize], 100 + 64);
    }

    #[test]
    fn extract_rect_pixels_resizes_for_large_rects() {
        let size = (CHUNK_SIZE * 5) as u32; // 160px
        let mut world = World::new(size, size);

        world.merged_rects.clear();
        world.merged_rects.push(DirtyRect {
            cx: 0,
            cy: 0,
            cw: 5,
            ch: 5,
        });

        world.extract_rect_pixels(0);

        let expected = (size as usize) * (size as usize);
        assert!(world.rect_transfer_buffer.len() >= expected);
    }

    #[test]
    fn utility_clone_spawns_and_updates_counts() {
        let mut world = World::new(64, 64);

        // Donor above clone (Up is checked first).
        assert!(world.add_particle(10, 9, EL_STONE));
        assert!(world.add_particle(10, 10, EL_CLONE));
        assert_eq!(world.particle_count(), 2);

        world.step();

        // Frame=0 clone starts checking from Up then Down; Down should be empty and get cloned.
        assert_eq!(world.grid.get_type(10, 11), EL_STONE);
        assert_eq!(world.particle_count(), 3);
    }

    #[test]
    fn utility_void_destroys_and_updates_counts() {
        let mut world = World::new(64, 64);

        assert!(world.add_particle(10, 9, EL_STONE));
        assert!(world.add_particle(10, 10, EL_VOID));
        assert_eq!(world.particle_count(), 2);

        world.step();

        assert_eq!(world.grid.get_type(10, 9), EL_EMPTY);
        assert_eq!(world.particle_count(), 1);
    }

    #[test]
    fn gravity_x_pushes_particles_horizontally() {
        let mut world = World::new(64, 64);
        world.set_gravity(10.0, 0.0);

        assert!(world.add_particle(30, 30, EL_SAND));
        world.step();

        // With gravity_x=10, sand should move right on the first step.
        assert_eq!(world.grid.get_type(30, 30), EL_EMPTY);
        let mut found = None;
        for yy in 0..64 {
            for xx in 0..64 {
                if world.grid.get_type(xx, yy) == EL_SAND {
                    found = Some((xx, yy));
                    break;
                }
            }
            if found.is_some() {
                break;
            }
        }
        let (nx, ny) = found.expect("sand should still exist");
        assert_eq!(ny, 30);
        assert!(nx > 30);
    }

    #[test]
    fn spawn_rigid_body_rasterizes_and_counts_pixels() {
        let mut world = World::new(64, 64);

        let id = world.spawn_rigid_body(20.0, 20.0, 10, 10, EL_STONE);
        assert_ne!(id, 0);
        assert_eq!(world.rigid_body_count(), 1);

        // 10x10 input becomes (2*(10/2)+1)^2 = 11*11 pixels.
        assert_eq!(world.particle_count(), 121);
        assert_eq!(world.grid.get_type(20, 20), EL_STONE);
    }

    #[test]
    fn cross_chunk_swap_of_two_particles_keeps_chunk_counts() {
        let mut world = World::new(64, 64);

        let y = 10;
        let left_x = CHUNK_SIZE - 1;
        let right_x = CHUNK_SIZE;

        assert!(world.add_particle(left_x, y, EL_STONE));
        assert!(world.add_particle(right_x, y, EL_SAND));

        let left_chunk = world.chunks.chunk_index(left_x, y);
        let right_chunk = world.chunks.chunk_index(right_x, y);
        assert_ne!(left_chunk, right_chunk);
        assert_eq!(world.chunks.particle_counts()[left_chunk], 1);
        assert_eq!(world.chunks.particle_counts()[right_chunk], 1);

        world.grid.clear_moves();
        unsafe { world.grid.swap_unchecked(left_x, y, right_x, y) };
        assert_eq!(world.grid.pending_moves.count, 2);

        world.apply_pending_moves();
        assert_eq!(world.chunks.particle_counts()[left_chunk], 1);
        assert_eq!(world.chunks.particle_counts()[right_chunk], 1);
    }
}

// Private simulation methods
impl World {
    /// Process a row of chunks
    fn process_chunk_row(&mut self, cy: u32, chunks_x: u32, go_right: bool) {
        chunk_processing::process_chunk_row(self, cy, chunks_x, go_right);
    }
    
    /// Process a single chunk
    fn process_chunk(&mut self, cx: u32, cy: u32, go_right: bool) {
        chunk_processing::process_chunk(self, cx, cy, go_right);
    }
    
    /// Update particle and return true if it moved
    /// PHASE 1: Optimized with unsafe access - coordinates are guaranteed valid by process_chunk bounds
    fn update_particle_chunked(&mut self, x: u32, y: u32) -> bool {
        update::update_particle_chunked(self, x, y)
    }
    
    /// Process chemical reactions (mirrors TypeScript processReactionsTyped)
    fn process_reactions(&mut self, x: u32, y: u32, element: ElementId) {
        reactions::process_reactions(self, x, y, element)
    }
    
    /// Apply a bilateral reaction (mirrors TypeScript applyReaction)
    fn apply_reaction(&mut self, src_x: u32, src_y: u32, target_x: u32, target_y: u32, reaction: &Reaction) {
        reactions::apply_reaction(self, src_x, src_y, target_x, target_y, reaction);
    }
    
    /// Replace a particle with a new element type
    /// PRESERVES temperature like TypeScript! Hot stone from lava stays hot
    fn replace_particle(&mut self, x: u32, y: u32, element: ElementId) {
        reactions::replace_particle(self, x, y, element);
    }
}
