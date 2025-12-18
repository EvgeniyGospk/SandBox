use super::super::*;

impl Grid {
    // === PHASE 1: UNSAFE ACCESS (ZERO OVERHEAD) ===
    // These methods skip bounds checks for maximum performance.
    // ONLY use when coordinates are mathematically guaranteed valid!

    /// Fast type read - UNSAFE: caller must ensure x,y are valid
    #[inline(always)]
    pub unsafe fn get_type_unchecked(&self, x: u32, y: u32) -> ElementId {
        let idx = self.index_unchecked(x, y);
        *self.types.get_unchecked(idx)
    }

    /// Fast updated check - UNSAFE: caller must ensure idx is valid
    #[inline(always)]
    pub unsafe fn is_updated_unchecked(&self, idx: usize) -> bool {
        *self.updated.get_unchecked(idx) == 1
    }

    /// Fast set updated - UNSAFE: caller must ensure idx is valid
    #[inline(always)]
    pub unsafe fn set_updated_unchecked(&mut self, idx: usize, u: bool) {
        *self.updated.get_unchecked_mut(idx) = if u { 1 } else { 0 };
    }

    /// Fast life read - UNSAFE: caller must ensure idx is valid
    #[inline(always)]
    pub unsafe fn get_life_unchecked(&self, idx: usize) -> u16 {
        *self.life.get_unchecked(idx)
    }

    /// Fast life write - UNSAFE: caller must ensure idx is valid
    #[inline(always)]
    pub unsafe fn set_life_unchecked(&mut self, idx: usize, l: u16) {
        *self.life.get_unchecked_mut(idx) = l;
    }

    /// Fast particle write - UNSAFE: caller must ensure x,y are valid
    #[inline(always)]
    pub unsafe fn set_particle_unchecked(&mut self, x: u32, y: u32, element: ElementId, color: u32, life: u16, temp: f32) {
        let idx = self.index_unchecked(x, y);
        let prev = *self.types.get_unchecked(idx);
        *self.types.get_unchecked_mut(idx) = element;
        *self.colors.get_unchecked_mut(idx) = color;
        *self.life.get_unchecked_mut(idx) = life;
        *self.updated.get_unchecked_mut(idx) = 0;
        *self.temperature.get_unchecked_mut(idx) = temp;

        if prev == EL_EMPTY && element != EL_EMPTY {
            self.mark_cell_non_empty(x, y);
        } else if prev != EL_EMPTY && element == EL_EMPTY {
            self.mark_cell_empty(x, y);
        }
    }

    /// Fast clear cell - UNSAFE: caller must ensure x,y are valid
    #[inline(always)]
    pub unsafe fn clear_cell_unchecked(&mut self, x: u32, y: u32) {
        let idx = self.index_unchecked(x, y);
        let prev = *self.types.get_unchecked(idx);
        *self.types.get_unchecked_mut(idx) = EL_EMPTY;
        *self.colors.get_unchecked_mut(idx) = BG_COLOR;
        *self.life.get_unchecked_mut(idx) = 0;
        *self.updated.get_unchecked_mut(idx) = 0;
        *self.temperature.get_unchecked_mut(idx) = 20.0;

        // Keep velocity arrays consistent with safe clear_cell()
        *self.vx.get_unchecked_mut(idx) = 0.0;
        *self.vy.get_unchecked_mut(idx) = 0.0;

        if prev != EL_EMPTY {
            self.mark_cell_empty(x, y);
        }
    }
}
