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

use std::sync::Arc;

use crate::grid::Grid;
use crate::chunks::ChunkGrid;
use crate::domain::content::ContentRegistry;
use crate::elements::ElementId;
use crate::behaviors::BehaviorRegistry;
use crate::reactions::Reaction;
use crate::rigid_body_system::RigidBodySystem;

#[path = "perf/perf_timer.rs"]
mod perf_timer;
#[path = "perf/perf_stats.rs"]
mod perf_stats;
#[path = "init/random.rs"]
mod random;
#[path = "step/step_reactions.rs"]
mod step_reactions;
#[path = "step/update.rs"]
mod update;
#[path = "step/step_physics.rs"]
mod step_physics;
#[path = "step/step.rs"]
mod step;
#[path = "step/chunk_processing.rs"]
mod chunk_processing;
#[path = "commands/commands.rs"]
mod commands;
#[path = "rigid/rigid.rs"]
mod rigid;
#[path = "init/init.rs"]
mod init;
#[path = "init/settings.rs"]
mod settings;
mod facade;

pub use facade::World;
pub use perf_stats::PerfStats;

use perf_timer::PerfTimer;

/// Random number generator (xorshift32)
#[inline]
fn xorshift32(state: &mut u32) -> u32 {
    random::xorshift32(state)
}

pub(crate) struct AbiLayoutData {
    pub(crate) types_ptr: *const u8,
    pub(crate) types_len_elements: usize,
    pub(crate) types_len_bytes: usize,
    pub(crate) colors_ptr: *const u32,
    pub(crate) colors_len_elements: usize,
    pub(crate) colors_len_bytes: usize,
    pub(crate) temperature_ptr: *const f32,
    pub(crate) temperature_len_elements: usize,
    pub(crate) temperature_len_bytes: usize,
}

/// The simulation world
pub struct WorldCore {
    content: Arc<ContentRegistry>,
    grid: Grid,
    chunks: ChunkGrid,
    behaviors: BehaviorRegistry,
    rigid_bodies: RigidBodySystem,  // Rigid body physics system
    
    // Settings
    gravity_x: f32,
    gravity_y: f32,
    ambient_temperature: f32,
    
    // State
    particle_count: u32,
    frame: u64,
    rng_state: u32,

    // Perf metrics
    perf_enabled: bool,
    perf_detailed: bool,
    perf_stats: PerfStats,
    perf_stats_last_speed_max: f32,
}

impl WorldCore {
    /// Create a new world with given dimensions
    pub fn new(width: u32, height: u32) -> Self {
        init::create_world_core(width, height)
    }

    pub fn load_content_bundle_json(&mut self, json: &str) -> Result<(), String> {
        let registry = ContentRegistry::from_bundle_json(json)?;
        self.content = Arc::new(registry);
        self.clear();
        Ok(())
    }

    pub fn get_content_manifest_json(&self) -> String {
        self.content.manifest_json()
    }

    pub fn width(&self) -> u32 { self.grid.width() }

    pub fn height(&self) -> u32 { self.grid.height() }

    pub fn particle_count(&self) -> u32 { self.particle_count }

    pub fn frame(&self) -> u64 { self.frame }

    /// Enable or disable per-step perf metrics (adds timing overhead when enabled)
    pub fn enable_perf_metrics(&mut self, enabled: bool) {
        settings::enable_perf_metrics(self, enabled);
    }

    pub fn enable_perf_detailed_metrics(&mut self, enabled: bool) {
        settings::enable_perf_detailed_metrics(self, enabled);
    }

    /// Get last step perf snapshot (zeros when perf disabled)
    pub fn get_perf_stats(&self) -> PerfStats {
        settings::get_perf_stats(self)
    }

    pub fn set_gravity(&mut self, x: f32, y: f32) {
        settings::set_gravity(self, x, y);
    }

    pub fn set_ambient_temperature(&mut self, temp: f32) {
        settings::set_ambient_temperature(self, temp);
    }
    
    /// DEBUG: Get current ambient temperature
    pub fn get_ambient_temperature(&self) -> f32 {
        settings::get_ambient_temperature(self)
    }

    /// Add a particle at position
    pub fn add_particle(&mut self, x: u32, y: u32, element: u8) -> bool {
        commands::add_particle(self, x, y, element)
    }

    /// Add particles in radius (brush)
    pub fn add_particles_in_radius(&mut self, cx: i32, cy: i32, radius: i32, element: u8) {
        commands::add_particles_in_radius(self, cx, cy, radius, element)
    }

    /// Remove particle at position
    pub fn remove_particle(&mut self, x: u32, y: u32) -> bool {
        commands::remove_particle(self, x, y)
    }

    /// Remove particles in radius
    pub fn remove_particles_in_radius(&mut self, cx: i32, cy: i32, radius: i32) {
        commands::remove_particles_in_radius(self, cx, cy, radius)
    }

    /// Clear all particles
    pub fn clear(&mut self) {
        commands::clear(self)
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
    
    /// Phase 2: Process physics for all particles in active chunks
    /// Applies gravity and velocity-based movement
    /// 
    /// CRITICAL: Processing order depends on gravity direction!
    /// - Positive gravity (down): process bottom-to-top
    /// - Negative gravity (up): process top-to-bottom
    fn process_physics(&mut self) {
        step_physics::process_physics(self);
    }
    
    /// Process physics for a single chunk
    fn process_physics_chunk(&mut self, cx: u32, cy: u32, gravity_x: f32, gravity_y: f32, top_to_bottom: bool) {
        step_physics::process_physics_chunk(self, cx, cy, gravity_x, gravity_y, top_to_bottom);
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
        self.colors_len_elements()
    }

    pub fn colors_len_elements(&self) -> usize {
        self.grid.size()
    }

    pub fn colors_len_bytes(&self) -> usize {
        self.grid.size() * std::mem::size_of::<u32>()
    }

    pub fn colors_elements_len(&self) -> usize {
        self.colors_len_elements()
    }

    pub fn types_byte_len(&self) -> usize {
        self.grid.size()
    }

    pub fn colors_byte_len(&self) -> usize {
        self.colors_len_bytes()
    }

    pub fn temperature_byte_len(&self) -> usize {
        self.grid.size() * std::mem::size_of::<f32>()
    }
    
    /// Get pointer to temperature array (for JS thermal rendering)
    pub fn temperature_ptr(&self) -> *const f32 {
        self.grid.temperature_ptr()
    }
    
    /// Get temperature array length
    pub fn temperature_len(&self) -> usize {
        self.grid.size()
    }

    /// Get chunks X count (for JS coordinate calculation)
    pub fn chunks_x(&self) -> u32 {
        self.chunks.dimensions().0
    }

    /// Get chunks Y count
    pub fn chunks_y(&self) -> u32 {
        self.chunks.dimensions().1
    }

    pub(crate) fn abi_layout_data(&self) -> AbiLayoutData {
        AbiLayoutData {
            types_ptr: self.types_ptr(),
            types_len_elements: self.types_len(),
            types_len_bytes: self.types_byte_len(),
            colors_ptr: self.colors_ptr(),
            colors_len_elements: self.colors_len_elements(),
            colors_len_bytes: self.colors_len_bytes(),
            temperature_ptr: self.temperature_ptr(),
            temperature_len_elements: self.temperature_len(),
            temperature_len_bytes: self.temperature_byte_len(),
        }
    }
}

#[cfg(test)]
#[path = "tests/tests.rs"]
mod tests;

// Private simulation methods
impl WorldCore {
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
        step_reactions::process_reactions(self, x, y, element)
    }
    
    /// Apply a bilateral reaction (mirrors TypeScript applyReaction)
    fn apply_reaction(&mut self, src_x: u32, src_y: u32, target_x: u32, target_y: u32, reaction: &Reaction) {
        step_reactions::apply_reaction(self, src_x, src_y, target_x, target_y, reaction);
    }
    
    /// Replace a particle with a new element type
    /// PRESERVES temperature like TypeScript! Hot stone from lava stays hot
    fn replace_particle(&mut self, x: u32, y: u32, element: ElementId) {
        step_reactions::replace_particle(self, x, y, element);
    }
}
