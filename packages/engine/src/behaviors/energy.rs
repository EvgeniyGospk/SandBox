//! EnergyBehavior - Physics for energy particles (fire, spark, electricity)
//! 
//! Port from: apps/web/src/lib/engine/behaviors/EnergyBehavior.ts
//! PHASE 1: Optimized with unsafe access after bounds check
//! 
//! Fire rises erratically, spark/electricity move through conductors

use super::{Behavior, UpdateContext, xorshift32, gravity_dir, perp_dirs};
use crate::elements::{EL_EMPTY, EL_FIRE, EL_SPARK, EL_ELECTRICITY};

pub struct EnergyBehavior;

impl EnergyBehavior {
    pub fn new() -> Self {
        Self
    }
    
    /// Fire rises erratically (mirrors TypeScript updateFire)
    /// PHASE 1: Uses unsafe after bounds check
    #[inline]
    fn update_fire(&self, ctx: &mut UpdateContext) {
        let x = ctx.x;
        let y = ctx.y;
        let xi = x as i32;
        let yi = y as i32;
        
        // Fire drifts opposite gravity but can spread sideways a bit.
        let (gx, gy) = gravity_dir(ctx.gravity_x, ctx.gravity_y);
        let rise_x = -gx;
        let rise_y = -gy;
        let ((px1, py1), (px2, py2)) = perp_dirs(rise_x, rise_y);

        let rand = xorshift32(ctx.rng);
        let lateral = if rand & 1 == 0 { (px1, py1) } else { (px2, py2) };
        let other_lateral = (-lateral.0, -lateral.1);

        let diag1 = (rise_x + lateral.0, rise_y + lateral.1);
        let diag2 = (rise_x + other_lateral.0, rise_y + other_lateral.1);
        
        // Randomize attempt order to avoid straight pillars
        let attempts = match rand & 3 {
            0 => [(rise_x, rise_y), diag1, lateral, other_lateral],
            1 => [diag1, (rise_x, rise_y), diag2, lateral],
            2 => [(rise_x, rise_y), diag2, lateral, other_lateral],
            _ => [lateral, (rise_x, rise_y), diag1, diag2],
        };
        
        for (dx, dy) in attempts {
            // Skip invalid "diagonals" when rise is diagonal (can produce 0/2 steps).
            if dx.abs() > 1 || dy.abs() > 1 || (dx == 0 && dy == 0) {
                continue;
            }
            let tx = xi + dx;
            let ty = yi + dy;
            if !ctx.grid.in_bounds(tx, ty) { continue; }
            
            // SAFETY: bounds checked above
            let target = unsafe { ctx.grid.get_type_unchecked(tx as u32, ty as u32) };
            if target == EL_EMPTY {
                unsafe { ctx.grid.swap_unchecked(x, y, tx as u32, ty as u32); }
                break;
            }
        }
    }
    
    /// Spark is handled by lifetime, no movement (mirrors TypeScript)
    #[inline]
    fn update_spark(&self, _ctx: &mut UpdateContext) {
        // Spark is handled by lifetime, no movement needed
    }
    
    /// Electricity is handled by lifetime (mirrors TypeScript)
    #[inline]
    fn update_electricity(&self, _ctx: &mut UpdateContext) {
        // Electricity is handled by lifetime
    }
}

impl Behavior for EnergyBehavior {
    fn update(&self, ctx: &mut UpdateContext) {
        // SAFETY: x,y come from update_particle_chunked which guarantees valid coords
        let element = unsafe { ctx.grid.get_type_unchecked(ctx.x, ctx.y) };
        if element == EL_EMPTY { return; }
        
        match element {
            EL_FIRE => self.update_fire(ctx),
            EL_SPARK => self.update_spark(ctx),
            EL_ELECTRICITY => self.update_electricity(ctx),
            _ => {}
        }
    }
}
