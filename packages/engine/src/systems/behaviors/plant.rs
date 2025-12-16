//! PlantBehavior - Agent-based plant growth system
//! 
//! Port from: apps/web/src/lib/engine/behaviors/PlantBehavior.ts
//! EXACT 1:1 port of the TypeScript algorithm
//! 
//! Seed: Falls like powder, germinates when touching dirt + water
//! Plant: Grows upward consuming water, affected by temperature

mod seed;
mod water;
mod transform;
mod grow;

use super::{Behavior, UpdateContext};
use crate::elements::{EL_EMPTY, EL_PLANT, EL_SEED};

const SEED_DENSITY: f32 = 1100.0;

/// Grow weights (mirrors TypeScript proportions)
const GROW_W_UP: f32 = 0.6;
const GROW_W_DIAG: f32 = 0.2;

pub struct PlantBehavior;

impl PlantBehavior {
    pub fn new() -> Self {
        Self
    }
    
    /// Check if seed can displace target (mirrors TypeScript canSeedDisplace)
    #[allow(dead_code)]
    #[inline]
    fn can_seed_displace(&self, ctx: &UpdateContext, x: i32, y: i32) -> bool {
        seed::can_seed_displace(ctx, x, y)
    }
    
    /// Check if there's water nearby (mirrors TypeScript hasWaterNeighbor)
    #[allow(dead_code)]
    #[inline]
    fn has_water_neighbor(&self, ctx: &UpdateContext, x: i32, y: i32) -> bool {
        water::has_water_neighbor(ctx, x, y)
    }
    
    /// Find water within radius (mirrors TypeScript findWater)
    #[allow(dead_code)]
    #[inline]
    fn find_water(&self, ctx: &UpdateContext, cx: i32, cy: i32, radius: i32) -> Option<(i32, i32)> {
        water::find_water(ctx, cx, cy, radius)
    }
    
    /// Transform cell to plant (mirrors TypeScript transformToPlant)
    #[allow(dead_code)]
    #[inline]
    fn transform_to_plant(&self, ctx: &mut UpdateContext, x: i32, y: i32) {
        transform::transform_to_plant(ctx, x, y)
    }
    
    /// Process seed behavior (mirrors TypeScript processSeed)
    #[inline]
    fn process_seed(&self, ctx: &mut UpdateContext) {
        seed::process_seed(ctx)
    }
    
    /// Process plant behavior (mirrors TypeScript processPlant)
    #[inline]
    fn process_plant(&self, ctx: &mut UpdateContext) {
        grow::process_plant(ctx)
    }
}

impl Behavior for PlantBehavior {
    fn update(&self, ctx: &mut UpdateContext) {
        let xi = ctx.x as i32;
        let yi = ctx.y as i32;
        
        let element = ctx.grid.get_type(xi, yi);
        if element == EL_EMPTY { return; }
        
        if element == EL_SEED {
            self.process_seed(ctx);
        } else if element == EL_PLANT {
            self.process_plant(ctx);
        }
    }
}
