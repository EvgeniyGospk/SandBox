use super::*;

impl Grid {
    // === Swap two cells (all data) ===
    // Phase 4: Records cross-chunk moves for chunk tracking
    pub fn swap(&mut self, x1: u32, y1: u32, x2: u32, y2: u32) {
        let idx1 = self.index(x1, y1);
        let idx2 = self.index(x2, y2);

        self.swap_idx(idx1, idx2);
    }

    #[inline]
    pub fn swap_idx(&mut self, idx1: usize, idx2: usize) {
        self.types.swap(idx1, idx2);
        self.colors.swap(idx1, idx2);
        self.life.swap(idx1, idx2);
        self.updated.swap(idx1, idx2);
        self.temperature.swap(idx1, idx2);
        // Phase 2: Swap velocity too
        self.vx.swap(idx1, idx2);
        self.vy.swap(idx1, idx2);
    }

    /// Fast swap using raw pointers - UNSAFE: caller must ensure both coords are valid
    /// This is the hottest path in the simulation!
    /// 
    /// PHASE 4 OPTIMIZATION: Only record moves that cross chunk boundaries!
    /// Before: Every swap was recorded → millions of writes per second
    /// After: Only cross-chunk swaps → 10-100x fewer writes
    #[inline(always)]
    pub unsafe fn swap_unchecked(&mut self, x1: u32, y1: u32, x2: u32, y2: u32) {
        let idx1 = self.index_unchecked(x1, y1);
        let idx2 = self.index_unchecked(x2, y2);

        debug_assert!(
            idx1 < self.size && idx2 < self.size,
            "swap_unchecked: computed idx out of bounds (idx1={}, idx2={}, size={})",
            idx1,
            idx2,
            self.size
        );
        // Raw pointer swap - no bounds checks!
        let ptr_types = self.types.as_mut_ptr();
        let ptr_colors = self.colors.as_mut_ptr();
        let ptr_life = self.life.as_mut_ptr();
        let ptr_updated = self.updated.as_mut_ptr();
        let ptr_temp = self.temperature.as_mut_ptr();
        let ptr_vx = self.vx.as_mut_ptr();
        let ptr_vy = self.vy.as_mut_ptr();

        std::ptr::swap(ptr_types.add(idx1), ptr_types.add(idx2));
        std::ptr::swap(ptr_colors.add(idx1), ptr_colors.add(idx2));
        std::ptr::swap(ptr_life.add(idx1), ptr_life.add(idx2));
        std::ptr::swap(ptr_updated.add(idx1), ptr_updated.add(idx2));
        std::ptr::swap(ptr_temp.add(idx1), ptr_temp.add(idx2));
        // Swap velocity vectors as well so momentum moves with the particle
        std::ptr::swap(ptr_vx.add(idx1), ptr_vx.add(idx2));
        std::ptr::swap(ptr_vy.add(idx1), ptr_vy.add(idx2));
    }
}
