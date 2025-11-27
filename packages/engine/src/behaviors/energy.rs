//! EnergyBehavior - Physics for energy particles (fire, spark, electricity)
//! 
//! Port from: apps/web/src/lib/engine/behaviors/EnergyBehavior.ts
//! PHASE 1: Optimized with unsafe access after bounds check
//! 
//! Fire rises erratically, spark/electricity move through conductors

use super::{Behavior, UpdateContext, xorshift32};
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
        
        // Fire drifts mostly upward but can spread sideways a bit.
        let rand = xorshift32(ctx.rng);
        let lateral = if rand & 1 == 0 { -1 } else { 1 };
        
        // Randomize attempt order to avoid straight pillars
        let attempts = match rand & 3 {
            0 => [(0, -1), (lateral, -1), (lateral, 0), (-lateral, 0)],
            1 => [(lateral, -1), (0, -1), (-lateral, -1), (lateral, 0)],
            2 => [(0, -1), (-lateral, -1), (lateral, 0), (-lateral, 0)],
            _ => [(lateral, 0), (0, -1), (lateral, -1), (-lateral, -1)],
        };
        
        for (dx, dy) in attempts {
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
