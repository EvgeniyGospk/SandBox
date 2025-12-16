use super::super::*;

impl Grid {
    // === Temperature access ===
    #[inline]
    pub fn get_temp(&self, x: i32, y: i32) -> f32 {
        if !self.in_bounds(x, y) { return 20.0; }
        self.temperature[self.index(x as u32, y as u32)]
    }

    #[inline]
    pub fn set_temp(&mut self, x: u32, y: u32, t: f32) {
        let idx = self.index(x, y);
        self.temperature[idx] = t;
    }

    pub fn temperature_ptr(&self) -> *const f32 {
        self.temperature.as_ptr()
    }
}
