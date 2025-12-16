use super::*;

impl ChunkGrid {
    // === BitSet Helpers ===

    #[inline(always)]
    pub(super) fn set_bit(bits: &mut [u64], idx: usize) {
        let word = idx >> 6;  // idx / 64
        let bit = idx & 63;   // idx % 64
        if word < bits.len() {
            bits[word] |= 1u64 << bit;
        }
    }

    #[inline(always)]
    pub(super) fn clear_bit(bits: &mut [u64], idx: usize) {
        let word = idx >> 6;
        let bit = idx & 63;
        if word < bits.len() {
            bits[word] &= !(1u64 << bit);
        }
    }

    #[inline(always)]
    pub(super) fn check_bit(bits: &[u64], idx: usize) -> bool {
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

        // Any touch means the chunk is active again.
        self.idle_frames[idx] = 0;

        if self.state[idx] == ChunkState::Sleeping {
            self.just_woke_up[idx] = true;
            self.woke_this_frame = self.woke_this_frame.saturating_add(1);
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
    ///
    /// CRITICAL: Chunks with particles must be processed so lifetime/reactions
    /// don't "freeze" when there is no movement.
    #[inline]
    pub fn should_process(&self, cx: u32, cy: u32) -> bool {
        let idx = self.chunk_idx_from_coords(cx, cy);
        Self::check_bit(&self.dirty_bits, idx) || self.particle_count[idx] > 0
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
}
