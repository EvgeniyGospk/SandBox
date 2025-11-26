//! Chunk System - Spatial optimization for particle simulation
//! 
//! Phase 4: Divide world into chunks (32x32) for:
//! - Skip processing of inactive/sleeping chunks
//! - O(active_chunks) instead of O(W*H)
//! - Wake neighbors when particles cross boundaries

/// Chunk size in pixels (32x32 is cache-friendly)
pub const CHUNK_SIZE: u32 = 32;

/// Number of frames before a chunk goes to sleep
/// Higher value = less aggressive sleeping, more correct behavior
const SLEEP_THRESHOLD: u32 = 30;

/// Chunk state
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ChunkState {
    /// Chunk has active particles that moved recently
    Active,
    /// Chunk is dormant - no movement for SLEEP_THRESHOLD frames
    Sleeping,
}

/// Manages chunk-based spatial optimization
pub struct ChunkGrid {
    /// Number of chunks horizontally
    chunks_x: u32,
    /// Number of chunks vertically  
    chunks_y: u32,
    /// Total number of chunks
    chunk_count: usize,
    
    /// Current state of each chunk
    state: Vec<ChunkState>,
    /// Dirty flag - chunk needs processing this frame
    dirty: Vec<bool>,
    /// Frames since last activity (for sleep detection)
    idle_frames: Vec<u32>,
    /// Number of non-empty cells in chunk (for quick empty check)
    particle_count: Vec<u32>,
    
    // === Lazy Hydration System ===
    /// Virtual temperature of air in each chunk (updated every frame, even sleeping)
    pub virtual_temp: Vec<f32>,
    /// Flag: chunk just woke up from sleep, needs temperature hydration
    pub just_woke_up: Vec<bool>,
    
    // === Visual Dirty (Phase 3 Fix: State Desync) ===
    /// Visual dirty flag - chunk needs RENDERING (separate from physics dirty)
    /// Cleared only when JS fetches the dirty list, not during physics!
    pub visual_dirty: Vec<bool>,
}

impl ChunkGrid {
    /// Create chunk grid for given world dimensions
    pub fn new(world_width: u32, world_height: u32) -> Self {
        let chunks_x = (world_width + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let chunks_y = (world_height + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let chunk_count = (chunks_x * chunks_y) as usize;
        
        Self {
            chunks_x,
            chunks_y,
            chunk_count,
            state: vec![ChunkState::Active; chunk_count],  // Start active
            dirty: vec![true; chunk_count],                 // All dirty initially
            idle_frames: vec![0; chunk_count],
            particle_count: vec![0; chunk_count],
            // Lazy Hydration: init with room temperature
            virtual_temp: vec![20.0; chunk_count],
            just_woke_up: vec![false; chunk_count],
            // Visual dirty: TRUE initially so first frame draws everything
            visual_dirty: vec![true; chunk_count],
        }
    }
    
    // === Chunk indexing ===
    
    /// Get chunk index from world coordinates
    #[inline]
    pub fn chunk_index(&self, x: u32, y: u32) -> usize {
        let cx = x / CHUNK_SIZE;
        let cy = y / CHUNK_SIZE;
        (cy * self.chunks_x + cx) as usize
    }
    
    /// Get chunk coordinates from world coordinates
    #[inline]
    pub fn chunk_coords(&self, x: u32, y: u32) -> (u32, u32) {
        (x / CHUNK_SIZE, y / CHUNK_SIZE)
    }
    
    /// Get chunk index from chunk coordinates
    #[inline]
    pub fn chunk_idx_from_coords(&self, cx: u32, cy: u32) -> usize {
        (cy * self.chunks_x + cx) as usize
    }
    
    /// Check if chunk coordinates are valid
    #[inline]
    pub fn chunk_in_bounds(&self, cx: i32, cy: i32) -> bool {
        cx >= 0 && cx < self.chunks_x as i32 && cy >= 0 && cy < self.chunks_y as i32
    }
    
    // === Dirty flag management ===
    
    /// Mark chunk as dirty (needs processing)
    /// Lazy Hydration: detects Sleep -> Active transition
    #[inline]
    pub fn mark_dirty(&mut self, x: u32, y: u32) {
        let idx = self.chunk_index(x, y);
        // Catch the wake-up moment for temperature hydration!
        if self.state[idx] == ChunkState::Sleeping {
            self.just_woke_up[idx] = true;
        }
        self.dirty[idx] = true;
        self.idle_frames[idx] = 0;
        self.state[idx] = ChunkState::Active;
    }
    
    /// Mark chunk as dirty by chunk index
    /// Lazy Hydration: detects Sleep -> Active transition
    /// Also marks visual_dirty for renderer!
    #[inline]
    pub fn mark_dirty_idx(&mut self, idx: usize) {
        if idx < self.chunk_count {
            // Catch the wake-up moment for temperature hydration!
            if self.state[idx] == ChunkState::Sleeping {
                self.just_woke_up[idx] = true;
            }
            self.dirty[idx] = true;
            self.visual_dirty[idx] = true; // IMPORTANT: Mark for rendering too!
            self.idle_frames[idx] = 0;
            self.state[idx] = ChunkState::Active;
        }
    }
    
    /// Check if chunk needs processing
    #[inline]
    pub fn is_dirty(&self, cx: u32, cy: u32) -> bool {
        let idx = self.chunk_idx_from_coords(cx, cy);
        self.dirty[idx]
    }
    
    /// Check if chunk is sleeping
    #[inline]
    pub fn is_sleeping(&self, cx: u32, cy: u32) -> bool {
        let idx = self.chunk_idx_from_coords(cx, cy);
        self.state[idx] == ChunkState::Sleeping
    }
    
    /// Should we process this chunk?
    /// Phase 4.1: Now properly tracks particle movements!
    #[inline]
    pub fn should_process(&self, cx: u32, cy: u32) -> bool {
        let idx = self.chunk_idx_from_coords(cx, cy);
        // Process if:
        // 1. Dirty (explicitly marked for update - e.g., neighbor woke us)
        // 2. Has particles (they might need to move)
        self.dirty[idx] || self.particle_count[idx] > 0
    }
    
    // === Wake neighbors ===
    
    /// Wake chunk and its neighbors (called when particle moves near boundary)
    pub fn wake_neighbors(&mut self, x: u32, y: u32) {
        let (cx, cy) = self.chunk_coords(x, y);
        let cxi = cx as i32;
        let cyi = cy as i32;
        
        // Check if near chunk boundary (within 2 pixels)
        let local_x = x % CHUNK_SIZE;
        let local_y = y % CHUNK_SIZE;
        
        let near_left = local_x < 2;
        let near_right = local_x >= CHUNK_SIZE - 2;
        let near_top = local_y < 2;
        let near_bottom = local_y >= CHUNK_SIZE - 2;
        
        // Wake adjacent chunks if near boundary
        if near_left && self.chunk_in_bounds(cxi - 1, cyi) {
            self.mark_dirty_idx(self.chunk_idx_from_coords((cxi - 1) as u32, cy));
        }
        if near_right && self.chunk_in_bounds(cxi + 1, cyi) {
            self.mark_dirty_idx(self.chunk_idx_from_coords((cxi + 1) as u32, cy));
        }
        if near_top && self.chunk_in_bounds(cxi, cyi - 1) {
            self.mark_dirty_idx(self.chunk_idx_from_coords(cx, (cyi - 1) as u32));
        }
        if near_bottom && self.chunk_in_bounds(cxi, cyi + 1) {
            self.mark_dirty_idx(self.chunk_idx_from_coords(cx, (cyi + 1) as u32));
        }
        
        // Diagonals
        if near_left && near_top && self.chunk_in_bounds(cxi - 1, cyi - 1) {
            self.mark_dirty_idx(self.chunk_idx_from_coords((cxi - 1) as u32, (cyi - 1) as u32));
        }
        if near_right && near_top && self.chunk_in_bounds(cxi + 1, cyi - 1) {
            self.mark_dirty_idx(self.chunk_idx_from_coords((cxi + 1) as u32, (cyi - 1) as u32));
        }
        if near_left && near_bottom && self.chunk_in_bounds(cxi - 1, cyi + 1) {
            self.mark_dirty_idx(self.chunk_idx_from_coords((cxi - 1) as u32, (cyi + 1) as u32));
        }
        if near_right && near_bottom && self.chunk_in_bounds(cxi + 1, cyi + 1) {
            self.mark_dirty_idx(self.chunk_idx_from_coords((cxi + 1) as u32, (cyi + 1) as u32));
        }
    }
    
    // === Particle count tracking ===
    
    /// Increment particle count in chunk
    #[inline]
    pub fn add_particle(&mut self, x: u32, y: u32) {
        let idx = self.chunk_index(x, y);
        self.particle_count[idx] += 1;
        self.mark_dirty_idx(idx);
    }
    
    /// Decrement particle count in chunk
    #[inline]
    pub fn remove_particle(&mut self, x: u32, y: u32) {
        let idx = self.chunk_index(x, y);
        if self.particle_count[idx] > 0 {
            self.particle_count[idx] -= 1;
        }
    }
    
    /// Move particle between chunks (if crossing boundary)
    #[inline]
    pub fn move_particle(&mut self, from_x: u32, from_y: u32, to_x: u32, to_y: u32) {
        let from_idx = self.chunk_index(from_x, from_y);
        let to_idx = self.chunk_index(to_x, to_y);
        
        if from_idx != to_idx {
            // Crossed chunk boundary
            if self.particle_count[from_idx] > 0 {
                self.particle_count[from_idx] -= 1;
            }
            self.particle_count[to_idx] += 1;
            self.mark_dirty_idx(to_idx);
        }
        
        // Wake neighbors at destination
        self.wake_neighbors(to_x, to_y);
    }
    
    // === Frame update ===
    
    /// Called at start of each frame - prepare for processing
    pub fn begin_frame(&mut self) {
        // Dirty flags are preserved from previous frame
        // They get cleared as chunks are processed
    }
    
    /// Called after processing a chunk
    /// Sets visual_dirty if movement occurred (for renderer to pick up)
    pub fn end_chunk_update(&mut self, cx: u32, cy: u32, had_movement: bool) {
        let idx = self.chunk_idx_from_coords(cx, cy);
        
        if had_movement {
            self.idle_frames[idx] = 0;
            self.state[idx] = ChunkState::Active;
            self.visual_dirty[idx] = true; // CRITICAL: Mark for render!
            
            // CRITICAL: Wake chunk BELOW us (particles fall down!)
            let cyi = cy as i32;
            if self.chunk_in_bounds(cx as i32, cyi + 1) {
                let below_idx = self.chunk_idx_from_coords(cx, cy + 1);
                self.dirty[below_idx] = true;
                self.visual_dirty[below_idx] = true; // Also mark below for render
                self.state[below_idx] = ChunkState::Active;
                self.idle_frames[below_idx] = 0;
            }
        } else {
            self.idle_frames[idx] += 1;
            // Only sleep if no particles in chunk
            if self.idle_frames[idx] >= SLEEP_THRESHOLD && self.particle_count[idx] == 0 {
                self.state[idx] = ChunkState::Sleeping;
            }
        }
        
        // Clear PHYSICS dirty flag after processing
        // NOTE: visual_dirty is NOT cleared here - it waits for JS to fetch it!
        self.dirty[idx] = false;
    }
    
    /// Clear visual dirty flag (called by World when JS fetches dirty list)
    #[inline]
    pub fn clear_visual_dirty(&mut self, idx: usize) {
        if idx < self.chunk_count {
            self.visual_dirty[idx] = false;
        }
    }
    
    /// Reset all chunks to active (e.g., after clear)
    pub fn reset(&mut self) {
        self.state.fill(ChunkState::Active);
        self.dirty.fill(true);
        self.visual_dirty.fill(true); // Reset visual dirty for full redraw
        self.idle_frames.fill(0);
        self.particle_count.fill(0);
        self.virtual_temp.fill(20.0);
        self.just_woke_up.fill(false);
    }
    
    // === Lazy Hydration Methods ===
    
    /// Get virtual temperature for chunk
    #[inline]
    pub fn get_virtual_temp(&self, cx: u32, cy: u32) -> f32 {
        let idx = self.chunk_idx_from_coords(cx, cy);
        self.virtual_temp[idx]
    }
    
    /// Update virtual temperature smoothly (lerp towards target)
    #[inline]
    pub fn update_virtual_temp(&mut self, cx: u32, cy: u32, target_temp: f32, speed: f32) {
        let idx = self.chunk_idx_from_coords(cx, cy);
        let current = self.virtual_temp[idx];
        let diff = target_temp - current;
        if diff.abs() > 0.01 {
            self.virtual_temp[idx] += diff * speed;
        } else {
            self.virtual_temp[idx] = target_temp;
        }
    }
    
    /// Set virtual temperature directly (for sync after active processing)
    #[inline]
    pub fn set_virtual_temp(&mut self, cx: u32, cy: u32, temp: f32) {
        let idx = self.chunk_idx_from_coords(cx, cy);
        self.virtual_temp[idx] = temp;
    }
    
    /// Clear wake-up flags after processing hydration
    pub fn clear_wake_flags(&mut self) {
        self.just_woke_up.fill(false);
    }
    
    // === Statistics ===
    
    /// Get number of active (non-sleeping) chunks
    pub fn active_chunk_count(&self) -> usize {
        self.state.iter().filter(|&&s| s == ChunkState::Active).count()
    }
    
    /// Get number of dirty chunks
    pub fn dirty_chunk_count(&self) -> usize {
        self.dirty.iter().filter(|&&d| d).count()
    }
    
    /// Get total chunk count
    pub fn total_chunks(&self) -> usize {
        self.chunk_count
    }
    
    /// Get chunks dimensions
    pub fn dimensions(&self) -> (u32, u32) {
        (self.chunks_x, self.chunks_y)
    }
}

/// Iterator over chunks that need processing
pub struct ActiveChunkIterator {
    chunks_x: u32,
    chunks_y: u32,
    current: usize,
    dirty: Vec<bool>,
    active: Vec<bool>,
}

impl ChunkGrid {
    /// Get iterator over chunks that should be processed
    pub fn active_chunks(&self) -> impl Iterator<Item = (u32, u32)> + '_ {
        let chunks_x = self.chunks_x;
        (0..self.chunk_count).filter_map(move |idx| {
            if self.dirty[idx] || (self.particle_count[idx] > 0 && self.state[idx] == ChunkState::Active) {
                let cx = (idx as u32) % chunks_x;
                let cy = (idx as u32) / chunks_x;
                Some((cx, cy))
            } else {
                None
            }
        })
    }
}
