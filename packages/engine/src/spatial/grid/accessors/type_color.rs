use super::super::*;

impl Grid {
    #[inline]
    pub fn is_empty(&self, x: i32, y: i32) -> bool {
        if !self.in_bounds(x, y) { return false; }
        self.types[self.index(x as u32, y as u32)] == EL_EMPTY
    }

    #[inline]
    pub fn is_empty_idx(&self, idx: usize) -> bool {
        self.types[idx] == EL_EMPTY
    }

    // === Type access ===
    #[inline]
    pub fn get_type(&self, x: i32, y: i32) -> ElementId {
        if !self.in_bounds(x, y) { return EL_EMPTY; }
        self.types[self.index(x as u32, y as u32)]
    }

    #[inline]
    pub fn get_type_idx(&self, idx: usize) -> ElementId {
        self.types[idx]
    }

    #[inline]
    pub fn set_type(&mut self, x: u32, y: u32, t: ElementId) {
        let idx = self.index(x, y);
        let prev = self.types[idx];
        self.types[idx] = t;

        if prev == EL_EMPTY && t != EL_EMPTY {
            self.mark_cell_non_empty(x, y);
        } else if prev != EL_EMPTY && t == EL_EMPTY {
            self.mark_cell_empty(x, y);
        }
    }

    // === Color access ===
    #[inline]
    pub fn get_color(&self, x: u32, y: u32) -> u32 {
        self.colors[self.index(x, y)]
    }

    #[inline]
    pub fn set_color(&mut self, x: u32, y: u32, c: u32) {
        let idx = self.index(x, y);
        self.colors[idx] = c;
    }
}
