use super::super::*;

#[cfg(feature = "parallel")]
use rayon::prelude::*;

impl Grid {
    // === Updated flag ===
    #[inline]
    pub fn is_updated(&self, x: u32, y: u32) -> bool {
        self.updated[self.index(x, y)] == 1
    }

    #[inline]
    pub fn is_updated_idx(&self, idx: usize) -> bool {
        self.updated[idx] == 1
    }

    #[inline]
    pub fn set_updated(&mut self, x: u32, y: u32, u: bool) {
        let idx = self.index(x, y);
        self.updated[idx] = if u { 1 } else { 0 };
    }

    /// Reset updated flags for all cells
    /// PHASE 5.1: Parallel fill with Rayon when feature enabled
    #[inline]
    pub fn reset_updated(&mut self) {
        #[cfg(feature = "parallel")]
        {
            self.updated.par_iter_mut().for_each(|v| *v = 0);
        }
        #[cfg(not(feature = "parallel"))]
        {
            self.updated.fill(0);
        }
    }
}
