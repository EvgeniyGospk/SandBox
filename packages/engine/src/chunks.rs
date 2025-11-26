//! Chunk System - Phase 5: BitSet Optimization
//! 
//! Optimization:
//! - Vec<bool> (1 byte per chunk) -> Vec<u64> (1 bit per chunk)
//! - 64x memory reduction for dirty flags
//! - L1 Cache friendly iteration

/// Chunk size in pixels (32x32 is cache-friendly)
pub const CHUNK_SIZE: u32 = 32;

/// Number of frames before a chunk goes to sleep
const SLEEP_THRESHOLD: u32 = 60;

/// Chunk state
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ChunkState {
    Active,
    Sleeping,
}

/// Manages chunk-based spatial optimization
pub struct ChunkGrid {
    chunks_x: u32,
    chunks_y: u32,
    chunk_count: usize,
    
    /// Number of u64 words needed for BitSet
    u64_count: usize,
    
    state: Vec<ChunkState>,
    
    // === BITSET OPTIMIZATION (Phase 5) ===
    // 1 bit = 1 chunk. u64 stores 64 chunks.
    dirty_bits: Vec<u64>,
    visual_dirty_bits: Vec<u64>,
    
    idle_frames: Vec<u32>,
    particle_count: Vec<u32>,
    
    // Lazy Hydration
    pub virtual_temp: Vec<f32>,
    pub just_woke_up: Vec<bool>,
    
    // Legacy compatibility (world.rs uses visual_dirty[idx])
    pub visual_dirty: Vec<bool>,
}

impl ChunkGrid {
    /// Create chunk grid for given world dimensions
    pub fn new(world_width: u32, world_height: u32) -> Self {
        let chunks_x = (world_width + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let chunks_y = (world_height + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let chunk_count = (chunks_x * chunks_y) as usize;
        
        // How many u64 needed to store chunk_count bits?
        let u64_count = (chunk_count + 63) / 64;
        
        Self {
            chunks_x,
            chunks_y,
            chunk_count,
            u64_count,
            state: vec![ChunkState::Active; chunk_count],
            // BitSet: all bits set = all dirty initially
            dirty_bits: vec![!0u64; u64_count],
            visual_dirty_bits: vec![!0u64; u64_count],
            idle_frames: vec![0; chunk_count],
            particle_count: vec![0; chunk_count],
            virtual_temp: vec![20.0; chunk_count],
            just_woke_up: vec![false; chunk_count],
            // Legacy compatibility
            visual_dirty: vec![true; chunk_count],
        }
    }
    
    // === BitSet Helpers ===
    
    #[inline(always)]
    fn set_bit(bits: &mut [u64], idx: usize) {
        let word = idx >> 6;  // idx / 64
        let bit = idx & 63;   // idx % 64
        if word < bits.len() {
            bits[word] |= 1u64 << bit;
        }
    }

    #[inline(always)]
    fn clear_bit(bits: &mut [u64], idx: usize) {
        let word = idx >> 6;
        let bit = idx & 63;
        if word < bits.len() {
            bits[word] &= !(1u64 << bit);
        }
    }

    #[inline(always)]
    fn check_bit(bits: &[u64], idx: usize) -> bool {
        let word = idx >> 6;
        let bit = idx & 63;
        word < bits.len() && (bits[word] & (1u64 << bit)) != 0
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
    
    // === Dirty flag management (BitSet) ===
    
    /// Mark chunk as dirty (needs processing)
    #[inline]
    pub fn mark_dirty(&mut self, x: u32, y: u32) {
        let idx = self.chunk_index(x, y);
        self.mark_dirty_idx(idx);
    }
    
    /// Mark chunk as dirty by chunk index (BitSet version)
    #[inline]
    pub fn mark_dirty_idx(&mut self, idx: usize) {
        if idx >= self.chunk_count { return; }
        
        if self.state[idx] == ChunkState::Sleeping {
            self.just_woke_up[idx] = true;
        }
        
        Self::set_bit(&mut self.dirty_bits, idx);
        Self::set_bit(&mut self.visual_dirty_bits, idx);
        self.visual_dirty[idx] = true; // Legacy compatibility
        
        self.idle_frames[idx] = 0;
        self.state[idx] = ChunkState::Active;
    }
    
    /// Check if chunk needs processing (BitSet)
    #[inline]
    pub fn is_dirty(&self, cx: u32, cy: u32) -> bool {
        let idx = self.chunk_idx_from_coords(cx, cy);
        Self::check_bit(&self.dirty_bits, idx)
    }
    
    /// Check if chunk is sleeping
    #[inline]
    pub fn is_sleeping(&self, cx: u32, cy: u32) -> bool {
        let idx = self.chunk_idx_from_coords(cx, cy);
        self.state[idx] == ChunkState::Sleeping
    }
    
    /// Should we process this chunk? (BitSet version)
    #[inline]
    pub fn should_process(&self, cx: u32, cy: u32) -> bool {
        let idx = self.chunk_idx_from_coords(cx, cy);
        Self::check_bit(&self.dirty_bits, idx) || self.particle_count[idx] > 0
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
    
    /// Called after processing a chunk (BitSet version)
    pub fn end_chunk_update(&mut self, cx: u32, cy: u32, had_movement: bool) {
        let idx = self.chunk_idx_from_coords(cx, cy);
        
        if had_movement {
            self.idle_frames[idx] = 0;
            self.state[idx] = ChunkState::Active;
            Self::set_bit(&mut self.visual_dirty_bits, idx);
            self.visual_dirty[idx] = true; // Legacy
            
            // Wake chunk below (particles fall)
            if cy + 1 < self.chunks_y {
                let below_idx = self.chunk_idx_from_coords(cx, cy + 1);
                Self::set_bit(&mut self.dirty_bits, below_idx);
                Self::set_bit(&mut self.visual_dirty_bits, below_idx);
                self.visual_dirty[below_idx] = true;
                self.state[below_idx] = ChunkState::Active;
                self.idle_frames[below_idx] = 0;
            }
        } else {
            self.idle_frames[idx] += 1;
            if self.idle_frames[idx] >= SLEEP_THRESHOLD && self.particle_count[idx] == 0 {
                self.state[idx] = ChunkState::Sleeping;
            }
        }
        
        // Clear physics dirty bit
        Self::clear_bit(&mut self.dirty_bits, idx);
    }
    
    /// Clear visual dirty flag
    #[inline]
    pub fn clear_visual_dirty(&mut self, idx: usize) {
        if idx < self.chunk_count {
            Self::clear_bit(&mut self.visual_dirty_bits, idx);
            self.visual_dirty[idx] = false;
        }
    }
    
    /// Reset all chunks (BitSet version)
    pub fn reset(&mut self) {
        self.state.fill(ChunkState::Active);
        self.dirty_bits.fill(!0u64);  // All dirty
        self.visual_dirty_bits.fill(!0u64);
        self.visual_dirty.fill(true);
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
    
    /// Get number of dirty chunks (BitSet version)
    pub fn dirty_chunk_count(&self) -> usize {
        // Count set bits across all words
        self.dirty_bits.iter().map(|w| w.count_ones() as usize).sum()
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

impl ChunkGrid {
    /// Get iterator over chunks that should be processed (BitSet version)
    pub fn active_chunks(&self) -> impl Iterator<Item = (u32, u32)> + '_ {
        let chunks_x = self.chunks_x;
        (0..self.chunk_count).filter_map(move |idx| {
            if Self::check_bit(&self.dirty_bits, idx) || (self.particle_count[idx] > 0 && self.state[idx] == ChunkState::Active) {
                let cx = (idx as u32) % chunks_x;
                let cy = (idx as u32) / chunks_x;
                Some((cx, cy))
            } else {
                None
            }
        })
    }
}
