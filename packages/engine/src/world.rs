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
    
    // Phase 3: Smart Rendering buffers
    dirty_list: Vec<u32>,           // List of dirty chunk indices for rendering
    chunk_transfer_buffer: Vec<u32>, // 32x32 pixel buffer for chunk extraction
    
    // Phase 2: Merged dirty rectangles for GPU batching
    merged_rects: MergedDirtyRects,
    rect_transfer_buffer: Vec<u32>, // Larger buffer for merged rect extraction
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
            // Phase 3: Smart Rendering
            dirty_list: Vec::with_capacity(1000),
            chunk_transfer_buffer: vec![0u32; (CHUNK_SIZE * CHUNK_SIZE) as usize],
            
            // Phase 2: GPU Batching
            merged_rects: MergedDirtyRects::new(500), // Max 500 rectangles
            rect_transfer_buffer: vec![0u32; (CHUNK_SIZE * CHUNK_SIZE * 16) as usize], // Max 4x4 chunks = 128x128 pixels
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

    /// Step the simulation forward
    /// Phase 4: Only process active chunks!
    pub fn step(&mut self) {
        // === LAZY HYDRATION: Process waking chunks ===
        // When a chunk transitions Sleep -> Active, we need to fill its air cells
        // with the current virtual_temp (which has been smoothly animating)
        self.hydrate_waking_chunks();
        
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
        // Lazy Hydration: now updates virtual_temp for sleeping chunks!
        if self.frame % 2 == 0 {
            process_temperature_grid_chunked(
                &mut self.grid,
                &mut self.chunks,  // Now mutable for virtual_temp updates
                self.ambient_temperature,
                self.frame,
                &mut self.rng_state
            );
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
            
            // Delegate to behavior registry
            self.behaviors.update(category, &mut ctx);
            
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
        
        // Check if there's a reaction
        if let Some(reaction) = get_reaction(element, neighbor_type) {
            // Roll the dice
            // PHASE 1 OPT: fast-range reduction instead of % 100
            let roll = ((xorshift32(&mut self.rng_state) as u64 * 100) >> 32) as u8;
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
        
        // CRITICAL: Mark chunk as dirty for rendering!
        // Without this, reactions don't trigger re-render!
        self.chunks.mark_dirty(x, y);
    }
}
