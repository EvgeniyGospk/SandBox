use super::super::*;

impl Grid {
    // === Phase 2: Velocity access ===
    #[inline]
    pub fn get_vx(&self, x: u32, y: u32) -> f32 {
        self.vx[self.index(x, y)]
    }

    #[inline]
    pub fn get_vy(&self, x: u32, y: u32) -> f32 {
        self.vy[self.index(x, y)]
    }

    #[inline]
    pub fn set_vx(&mut self, x: u32, y: u32, v: f32) {
        let idx = self.index(x, y);
        self.vx[idx] = v;
    }

    #[inline]
    pub fn set_vy(&mut self, x: u32, y: u32, v: f32) {
        let idx = self.index(x, y);
        self.vy[idx] = v;
    }

    #[inline]
    pub fn add_velocity(&mut self, x: u32, y: u32, dvx: f32, dvy: f32) {
        let idx = self.index(x, y);
        self.vx[idx] += dvx;
        self.vy[idx] += dvy;
    }
}
