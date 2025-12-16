//! PlantBehavior - Agent-based plant growth system
//! 
//! Port from: apps/web/src/lib/engine/behaviors/PlantBehavior.ts
//! EXACT 1:1 port of the TypeScript algorithm
//! 
//! Seed: Falls like powder, germinates when touching dirt + water
//! Plant: Grows upward consuming water, affected by temperature

use super::{Behavior, UpdateContext, get_random_dir, xorshift32, gravity_dir, perp_dirs};
use crate::elements::{
    ELEMENT_DATA, EL_EMPTY, EL_SEED, EL_PLANT, EL_WATER, EL_DIRT, EL_SAND,
    CAT_LIQUID, get_color_with_variation
};

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
        
        ctx.set_particle_dirty(
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

        let (gx, gy) = gravity_dir(ctx.gravity_x, ctx.gravity_y);
        
        // 1. Gravity - fall in gravity direction
        if self.can_seed_displace(ctx, xi + gx, yi + gy) {
            ctx.grid.swap(x, y, (xi + gx) as u32, (yi + gy) as u32);
            return;
        }
        
        // 2. Diagonal falling (relative to gravity)
        if gx == 0 || gy == 0 {
            let lateral_key = if gx == 0 { x } else { y };
            let (s1, s2) = get_random_dir(ctx.frame, lateral_key);
            let (dx1, dy1, dx2, dy2) = if gx == 0 {
                // Vertical gravity → diagonals are (±1, gy)
                (s1, gy, s2, gy)
            } else {
                // Horizontal gravity → diagonals are (gx, ±1)
                (gx, s1, gx, s2)
            };

            if self.can_seed_displace(ctx, xi + dx1, yi + dy1) {
                ctx.grid.swap(x, y, (xi + dx1) as u32, (yi + dy1) as u32);
                return;
            }
            if self.can_seed_displace(ctx, xi + dx2, yi + dy2) {
                ctx.grid.swap(x, y, (xi + dx2) as u32, (yi + dy2) as u32);
                return;
            }
        } else {
            // Diagonal gravity: try stepping along each axis component.
            let prefer_first = ((ctx.frame as u32 + x + y) & 1) == 0;
            let candidates = if prefer_first {
                [(gx, 0), (0, gy)]
            } else {
                [(0, gy), (gx, 0)]
            };
            for (dx, dy) in candidates {
                if self.can_seed_displace(ctx, xi + dx, yi + dy) {
                    ctx.grid.swap(x, y, (xi + dx) as u32, (yi + dy) as u32);
                    return;
                }
            }
        }
        
        // 3. Germination check (EXACT TypeScript logic)
        let below_type = ctx.grid.get_type(xi + gx, yi + gy);
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

        // Plants grow opposite gravity.
        let (gx, gy) = gravity_dir(ctx.gravity_x, ctx.gravity_y);
        let up_x = -gx;
        let up_y = -gy;
        let ((lx, ly), (rx, ry)) = perp_dirs(up_x, up_y);
        
        // Temperature affects growth
        let temp = ctx.grid.get_temp(xi, yi);
        
        // Too cold - no growth
        if temp < 0.0 { return; }
        
        // Too hot - burns
        if temp > 150.0 {
            ctx.clear_cell_dirty(x, y);
            return;
        }
        
        // 5% chance to try growing each frame (EXACT TypeScript: Math.random() > 0.05)
        // PHASE 1 OPT: fast-range reduction instead of % 100
        let rand = ((xorshift32(ctx.rng) as u64 * 100) >> 32) as u32;
        if rand > 5 { return; }
        
        // Check if can grow "up" (against gravity)
        let can_grow_up = ctx.grid.in_bounds(xi + up_x, yi + up_y) && ctx.grid.is_empty(xi + up_x, yi + up_y);
        
        if !can_grow_up {
            // 20% chance to try growing sideways (EXACT TypeScript: Math.random() > 0.2)
            // PHASE 1 OPT: fast-range reduction instead of % 100
            let rand2 = ((xorshift32(ctx.rng) as u64 * 100) >> 32) as u32;
            if rand2 > 20 { return; }
        }
        
        // Find water within radius 3
            if let Some((wx, wy)) = self.find_water(ctx, xi, yi, 3) {
                // Consume water
                ctx.clear_cell_dirty(wx as u32, wy as u32);
            
            // Choose grow direction using weighted random (mirrors TypeScript weights)
            // PHASE 1 OPT: fast-range reduction instead of % 1000
            let rand3 = ((xorshift32(ctx.rng) as u64 * 1000) >> 32) as u32;
            let rand_f = rand3 as f32 / 1000.0;

            let options: [(i32, i32, f32); 3] = if up_x == 0 || up_y == 0 {
                // Axis-aligned up: true diagonals (up + lateral).
                [
                    (up_x, up_y, GROW_W_UP),
                    (up_x + lx, up_y + ly, GROW_W_DIAG),
                    (up_x + rx, up_y + ry, GROW_W_DIAG),
                ]
            } else {
                // Diagonal up: keep main diagonal, plus axis components as "diagonals".
                [
                    (up_x, up_y, GROW_W_UP),
                    (up_x, 0, GROW_W_DIAG),
                    (0, up_y, GROW_W_DIAG),
                ]
            };

            let mut cumulative = 0.0;
            let mut chosen = options[0];
            for opt in options.iter() {
                cumulative += opt.2;
                if rand_f < cumulative {
                    chosen = *opt;
                    break;
                }
            }

            let tx = xi + chosen.0;
            let ty = yi + chosen.1;

            if ctx.grid.in_bounds(tx, ty) && ctx.grid.is_empty(tx, ty) {
                self.transform_to_plant(ctx, tx, ty);
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
