use super::*;

impl ChunkGrid {
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

    /// Emergency recovery: rebuild `particle_count` from the full grid.
    ///
    /// This is intentionally O(W*H) and should only run in degraded mode
    /// (e.g. when the move buffer overflows and incremental tracking becomes unreliable).
    pub fn rebuild_particle_counts(&mut self, world_width: u32, world_height: u32, types: &[ElementId]) {
        self.particle_count.fill(0);

        let chunks_x = self.chunks_x;
        let width = world_width as usize;
        let height = world_height as usize;

        debug_assert_eq!(types.len(), width * height, "rebuild_particle_counts: types length mismatch");

        for y in 0..height {
            let row = y * width;
            let cy = (y as u32) / CHUNK_SIZE;
            for x in 0..width {
                let t = types[row + x];
                if t == EL_EMPTY {
                    continue;
                }
                let cx = (x as u32) / CHUNK_SIZE;
                let idx = (cy * chunks_x + cx) as usize;
                if idx < self.particle_count.len() {
                    self.particle_count[idx] = self.particle_count[idx].saturating_add(1);
                }
            }
        }

        // Ensure chunk states are consistent with the rebuilt counts.
        for idx in 0..self.chunk_count {
            if self.particle_count[idx] > 0 {
                if self.state[idx] == ChunkState::Sleeping {
                    self.just_woke_up[idx] = true;
                    self.woke_this_frame = self.woke_this_frame.saturating_add(1);
                }
                self.state[idx] = ChunkState::Active;
                self.idle_frames[idx] = 0;
            }
        }
    }

    /// Expose particle counts for diagnostics
    pub fn particle_counts(&self) -> &[u32] {
        &self.particle_count
    }
}
