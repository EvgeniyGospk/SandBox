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
use crate::chunks::{ChunkGrid, CHUNK_SIZE};
use crate::elements::{
    ELEMENT_DATA, ElementId, EL_EMPTY, ELEMENT_COUNT,
    get_color_with_variation, get_props
};
use crate::behaviors::{BehaviorRegistry, UpdateContext};
use crate::reactions::{get_reaction, Reaction};
use crate::temperature::process_temperature_grid_chunked;

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
    
    // Settings
    gravity_x: f32,
    gravity_y: f32,
    ambient_temperature: f32,
    
    // State
    particle_count: u32,
    frame: u64,
    rng_state: u32,
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
            gravity_x: 0.0,
            gravity_y: 1.0,
            ambient_temperature: 20.0,
            particle_count: 0,
            frame: 0,
            rng_state: 12345,
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

    pub fn set_gravity(&mut self, x: f32, y: f32) {
        // Match TypeScript: gx/gy = sign of gravity, can be 0
        self.gravity_x = if x > 0.0 { 1.0 } else if x < 0.0 { -1.0 } else { 0.0 };
        self.gravity_y = if y > 0.0 { 1.0 } else if y < 0.0 { -1.0 } else { 0.0 };
    }

    pub fn set_ambient_temperature(&mut self, temp: f32) {
        self.ambient_temperature = temp;
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

    /// Step the simulation forward
    /// Phase 4: Only process active chunks!
    pub fn step(&mut self) {
        // Reset updated flags and clear move tracking
        self.grid.reset_updated();
        self.grid.clear_moves();
        
        // Phase 4: Begin frame for chunk tracking
        self.chunks.begin_frame();
        
        let go_right = (self.frame & 1) == 0;
        let (chunks_x, chunks_y) = self.chunks.dimensions();
        
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
        
        // Phase 4.1: Apply recorded moves to chunk system
        self.apply_pending_moves();
        
        // Temperature pass - run every other frame for performance
        // Phase 4: Only process active chunks for temperature
        if self.frame % 2 == 0 {
            process_temperature_grid_chunked(
                &mut self.grid,
                &self.chunks,
                self.ambient_temperature,
                self.frame,
                &mut self.rng_state
            );
        }
        
        self.frame += 1;
    }
    
    /// Phase 4.1: Apply all recorded moves to chunk tracking
    fn apply_pending_moves(&mut self) {
        for (from_x, from_y, to_x, to_y) in self.grid.drain_moves() {
            self.chunks.move_particle(from_x, from_y, to_x, to_y);
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
        
        // Process rows within chunk (bottom to top for gravity)
        if self.gravity_y >= 0.0 {
            for y in (start_y..end_y).rev() {
                if go_right {
                    for x in start_x..end_x {
                        if self.update_particle_chunked(x, y) {
                            had_movement = true;
                        }
                    }
                } else {
                    for x in (start_x..end_x).rev() {
                        if self.update_particle_chunked(x, y) {
                            had_movement = true;
                        }
                    }
                }
            }
        } else {
            for y in start_y..end_y {
                if go_right {
                    for x in start_x..end_x {
                        if self.update_particle_chunked(x, y) {
                            had_movement = true;
                        }
                    }
                } else {
                    for x in (start_x..end_x).rev() {
                        if self.update_particle_chunked(x, y) {
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
    fn update_particle_chunked(&mut self, x: u32, y: u32) -> bool {
        let xi = x as i32;
        let yi = y as i32;
        
        let element = self.grid.get_type(xi, yi);
        if element == EL_EMPTY { return false; }
        
        // Bounds check for element ID
        if (element as usize) >= ELEMENT_COUNT {
            self.grid.clear_cell(x, y);
            return false;
        }
        
        if self.grid.is_updated(x, y) { return false; }
        
        self.grid.set_updated(x, y, true);
        
        // Handle lifetime
        let life = self.grid.get_life(x, y);
        if life > 0 {
            self.grid.set_life(x, y, life - 1);
            if life - 1 == 0 {
                self.grid.clear_cell(x, y);
                self.chunks.remove_particle(x, y);
                if self.particle_count > 0 {
                    self.particle_count -= 1;
                }
                return true; // Particle disappeared = activity
            }
        }
        
        // Get category and dispatch to behavior
        let category = ELEMENT_DATA[element as usize].category;
        
        // Remember position before update
        let old_type = element;
        
        // Create update context
        let mut ctx = UpdateContext {
            grid: &mut self.grid,
            x,
            y,
            frame: self.frame,
            gravity_x: self.gravity_x,
            gravity_y: self.gravity_y,
            ambient_temp: self.ambient_temperature,
            rng: &mut self.rng_state,
        };
        
        // Delegate to behavior registry
        self.behaviors.update(category, &mut ctx);
        
        // Check if particle moved (cell is now empty or different)
        let new_type = self.grid.get_type(xi, yi);
        let moved = new_type != old_type || new_type == EL_EMPTY;
        
        if moved {
            // Wake neighbors if particle moved
            self.chunks.wake_neighbors(x, y);
        }
        
        // Process chemical reactions AFTER movement (EXACT TypeScript)
        let current_type = self.grid.get_type(x as i32, y as i32);
        if current_type != EL_EMPTY {
            self.process_reactions(x, y, current_type);
        }
        
        moved
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
            x,
            y,
            frame: self.frame,
            gravity_x: self.gravity_x,
            gravity_y: self.gravity_y,
            ambient_temp: self.ambient_temperature,
            rng: &mut self.rng_state,
        };
        
        // Delegate to behavior registry
        self.behaviors.update(category, &mut ctx);
        
        // Process chemical reactions AFTER movement (EXACT TypeScript)
        let current_type = self.grid.get_type(x as i32, y as i32);
        if current_type != EL_EMPTY {
            self.process_reactions(x, y, current_type);
        }
    }
    
    /// Process chemical reactions (mirrors TypeScript processReactionsTyped)
    fn process_reactions(&mut self, x: u32, y: u32, element: ElementId) {
        // Pick a random neighbor
        let dir = xorshift32(&mut self.rng_state) % 4;
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
        
        // Check if there's a reaction
        if let Some(reaction) = get_reaction(element, neighbor_type) {
            // Roll the dice
            let roll = (xorshift32(&mut self.rng_state) % 100) as u8;
            if roll >= reaction.chance { return; }
            
            // Apply the reaction
            self.apply_reaction(x, y, nx as u32, ny as u32, reaction);
        }
    }
    
    /// Apply a bilateral reaction (mirrors TypeScript applyReaction)
    fn apply_reaction(&mut self, src_x: u32, src_y: u32, target_x: u32, target_y: u32, reaction: &Reaction) {
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
    }
}
