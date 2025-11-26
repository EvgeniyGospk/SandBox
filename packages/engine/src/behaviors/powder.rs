//! PowderBehavior - Physics for powder particles (sand, dirt, gunpowder)
//! 
//! Port from: apps/web/src/lib/engine/behaviors/PowderBehavior.ts
//! PHASE 1: Optimized with unsafe access after bounds check
//! 
//! Falls down, piles up, can sink into lighter liquids

use super::{Behavior, UpdateContext, get_random_dir};
use crate::elements::{ELEMENT_DATA, EL_EMPTY, CAT_LIQUID};

pub struct PowderBehavior;

impl PowderBehavior {
    pub fn new() -> Self {
        Self
    }
    
    /// Check if powder can move to target cell
    /// PHASE 1: Uses unsafe after bounds check to avoid double-checking
    #[inline]
    fn can_displace(&self, ctx: &UpdateContext, x: i32, y: i32, my_density: f32) -> bool {
        if !ctx.grid.in_bounds(x, y) { return false; }
        
        // SAFETY: We just checked in_bounds above
        let target_type = unsafe { ctx.grid.get_type_unchecked(x as u32, y as u32) };
        
        // Empty = can move
        if target_type == EL_EMPTY { return true; }
        
        // Check bounds for target element
        if (target_type as usize) >= ELEMENT_DATA.len() { return false; }
        
        let target_cat = ELEMENT_DATA[target_type as usize].category;
        
        // Can only displace liquids, not solids
        if target_cat != CAT_LIQUID { return false; }
        
        // Heavier sinks into lighter
        my_density > ELEMENT_DATA[target_type as usize].density
    }
}

impl Behavior for PowderBehavior {
    fn update(&self, ctx: &mut UpdateContext) {
        let x = ctx.x;
        let y = ctx.y;
        let xi = x as i32;
        let yi = y as i32;
        
        // SAFETY: x,y come from update_particle_chunked which guarantees valid coords
        let element = unsafe { ctx.grid.get_type_unchecked(x, y) };
        if element == EL_EMPTY { return; }
        if (element as usize) >= ELEMENT_DATA.len() { return; }
        
        let my_density = ELEMENT_DATA[element as usize].density;
        
        // Get gravity direction (from TypeScript getGravityDirection)
        let gx = if ctx.gravity_x > 0.0 { 1 } else if ctx.gravity_x < 0.0 { -1 } else { 0 };
        let gy = if ctx.gravity_y > 0.0 { 1 } else if ctx.gravity_y < 0.0 { -1 } else { 0 };
        
        // No gravity = no movement
        if gy == 0 && gx == 0 { return; }
        
        // 1. Try to fall in gravity direction
        let tx = xi + gx;
        let ty = yi + gy;
        if self.can_displace(ctx, tx, ty, my_density) {
            // SAFETY: can_displace verified bounds
            unsafe { ctx.grid.swap_unchecked(x, y, tx as u32, ty as u32); }
            return;
        }
        
        // 2. Try diagonal movement (mirrors TypeScript)
        let (dx1, dx2) = get_random_dir(ctx.frame, x);
        
        let tx1 = xi + dx1 + gx;
        if self.can_displace(ctx, tx1, ty, my_density) {
            unsafe { ctx.grid.swap_unchecked(x, y, tx1 as u32, ty as u32); }
            return;
        }
        
        let tx2 = xi + dx2 + gx;
        if self.can_displace(ctx, tx2, ty, my_density) {
            unsafe { ctx.grid.swap_unchecked(x, y, tx2 as u32, ty as u32); }
        }
    }
}
