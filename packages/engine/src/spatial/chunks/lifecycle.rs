use super::*;

impl ChunkGrid {
    // === Frame update ===

    /// Called at start of each frame - prepare for processing
    pub fn begin_frame(&mut self) {
        // no-op: world is always live
    }

    /// Called after processing a chunk (BitSet version)
    /// 
    /// CRITICAL: Chunks with particles NEVER sleep!
    /// Only truly empty chunks (particle_count == 0) can go to sleep.
    pub fn end_chunk_update(&mut self, cx: u32, cy: u32, had_movement: bool) {
        let idx = self.chunk_idx_from_coords(cx, cy);

        if had_movement {
            Self::set_bit(&mut self.visual_dirty_bits, idx);
            self.visual_dirty[idx] = true; // Legacy
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
        self.dirty_bits.fill(!0u64);  // All dirty
        self.visual_dirty_bits.fill(!0u64);
        self.visual_dirty.fill(true);
    }

    /// Emergency recovery: force full simulation + full render upload next frame.
    pub fn mark_all_dirty(&mut self) {
        self.dirty_bits.fill(!0u64);
        self.visual_dirty_bits.fill(!0u64);
        self.visual_dirty.fill(true);
    }
}
