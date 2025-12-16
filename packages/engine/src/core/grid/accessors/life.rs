use super::super::*;

impl Grid {
    // === Life access ===
    #[inline]
    pub fn get_life(&self, x: u32, y: u32) -> u16 {
        self.life[self.index(x, y)]
    }

    #[inline]
    pub fn set_life(&mut self, x: u32, y: u32, l: u16) {
        let idx = self.index(x, y);
        self.life[idx] = l;
    }
}
