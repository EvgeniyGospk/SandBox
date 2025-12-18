use super::*;

impl ChunkGrid {
    // === Statistics ===

    /// Get number of active (non-sleeping) chunks
    pub fn active_chunk_count(&self) -> usize {
        self.chunk_count
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

    /// Get iterator over chunks that should be processed (BitSet version)
    /// 
    /// CRITICAL: Chunks with particles are ALWAYS processed!
    /// - dirty_bits set → process (something changed)
    /// - particle_count > 0 → process (for temperature, reactions, gravity)
    /// - Only truly empty, non-dirty chunks can be skipped
    pub fn active_chunks(&self) -> impl Iterator<Item = (u32, u32)> + '_ {
        let chunks_x = self.chunks_x;
        (0..self.chunk_count).filter_map(move |idx| {
            let cx = (idx as u32) % chunks_x;
            let cy = (idx as u32) / chunks_x;
            Some((cx, cy))
        })
    }
}
