/// Recorded particle movement (from_x, from_y, to_x, to_y)
pub type ParticleMove = (u32, u32, u32, u32);

// === PHASE 4: ZERO-ALLOCATION MOVE BUFFER ===
// Fixed-size buffer that never reallocates. GC killer!

/// Fixed-capacity move buffer - allocated once, reused forever
pub struct MoveBuffer {
    data: Vec<ParticleMove>,
    pub count: usize,
    capacity: usize,
    overflow_count: usize,
}

impl MoveBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            data: vec![(0, 0, 0, 0); capacity], // Single allocation at startup
            count: 0,
            capacity,
            overflow_count: 0,
        }
    }

    /// Push move - drops silently if buffer full (1 frame desync is invisible)
    #[inline(always)]
    pub fn push(&mut self, m: ParticleMove) {
        if self.count < self.capacity {
            // SAFETY: We just checked bounds above
            unsafe {
                *self.data.get_unchecked_mut(self.count) = m;
            }
            self.count += 1;
        } else {
            self.overflow_count += 1;
        }
        // If full, silently drop. Better than GC stutter!
    }

    /// Reset counter - memory stays allocated
    #[inline(always)]
    pub fn clear(&mut self) {
        self.count = 0;
        self.overflow_count = 0;
    }

    /// Get raw pointer to data for unsafe iteration
    #[inline(always)]
    pub fn as_ptr(&self) -> *const ParticleMove {
        self.data.as_ptr()
    }

    #[inline(always)]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    #[inline(always)]
    pub fn overflow_count(&self) -> usize {
        self.overflow_count
    }
}
