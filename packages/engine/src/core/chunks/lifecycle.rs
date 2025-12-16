use super::*;

impl ChunkGrid {
    // === Frame update ===

    /// Called at start of each frame - prepare for processing
    pub fn begin_frame(&mut self) {
        self.woke_this_frame = 0;
        self.slept_this_frame = 0;

        // Empty-chunk sleeping is based on time, not on whether the chunk happened
        // to be processed this frame.
        for idx in 0..self.chunk_count {
            if self.particle_count[idx] > 0 {
                self.idle_frames[idx] = 0;
                self.state[idx] = ChunkState::Active;
                continue;
            }

            // Keep empty-but-dirty chunks active (e.g. after a clear/remove), so we
            // don't sleep them immediately and cause "popping" on re-wake.
            if Self::check_bit(&self.dirty_bits, idx) {
                self.idle_frames[idx] = 0;
                if self.state[idx] == ChunkState::Sleeping {
                    self.state[idx] = ChunkState::Active;
                }
                continue;
            }

            if self.state[idx] == ChunkState::Sleeping {
                continue;
            }

            self.idle_frames[idx] = self.idle_frames[idx].saturating_add(1);
            if self.idle_frames[idx] >= SLEEP_THRESHOLD {
                self.state[idx] = ChunkState::Sleeping;
                self.slept_this_frame = self.slept_this_frame.saturating_add(1);
            }
        }
    }

    /// Called after processing a chunk (BitSet version)
    /// 
    /// CRITICAL: Chunks with particles NEVER sleep!
    /// Only truly empty chunks (particle_count == 0) can go to sleep.
    pub fn end_chunk_update(&mut self, cx: u32, cy: u32, had_movement: bool) {
        let idx = self.chunk_idx_from_coords(cx, cy);

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

    /// Emergency recovery: force full simulation + full render upload next frame.
    pub fn mark_all_dirty(&mut self) {
        self.dirty_bits.fill(!0u64);
        self.visual_dirty_bits.fill(!0u64);
        self.visual_dirty.fill(true);
    }
}
