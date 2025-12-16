use super::super::{UpdateContext, gravity_dir, perp_dirs, xorshift32};
use crate::elements::{
    ELEMENT_DATA,
};

use super::transform::transform_to_plant;
use super::water::find_water;
use super::{GROW_W_DIAG, GROW_W_UP};

/// Process plant behavior (mirrors TypeScript processPlant)
pub(super) fn process_plant(ctx: &mut UpdateContext) {
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
    if let Some((wx, wy)) = find_water(ctx, xi, yi, 3) {
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
            transform_to_plant(ctx, tx, ty);
        }
    }

    // Keep legacy reference so `ELEMENT_DATA` is used (avoids unused import in some cfgs)
    let _ = ELEMENT_DATA.len();
}
