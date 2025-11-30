//! Chunk System - Phase 5: BitSet Optimization
//! 
//! Optimization:
//! - Vec<bool> (1 byte per chunk) -> Vec<u64> (1 bit per chunk)
//! - 64x memory reduction for dirty flags
//! - L1 Cache friendly iteration

/// Chunk size in pixels (32x32 is cache-friendly)
pub const CHUNK_SIZE: u32 = 32;

/// Number of frames before an EMPTY chunk goes to sleep
/// Only empty chunks can sleep - chunks with particles must always be processed
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

    // Perf counters (reset each frame)
    pub woke_this_frame: u32,
    pub slept_this_frame: u32,
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
            woke_this_frame: 0,
            slept_this_frame: 0,
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
        
        // Only reset idle_frames when WAKING a sleeping chunk
        // For already-active chunks, idle_frames is managed by end_chunk_update
        if self.state[idx] == ChunkState::Sleeping {
            self.just_woke_up[idx] = true;
            self.woke_this_frame = self.woke_this_frame.saturating_add(1);
            self.idle_frames[idx] = 0;
            self.state[idx] = ChunkState::Active;
        }
        
        Self::set_bit(&mut self.dirty_bits, idx);
        Self::set_bit(&mut self.visual_dirty_bits, idx);
        self.visual_dirty[idx] = true; // Legacy compatibility
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
    /// Only process chunks that are explicitly marked dirty
    /// Active state just means "not sleeping", it doesn't force processing
    #[inline]
    pub fn should_process(&self, cx: u32, cy: u32) -> bool {
        let idx = self.chunk_idx_from_coords(cx, cy);
        Self::check_bit(&self.dirty_bits, idx)
    }
    
    // === Wake neighbors ===
    
    /// PHASE 1 OPT: Branchless neighbor wake with lookup table
    /// 
    /// Instead of 8 if-statements (branch misprediction nightmare),
    /// we compute a bitmask from local position and iterate over set bits.
    /// 
    /// Lookup table indexed by: (near_left | near_right<<1 | near_top<<2 | near_bottom<<3)
    /// Each entry is a bitmask of neighbors to wake:
    ///   Bit 0: Left, Bit 1: Right, Bit 2: Top, Bit 3: Bottom
    ///   Bit 4: Top-Left, Bit 5: Top-Right, Bit 6: Bottom-Left, Bit 7: Bottom-Right
    /// 
    /// Precomputed offsets for each bit: (dx, dy)
    const NEIGHBOR_OFFSETS: [(i32, i32); 8] = [
        (-1, 0),   // 0: Left
        (1, 0),    // 1: Right
        (0, -1),   // 2: Top
        (0, 1),    // 3: Bottom
        (-1, -1),  // 4: Top-Left
        (1, -1),   // 5: Top-Right
        (-1, 1),   // 6: Bottom-Left
        (1, 1),    // 7: Bottom-Right
    ];
    
    /// Lookup table: index = (near_left | near_right<<1 | near_top<<2 | near_bottom<<3)
    /// Value = bitmask of neighbors to wake
    const WAKE_MASK_LUT: [u8; 16] = [
        0b0000_0000, // 0: not near any edge
        0b0000_0001, // 1: near left only -> wake left
        0b0000_0010, // 2: near right only -> wake right
        0b0000_0011, // 3: near left+right (impossible for 32px chunk, but handle it)
        0b0000_0100, // 4: near top only -> wake top
        0b0001_0101, // 5: near left+top -> wake left, top, top-left
        0b0010_0110, // 6: near right+top -> wake right, top, top-right
        0b0011_0111, // 7: near left+right+top
        0b0000_1000, // 8: near bottom only -> wake bottom
        0b0100_1001, // 9: near left+bottom -> wake left, bottom, bottom-left
        0b1000_1010, // 10: near right+bottom -> wake right, bottom, bottom-right
        0b1100_1011, // 11: near left+right+bottom
        0b0000_1100, // 12: near top+bottom (impossible, but handle)
        0b0101_1101, // 13: near left+top+bottom
        0b1010_1110, // 14: near right+top+bottom
        0b1111_1111, // 15: all edges (impossible)
    ];
    
    /// Wake chunk and its neighbors (called when particle moves near boundary)
    /// PHASE 1 OPT: Branchless implementation using lookup table
    pub fn wake_neighbors(&mut self, x: u32, y: u32) {
        let (cx, cy) = self.chunk_coords(x, y);
        
        // PHASE 1 OPT: Use & instead of % for local coords (CHUNK_SIZE is power of 2)
        let local_x = x & (CHUNK_SIZE - 1);
        let local_y = y & (CHUNK_SIZE - 1);
        
        // Compute edge flags as 0 or 1 (branchless)
        let near_left = (local_x < 2) as usize;
        let near_right = (local_x >= CHUNK_SIZE - 2) as usize;
        let near_top = (local_y < 2) as usize;
        let near_bottom = (local_y >= CHUNK_SIZE - 2) as usize;
        
        // Build lookup index
        let lut_idx = near_left | (near_right << 1) | (near_top << 2) | (near_bottom << 3);
        let wake_mask = Self::WAKE_MASK_LUT[lut_idx];
        
        // Early exit if not near any edge (most common case)
        if wake_mask == 0 { return; }
        
        let cxi = cx as i32;
        let cyi = cy as i32;
        
        // Iterate over set bits in wake_mask
        let mut mask = wake_mask;
        while mask != 0 {
            let bit = mask.trailing_zeros() as usize;
            mask &= mask - 1; // Clear lowest set bit
            
            let (dx, dy) = Self::NEIGHBOR_OFFSETS[bit];
            let ncx = cxi + dx;
            let ncy = cyi + dy;
            
            // Bounds check (still needed, but predictable branch)
            if ncx >= 0 && ncx < self.chunks_x as i32 && ncy >= 0 && ncy < self.chunks_y as i32 {
                self.mark_dirty_idx(self.chunk_idx_from_coords(ncx as u32, ncy as u32));
            }
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
            // Only wake neighbors when actually crossing boundary
            self.wake_neighbors(to_x, to_y);
        }
    }
    
    // === Frame update ===
    
    /// Called at start of each frame - prepare for processing
    pub fn begin_frame(&mut self) {
        // Dirty flags are preserved from previous frame
        // They get cleared as chunks are processed
        self.woke_this_frame = 0;
        self.slept_this_frame = 0;
    }
    
    /// Called after processing a chunk (BitSet version)
    /// 
    /// CRITICAL: Chunks with particles NEVER sleep!
    /// Only truly empty chunks (particle_count == 0) can go to sleep.
    pub fn end_chunk_update(&mut self, cx: u32, cy: u32, had_movement: bool) {
        let idx = self.chunk_idx_from_coords(cx, cy);
        let has_particles = self.particle_count[idx] > 0;
        
        if had_movement {
            self.idle_frames[idx] = 0;
            self.state[idx] = ChunkState::Active;
            Self::set_bit(&mut self.visual_dirty_bits, idx);
            self.visual_dirty[idx] = true; // Legacy
            
            // Wake chunk below ONLY if it has particles (to catch falling particles)
            // Don't wake empty chunks - this prevents cascade wakeups
            if cy + 1 < self.chunks_y {
                let below_idx = self.chunk_idx_from_coords(cx, cy + 1);
                if self.particle_count[below_idx] > 0 || self.state[below_idx] == ChunkState::Sleeping {
                    // Only set dirty bit, don't force Active state
                    Self::set_bit(&mut self.dirty_bits, below_idx);
                }
            }
        } else {
            // CRITICAL: Only EMPTY chunks can sleep!
            // Chunks with particles must always be processed for temperature, reactions, etc.
            if has_particles {
                // Has particles - stay active, don't increment idle counter
                self.idle_frames[idx] = 0;
                self.state[idx] = ChunkState::Active;
            } else {
                // Empty chunk - can potentially sleep after threshold
                self.idle_frames[idx] += 1;
                if self.idle_frames[idx] >= SLEEP_THRESHOLD {
                    self.state[idx] = ChunkState::Sleeping;
                    self.slept_this_frame = self.slept_this_frame.saturating_add(1);
                }
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

    /// Expose particle counts for diagnostics
    pub fn particle_counts(&self) -> &[u32] {
        &self.particle_count
    }
    
    /// Get chunks dimensions
    pub fn dimensions(&self) -> (u32, u32) {
        (self.chunks_x, self.chunks_y)
    }
}

impl ChunkGrid {
    /// Get iterator over chunks that should be processed (BitSet version)
    /// 
    /// CRITICAL: Chunks with particles are ALWAYS processed!
    /// - dirty_bits set → process (something changed)
    /// - particle_count > 0 → process (for temperature, reactions, gravity)
    /// - Only truly empty, non-dirty chunks can be skipped
    pub fn active_chunks(&self) -> impl Iterator<Item = (u32, u32)> + '_ {
        let chunks_x = self.chunks_x;
        (0..self.chunk_count).filter_map(move |idx| {
            // Process if dirty OR has particles (regardless of sleep state!)
            if Self::check_bit(&self.dirty_bits, idx) || self.particle_count[idx] > 0 {
                let cx = (idx as u32) % chunks_x;
                let cy = (idx as u32) / chunks_x;
                Some((cx, cy))
            } else {
                None
            }
        })
    }
}

// ============================================================================
// PHASE 2: MERGED DIRTY RECTANGLES FOR GPU BATCHING
// ============================================================================
// 
// Instead of uploading each dirty chunk separately (N calls to texSubImage2D),
// we merge adjacent dirty chunks into larger rectangles.
// 
// Example: 6 dirty chunks in a row → 1 rectangle upload
// 
// Algorithm: Row-based run-length encoding
// 1. For each row of chunks, find runs of consecutive dirty chunks
// 2. Output (x, y, width, height) in CHUNK units

/// Represents a merged rectangle of dirty chunks (in CHUNK coordinates)
#[derive(Clone, Copy, Debug)]
pub struct DirtyRect {
    pub cx: u32,      // Chunk X
    pub cy: u32,      // Chunk Y
    pub cw: u32,      // Width in chunks
    pub ch: u32,      // Height in chunks (always 1 for row-based RLE)
}

/// Buffer for storing merged dirty rectangles (reused across frames)
pub struct MergedDirtyRects {
    rects: Vec<DirtyRect>,
    count: usize,
}

impl MergedDirtyRects {
    pub fn new(capacity: usize) -> Self {
        Self {
            rects: vec![DirtyRect { cx: 0, cy: 0, cw: 0, ch: 0 }; capacity],
            count: 0,
        }
    }
    
    #[inline]
    pub fn clear(&mut self) {
        self.count = 0;
    }
    
    #[inline]
    pub fn push(&mut self, rect: DirtyRect) {
        if self.count < self.rects.len() {
            self.rects[self.count] = rect;
            self.count += 1;
        }
    }
    
    #[inline]
    pub fn count(&self) -> usize {
        self.count
    }
    
    #[inline]
    pub fn get(&self, idx: usize) -> Option<&DirtyRect> {
        if idx < self.count {
            Some(&self.rects[idx])
        } else {
            None
        }
    }
    
    /// Get raw pointer for JS interop
    pub fn as_ptr(&self) -> *const DirtyRect {
        self.rects.as_ptr()
    }
}

impl ChunkGrid {
    /// PHASE 2: Collect dirty chunks and merge into rectangles
    /// 
    /// Uses row-based run-length encoding to merge horizontal runs.
    /// Returns number of rectangles generated.
    /// 
    /// Call get_merged_rect(idx) to retrieve each rectangle.
    pub fn collect_merged_dirty_rects(&self, output: &mut MergedDirtyRects) -> usize {
        output.clear();
        
        // Row-based RLE: scan each row and find runs of consecutive dirty chunks
        for cy in 0..self.chunks_y {
            let mut run_start: Option<u32> = None;
            
            for cx in 0..self.chunks_x {
                let idx = self.chunk_idx_from_coords(cx, cy);
                let is_dirty = Self::check_bit(&self.visual_dirty_bits, idx);
                
                if is_dirty {
                    // Start or continue a run
                    if run_start.is_none() {
                        run_start = Some(cx);
                    }
                } else {
                    // End of run (if any)
                    if let Some(start) = run_start {
                        output.push(DirtyRect {
                            cx: start,
                            cy,
                            cw: cx - start,
                            ch: 1,
                        });
                        run_start = None;
                    }
                }
            }
            
            // End of row - close any open run
            if let Some(start) = run_start {
                output.push(DirtyRect {
                    cx: start,
                    cy,
                    cw: self.chunks_x - start,
                    ch: 1,
                });
            }
        }
        
        output.count()
    }
    
    /// PHASE 2: Try to merge vertically adjacent rectangles
    /// 
    /// After row-based RLE, we can merge rectangles that have the same
    /// X start and width across consecutive rows.
    /// 
    /// This further reduces the number of GPU uploads.
    pub fn merge_vertical(&self, rects: &mut MergedDirtyRects) {
        if rects.count() < 2 { return; }
        
        // Simple O(n²) merge - fine for small numbers of rectangles
        let mut i = 0;
        while i < rects.count {
            let rect_i = rects.rects[i];
            let mut j = i + 1;
            
            while j < rects.count {
                let rect_j = rects.rects[j];
                
                // Can merge if same X, same width, and adjacent rows
                if rect_j.cx == rect_i.cx 
                    && rect_j.cw == rect_i.cw 
                    && rect_j.cy == rect_i.cy + rect_i.ch 
                {
                    // Extend rect_i downward
                    rects.rects[i].ch += rect_j.ch;
                    
                    // Remove rect_j by swapping with last
                    rects.count -= 1;
                    if j < rects.count {
                        rects.rects[j] = rects.rects[rects.count];
                    }
                    // Don't increment j - check the swapped element
                } else {
                    j += 1;
                }
            }
            
            i += 1;
        }
    }
}
