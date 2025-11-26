//! EnergyBehavior - Physics for energy particles (fire, spark, electricity)
//! 
//! Port from: apps/web/src/lib/engine/behaviors/EnergyBehavior.ts
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
    fn update_fire(&self, ctx: &mut UpdateContext) {
        let x = ctx.x;
        let y = ctx.y;
        let xi = x as i32;
        let yi = y as i32;
        
        // Fire rises erratically (EXACT TypeScript: const rand = (frame * x * y) & 3)
        let rand = (ctx.frame as u32).wrapping_mul(x).wrapping_mul(y) & 3;
        
        match rand {
            0 => {
                if ctx.grid.is_empty(xi, yi - 1) {
                    ctx.grid.swap(x, y, x, (yi - 1) as u32);
                }
            }
            1 => {
                if ctx.grid.is_empty(xi - 1, yi - 1) {
                    ctx.grid.swap(x, y, (xi - 1) as u32, (yi - 1) as u32);
                }
            }
            2 => {
                if ctx.grid.is_empty(xi + 1, yi - 1) {
                    ctx.grid.swap(x, y, (xi + 1) as u32, (yi - 1) as u32);
                }
            }
            _ => {}
        }
    }
    
    /// Spark is handled by lifetime, no movement (mirrors TypeScript)
    fn update_spark(&self, _ctx: &mut UpdateContext) {
        // Spark is handled by lifetime, no movement needed
    }
    
    /// Electricity is handled by lifetime (mirrors TypeScript)
    fn update_electricity(&self, _ctx: &mut UpdateContext) {
        // Electricity is handled by lifetime
    }
}

impl Behavior for EnergyBehavior {
    fn update(&self, ctx: &mut UpdateContext) {
        let xi = ctx.x as i32;
        let yi = ctx.y as i32;
        
        let element = ctx.grid.get_type(xi, yi);
        if element == EL_EMPTY { return; }
        
        match element {
            EL_FIRE => self.update_fire(ctx),
            EL_SPARK => self.update_spark(ctx),
            EL_ELECTRICITY => self.update_electricity(ctx),
            _ => {}
        }
    }
}
