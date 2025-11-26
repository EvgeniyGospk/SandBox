//! PlantBehavior - Agent-based plant growth system
//! 
//! Port from: apps/web/src/lib/engine/behaviors/PlantBehavior.ts
//! EXACT 1:1 port of the TypeScript algorithm
//! 
//! Seed: Falls like powder, germinates when touching dirt + water
//! Plant: Grows upward consuming water, affected by temperature

use super::{Behavior, UpdateContext, get_random_dir, xorshift32};
use crate::elements::{
    ELEMENT_DATA, EL_EMPTY, EL_SEED, EL_PLANT, EL_WATER, EL_DIRT, EL_SAND,
    CAT_LIQUID, get_color_with_variation
};

const SEED_DENSITY: f32 = 1100.0;

/// Grow options with weights (mirrors TypeScript exactly)
const GROW_OPTIONS: [(i32, i32, f32); 3] = [
    (0, -1, 0.6),   // Up - 60%
    (-1, -1, 0.2),  // Up-left - 20%
    (1, -1, 0.2),   // Up-right - 20%
];

pub struct PlantBehavior;

impl PlantBehavior {
    pub fn new() -> Self {
        Self
    }
    
    /// Check if seed can displace target (mirrors TypeScript canSeedDisplace)
    fn can_seed_displace(&self, ctx: &UpdateContext, x: i32, y: i32) -> bool {
        if !ctx.grid.in_bounds(x, y) { return false; }
        
        let target_type = ctx.grid.get_type(x, y);
        if target_type == EL_EMPTY { return true; }
        
        // Bounds check
        if (target_type as usize) >= ELEMENT_DATA.len() { return false; }
        
        let target_cat = ELEMENT_DATA[target_type as usize].category;
        if target_cat == CAT_LIQUID {
            return SEED_DENSITY > ELEMENT_DATA[target_type as usize].density;
        }
        
        false
    }
    
    /// Check if there's water nearby (mirrors TypeScript hasWaterNeighbor)
    fn has_water_neighbor(&self, ctx: &UpdateContext, x: i32, y: i32) -> bool {
        self.find_water(ctx, x, y, 1).is_some()
    }
    
    /// Find water within radius (mirrors TypeScript findWater)
    fn find_water(&self, ctx: &UpdateContext, cx: i32, cy: i32, radius: i32) -> Option<(i32, i32)> {
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                let nx = cx + dx;
                let ny = cy + dy;
                if ctx.grid.in_bounds(nx, ny) {
                    if ctx.grid.get_type(nx, ny) == EL_WATER {
                        return Some((nx, ny));
                    }
                }
            }
        }
        None
    }
    
    /// Transform cell to plant (mirrors TypeScript transformToPlant)
    fn transform_to_plant(&self, ctx: &mut UpdateContext, x: i32, y: i32) {
        let seed = ((x as u32 * 11 + y as u32 * 17 + ctx.frame as u32) & 31) as u8;
        let props = &ELEMENT_DATA[EL_PLANT as usize];
        
        ctx.grid.set_particle(
            x as u32, y as u32,
            EL_PLANT,
            get_color_with_variation(EL_PLANT, seed),
            props.lifetime,
            20.0  // Room temperature
        );
    }
    
    /// Process seed behavior (mirrors TypeScript processSeed)
    fn process_seed(&self, ctx: &mut UpdateContext) {
        let x = ctx.x;
        let y = ctx.y;
        let xi = x as i32;
        let yi = y as i32;
        
        // 1. Gravity - fall down
        if self.can_seed_displace(ctx, xi, yi + 1) {
            ctx.grid.swap(x, y, x, y + 1);
            return;
        }
        
        // 2. Diagonal falling
        let (dx1, dx2) = get_random_dir(ctx.frame, x);
        if self.can_seed_displace(ctx, xi + dx1, yi + 1) {
            ctx.grid.swap(x, y, (xi + dx1) as u32, y + 1);
            return;
        }
        if self.can_seed_displace(ctx, xi + dx2, yi + 1) {
            ctx.grid.swap(x, y, (xi + dx2) as u32, y + 1);
            return;
        }
        
        // 3. Germination check (EXACT TypeScript logic)
        let below_type = ctx.grid.get_type(xi, yi + 1);
        if below_type == EL_DIRT || below_type == EL_SAND {
            if self.has_water_neighbor(ctx, xi, yi) {
                self.transform_to_plant(ctx, xi, yi);
            }
        }
    }
    
    /// Process plant behavior (mirrors TypeScript processPlant)
    fn process_plant(&self, ctx: &mut UpdateContext) {
        let x = ctx.x;
        let y = ctx.y;
        let xi = x as i32;
        let yi = y as i32;
        
        // Temperature affects growth
        let temp = ctx.grid.get_temp(xi, yi);
        
        // Too cold - no growth
        if temp < 0.0 { return; }
        
        // Too hot - burns
        if temp > 150.0 {
            ctx.grid.clear_cell(x, y);
            return;
        }
        
        // 5% chance to try growing each frame (EXACT TypeScript: Math.random() > 0.05)
        let rand = xorshift32(ctx.rng);
        if (rand % 100) > 5 { return; }
        
        // Check if can grow up
        let can_grow_up = ctx.grid.in_bounds(xi, yi - 1) && ctx.grid.is_empty(xi, yi - 1);
        
        if !can_grow_up {
            // 20% chance to try growing sideways (EXACT TypeScript: Math.random() > 0.2)
            let rand2 = xorshift32(ctx.rng);
            if (rand2 % 100) > 20 { return; }
        }
        
        // Find water within radius 3
        if let Some((wx, wy)) = self.find_water(ctx, xi, yi, 3) {
            // Consume water
            ctx.grid.clear_cell(wx as u32, wy as u32);
            
            // Choose grow direction using weighted random (EXACT TypeScript)
            let rand3 = xorshift32(ctx.rng);
            let rand_f = (rand3 % 1000) as f32 / 1000.0;
            
            let mut cumulative = 0.0;
            let mut chosen = GROW_OPTIONS[0];
            
            for opt in GROW_OPTIONS.iter() {
                cumulative += opt.2;
                if rand_f < cumulative {
                    chosen = *opt;
                    break;
                }
            }
            
            let gx = xi + chosen.0;
            let gy = yi + chosen.1;
            
            if ctx.grid.in_bounds(gx, gy) && ctx.grid.is_empty(gx, gy) {
                self.transform_to_plant(ctx, gx, gy);
            }
        }
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
