use super::*;

impl ChunkGrid {
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
