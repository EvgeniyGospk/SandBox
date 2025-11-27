//! PowderBehavior - Physics for powder particles (sand, dirt, gunpowder)
//! 
//! Phase 2: Dispersion only - vertical movement handled by physics.rs
//! 
//! Only handles diagonal "rolling" when blocked below.
//! Vertical falling is now done by velocity-based physics.

use super::{Behavior, UpdateContext, get_random_dir};
use crate::elements::{ELEMENT_DATA, EL_EMPTY, CAT_LIQUID};

pub struct PowderBehavior;

impl PowderBehavior {
    pub fn new() -> Self {
        Self
    }
    
    /// Check if powder can move to target cell (for dispersion only)
    #[inline]
    fn can_displace(&self, ctx: &UpdateContext, x: i32, y: i32, my_density: f32) -> bool {
        if !ctx.grid.in_bounds(x, y) { return false; }
        
        let target_type = unsafe { ctx.grid.get_type_unchecked(x as u32, y as u32) };
        
        // Empty = can move
        if target_type == EL_EMPTY { return true; }
        
        if (target_type as usize) >= ELEMENT_DATA.len() { return false; }
        
        let target_cat = ELEMENT_DATA[target_type as usize].category;
        
        // Can only displace liquids, not solids
        if target_cat != CAT_LIQUID { return false; }
        
        // Heavier sinks into lighter
        my_density > ELEMENT_DATA[target_type as usize].density
    }
    
    /// Check if blocked below (for dispersion trigger)
    #[inline]
    fn is_blocked_below(&self, ctx: &UpdateContext, xi: i32, yi: i32, gy: i32) -> bool {
        let ty = yi + gy;
        if !ctx.grid.in_bounds(xi, ty) { return true; }
        
        let below_type = unsafe { ctx.grid.get_type_unchecked(xi as u32, ty as u32) };
        below_type != EL_EMPTY
    }
}

impl Behavior for PowderBehavior {
    fn update(&self, ctx: &mut UpdateContext) {
        let x = ctx.x;
        let y = ctx.y;
        let xi = x as i32;
        let yi = y as i32;
        
        let element = unsafe { ctx.grid.get_type_unchecked(x, y) };
        if element == EL_EMPTY { return; }
        if (element as usize) >= ELEMENT_DATA.len() { return; }
        
        let my_density = ELEMENT_DATA[element as usize].density;
        
        // Get gravity direction
        let gx = if ctx.gravity_x > 0.0 { 1 } else if ctx.gravity_x < 0.0 { -1 } else { 0 };
        let gy = if ctx.gravity_y > 0.0 { 1 } else if ctx.gravity_y < 0.0 { -1 } else { 0 };
        
        if gy == 0 && gx == 0 { return; }
        
        // Phase 2: NO vertical falling here - physics.rs handles that!
        // Only do diagonal dispersion when blocked below
        
        if !self.is_blocked_below(ctx, xi, yi, gy) {
            // Not blocked - physics will handle the fall
            return;
        }
        
        // Blocked below - try to roll diagonally
        let ty = yi + gy;
        let (dx1, dx2) = get_random_dir(ctx.frame, x);
        
        let tx1 = xi + dx1;
        if self.can_displace(ctx, tx1, ty, my_density) {
            unsafe { ctx.grid.swap_unchecked(x, y, tx1 as u32, ty as u32); }
            return;
        }
        
        let tx2 = xi + dx2;
        if self.can_displace(ctx, tx2, ty, my_density) {
            unsafe { ctx.grid.swap_unchecked(x, y, tx2 as u32, ty as u32); }
        }
    }
}
