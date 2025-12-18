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

    #[inline(always)]
    fn try_grow(&mut self) -> bool {
        let old_capacity = self.capacity;
        let new_capacity = old_capacity.saturating_mul(2).max(old_capacity.saturating_add(1));
        if new_capacity == old_capacity {
            return false;
        }
        self.data.resize(new_capacity, (0, 0, 0, 0));
        self.capacity = new_capacity;
        true
    }

    /// Push move - drops silently if buffer full (1 frame desync is invisible)
    #[inline(always)]
    pub fn push(&mut self, m: ParticleMove) {
        let _ = self.try_push(m);
    }

    #[inline(always)]
    pub fn try_push(&mut self, m: ParticleMove) -> bool {
        if self.count >= self.capacity {
            self.overflow_count += 1;
            let _ = self.try_grow();
        }

        if self.count < self.capacity {
            debug_assert_eq!(self.data.len(), self.capacity);
            if let Some(slot) = self.data.get_mut(self.count) {
                *slot = m;
                self.count += 1;
                true
            } else {
                debug_assert!(false, "MoveBuffer invariant violated: count < capacity but slot is missing");
                self.overflow_count += 1;
                false
            }
        } else {
            false
        }
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
    pub fn as_slice(&self) -> &[ParticleMove] {
        debug_assert!(self.count <= self.capacity);
        &self.data[..self.count]
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
