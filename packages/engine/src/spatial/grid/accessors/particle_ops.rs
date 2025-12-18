use super::super::*;

impl Grid {
    // === Set particle with all data ===
    // Match TypeScript: new particles are NOT updated, so they can move this frame
    pub fn set_particle(&mut self, x: u32, y: u32, element: ElementId, color: u32, life: u16, temp: f32) {
        let idx = self.index(x, y);
        self.types[idx] = element;
        self.colors[idx] = color;
        self.life[idx] = life;
        self.updated[idx] = 0;  // NOT updated - can move this frame!
        self.temperature[idx] = temp;
        // Phase 2: New particles start with zero velocity
        self.vx[idx] = 0.0;
        self.vy[idx] = 0.0;
    }

    // === Clear single cell ===
    pub fn clear_cell(&mut self, x: u32, y: u32) {
        let idx = self.index(x, y);
        self.types[idx] = EL_EMPTY;
        self.colors[idx] = BG_COLOR;
        self.life[idx] = 0;
        self.temperature[idx] = 20.0;
        // Phase 2: Clear velocity
        self.vx[idx] = 0.0;
        self.vy[idx] = 0.0;
    }

    // === Clear entire grid ===
    pub fn clear(&mut self) {
        self.types.fill(EL_EMPTY);
        self.colors.fill(BG_COLOR);
        self.life.fill(0);
        self.updated.fill(0);
        self.temperature.fill(20.0);
        // Phase 2: Clear velocity
        self.vx.fill(0.0);
        self.vy.fill(0.0);
    }
}
