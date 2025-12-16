use super::super::{UpdateContext, gravity_dir, get_random_dir};
use crate::elements::{
    ELEMENT_DATA, EL_EMPTY, EL_DIRT, EL_SAND,
    CAT_LIQUID,
};

use super::water::has_water_neighbor;
use super::transform::transform_to_plant;
use super::SEED_DENSITY;

/// Check if seed can displace target (mirrors TypeScript canSeedDisplace)
pub(super) fn can_seed_displace(ctx: &UpdateContext, x: i32, y: i32) -> bool {
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

/// Process seed behavior (mirrors TypeScript processSeed)
pub(super) fn process_seed(ctx: &mut UpdateContext) {
    let x = ctx.x;
    let y = ctx.y;
    let xi = x as i32;
    let yi = y as i32;

    let (gx, gy) = gravity_dir(ctx.gravity_x, ctx.gravity_y);

    // 1. Gravity - fall in gravity direction
    if can_seed_displace(ctx, xi + gx, yi + gy) {
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

        if can_seed_displace(ctx, xi + dx1, yi + dy1) {
            ctx.grid.swap(x, y, (xi + dx1) as u32, (yi + dy1) as u32);
            return;
        }
        if can_seed_displace(ctx, xi + dx2, yi + dy2) {
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
            if can_seed_displace(ctx, xi + dx, yi + dy) {
                ctx.grid.swap(x, y, (xi + dx) as u32, (yi + dy) as u32);
                return;
            }
        }
    }

    // 3. Germination check (EXACT TypeScript logic)
    let below_type = ctx.grid.get_type(xi + gx, yi + gy);
    if below_type == EL_DIRT || below_type == EL_SAND {
        if has_water_neighbor(ctx, xi, yi) {
            transform_to_plant(ctx, xi, yi);
        }
    }
}
