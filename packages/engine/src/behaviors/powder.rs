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
    
    /// Check if blocked in gravity direction (for dispersion trigger)
    #[inline]
    fn is_blocked_in_gravity_dir(&self, ctx: &UpdateContext, xi: i32, yi: i32, gx: i32, gy: i32) -> bool {
        let tx = xi + gx;
        let ty = yi + gy;
        if !ctx.grid.in_bounds(tx, ty) { return true; }
        
        let t = unsafe { ctx.grid.get_type_unchecked(tx as u32, ty as u32) };
        t != EL_EMPTY
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
        
        // Get discrete gravity direction (defaults to down if zero)
        let (gx, gy) = super::gravity_dir(ctx.gravity_x, ctx.gravity_y);
        
        // Phase 2: NO vertical falling here - physics.rs handles that!
        // Only do diagonal dispersion when blocked below
        
        if !self.is_blocked_in_gravity_dir(ctx, xi, yi, gx, gy) {
            // Not blocked - physics will handle the fall
            return;
        }
        
        // Blocked - try to roll "diagonally" relative to gravity.
        //
        // For axis-aligned gravity, this is a true diagonal (gravity step + lateral step).
        // For diagonal gravity, we approximate by trying each axis component separately.
        if gx == 0 || gy == 0 {
            // Axis-aligned gravity: pick a lateral axis and try both sides.
            let lateral_key = if gx == 0 { x } else { y };
            let (s1, s2) = get_random_dir(ctx.frame, lateral_key);

            let (dx1, dy1, dx2, dy2) = if gx == 0 {
                // Gravity is vertical → lateral is X.
                (s1, gy, s2, gy)
            } else {
                // Gravity is horizontal → lateral is Y.
                (gx, s1, gx, s2)
            };

            let tx1 = xi + dx1;
            let ty1 = yi + dy1;
            if self.can_displace(ctx, tx1, ty1, my_density) {
                unsafe { ctx.grid.swap_unchecked(x, y, tx1 as u32, ty1 as u32); }
                return;
            }

            let tx2 = xi + dx2;
            let ty2 = yi + dy2;
            if self.can_displace(ctx, tx2, ty2, my_density) {
                unsafe { ctx.grid.swap_unchecked(x, y, tx2 as u32, ty2 as u32); }
            }
        } else {
            // Diagonal gravity: try sliding along X then Y (or vice versa).
            let prefer_x = ((ctx.frame as u32 + x + y) & 1) == 0;
            let candidates = if prefer_x {
                [(gx, 0), (0, gy)]
            } else {
                [(0, gy), (gx, 0)]
            };

            for (dx, dy) in candidates {
                let tx = xi + dx;
                let ty = yi + dy;
                if self.can_displace(ctx, tx, ty, my_density) {
                    unsafe { ctx.grid.swap_unchecked(x, y, tx as u32, ty as u32); }
                    break;
                }
            }
        }
    }
}
