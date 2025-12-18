//! GasBehavior - Pure dispersion-based gas physics
//! 
//! Port from: apps/web/src/lib/engine/behaviors/GasBehavior.ts
//! PHASE 1: Optimized with unsafe access after bounds check
//! 
//! Philosophy:
//! - Gases are "inverted liquids" - they rise instead of fall
//! - Scan & teleport horizontally to find "chimneys" (openings above)
//! - Can bubble up through liquids and powders (density-based)

mod r#move;
mod scan;

use super::{Behavior, UpdateContext, get_random_dir, xorshift32, gravity_dir, perp_dirs};
use crate::elements::EL_EMPTY;

pub struct GasBehavior;

impl GasBehavior {
    pub fn new() -> Self {
        Self
    }
}

impl Behavior for GasBehavior {
    fn update(&self, ctx: &mut UpdateContext) {
        let x = ctx.x;
        let y = ctx.y;
        let xi = x as i32;
        let yi = y as i32;
        
        // SAFETY: x,y come from update_particle_chunked which guarantees valid coords
        let element = unsafe { ctx.grid.get_type_unchecked(x, y) };
        if element == EL_EMPTY { return; }

        let Some(props) = ctx.content.props(element) else {
            return;
        };
        let density = props.density;
        // Match TypeScript: props.dispersion || 5 (fallback to 5 if 0)
        let range = if props.dispersion > 0 { props.dispersion as i32 } else { 5 };
        
        // Discrete gravity direction (defaults to down if zero)
        let (gx, gy) = gravity_dir(ctx.gravity_x, ctx.gravity_y);
        let rise_x = -gx;
        let rise_y = -gy;
        let ((px1, py1), (px2, py2)) = perp_dirs(rise_x, rise_y);
        let (s1, s2) = if rise_x == 0 { get_random_dir(ctx.frame, x) } else { get_random_dir(ctx.frame, y) };
        
        // --- 1. Rise (against gravity) ---
        if r#move::try_rise(ctx, x, y, xi + rise_x, yi + rise_y, density) { return; }
        
        // --- 2. Rise DIAGONALLY ---
        if rise_x == 0 || rise_y == 0 {
            // Axis-aligned rise: true diagonals (rise + lateral).
            let (dx1, dy1, dx2, dy2) = if rise_x == 0 {
                // Vertical gravity → diagonals are (±1, rise_y)
                (s1, rise_y, s2, rise_y)
            } else {
                // Horizontal gravity → diagonals are (rise_x, ±1)
                (rise_x, s1, rise_x, s2)
            };
            if r#move::try_rise(ctx, x, y, xi + dx1, yi + dy1, density) { return; }
            if r#move::try_rise(ctx, x, y, xi + dx2, yi + dy2, density) { return; }
        } else {
            // Diagonal rise: try axis components as a fallback.
            if r#move::try_rise(ctx, x, y, xi + rise_x, yi, density) { return; }
            if r#move::try_rise(ctx, x, y, xi, yi + rise_y, density) { return; }
        }
        
        // --- 3. Dispersion: Scan ceiling for chimneys (EXACT TypeScript) ---
        let left_target = scan::scan_ceiling(ctx, xi, yi, px1, py1, range, density, rise_x, rise_y);
        let right_target = scan::scan_ceiling(ctx, xi, yi, px2, py2, range, density, rise_x, rise_y);
        
        let target = if left_target.found && right_target.found {
            if left_target.has_chimney && !right_target.has_chimney {
                left_target
            } else if !left_target.has_chimney && right_target.has_chimney {
                right_target
            } else {
                // Random choice
                let rand = xorshift32(ctx.rng);
                if rand & 1 == 0 { left_target } else { right_target }
            }
        } else if left_target.found {
            left_target
        } else if right_target.found {
            right_target
        } else {
            scan::ScanResult { found: false, x: xi, y: yi, has_chimney: false }
        };
        
        if target.found && (target.x != xi || target.y != yi) {
            unsafe { ctx.grid.swap_unchecked(x, y, target.x as u32, target.y as u32); }
        }
    }
}
