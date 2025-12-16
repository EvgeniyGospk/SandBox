use super::*;

impl Grid {
    // === Dimensions ===
    #[inline]
    pub fn width(&self) -> u32 { self.width }

    #[inline]
    pub fn height(&self) -> u32 { self.height }

    #[inline]
    pub fn size(&self) -> usize { self.size }

    // === Index conversion ===
    #[inline]
    pub fn index(&self, x: u32, y: u32) -> usize {
        (y * self.width + x) as usize
    }

    #[inline]
    pub fn coords(&self, idx: usize) -> (u32, u32) {
        let x = (idx as u32) % self.width;
        let y = (idx as u32) / self.width;
        (x, y)
    }

    // === Bounds checking ===
    #[inline]
    pub fn in_bounds(&self, x: i32, y: i32) -> bool {
        x >= 0 && x < self.width as i32 && y >= 0 && y < self.height as i32
    }

    /// Get index without bounds check
    #[inline(always)]
    pub fn index_unchecked(&self, x: u32, y: u32) -> usize {
        debug_assert!(
            x < self.width && y < self.height,
            "index_unchecked: out of bounds ({}, {}) for {}x{} grid",
            x,
            y,
            self.width,
            self.height
        );
        (y * self.width + x) as usize
    }
}
