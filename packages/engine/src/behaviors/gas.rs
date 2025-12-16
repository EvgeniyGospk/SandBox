//! GasBehavior - Pure dispersion-based gas physics
//! 
//! Port from: apps/web/src/lib/engine/behaviors/GasBehavior.ts
//! PHASE 1: Optimized with unsafe access after bounds check
//! 
//! Philosophy:
//! - Gases are "inverted liquids" - they rise instead of fall
//! - Scan & teleport horizontally to find "chimneys" (openings above)
//! - Can bubble up through liquids and powders (density-based)

use super::{Behavior, UpdateContext, get_random_dir, xorshift32, gravity_dir, perp_dirs};
use crate::elements::{ELEMENT_DATA, EL_EMPTY, CAT_SOLID};

/// Result of scanning ceiling for chimneys
struct ScanResult {
    found: bool,
    x: i32,
    y: i32,
    has_chimney: bool,
}

pub struct GasBehavior;

impl GasBehavior {
    pub fn new() -> Self {
        Self
    }
    
    /// Try to rise to target cell (mirrors TypeScript tryRise)
    /// PHASE 1: Uses unsafe after bounds check
    #[inline]
    fn try_rise(&self, ctx: &mut UpdateContext, from_x: u32, from_y: u32, to_x: i32, to_y: i32, my_density: f32) -> bool {
        if !ctx.grid.in_bounds(to_x, to_y) { return false; }
        
        // SAFETY: We just checked in_bounds above
        let target_type = unsafe { ctx.grid.get_type_unchecked(to_x as u32, to_y as u32) };
        
        // Empty cell - just rise
        if target_type == EL_EMPTY {
            unsafe { ctx.grid.swap_unchecked(from_x, from_y, to_x as u32, to_y as u32); }
            return true;
        }
        
        // Bounds check
        if (target_type as usize) >= ELEMENT_DATA.len() { return false; }
        
        // Can we bubble through? (target must be heavier and not solid)
        let t_cat = ELEMENT_DATA[target_type as usize].category;
        
        if t_cat != CAT_SOLID {
            let t_density = ELEMENT_DATA[target_type as usize].density;
            if t_density > my_density {
                unsafe { ctx.grid.swap_unchecked(from_x, from_y, to_x as u32, to_y as u32); }
                return true;
            }
        }
        
        false
    }
    
    /// Scan along the "ceiling" axis (perpendicular to rise) for chimneys.
    /// PHASE 1: Uses unsafe after bounds check
    #[inline]
    fn scan_ceiling(
        &self,
        ctx: &UpdateContext,
        start_x: i32,
        start_y: i32,
        dir_x: i32,
        dir_y: i32,
        range: i32,
        my_density: f32,
        rise_x: i32,
        rise_y: i32,
    ) -> ScanResult {
        let mut best_x = start_x;
        let mut best_y = start_y;
        let mut found = false;
        let mut has_chimney = false;
        
        for i in 1..=range {
            let tx = start_x + (dir_x * i);
            let ty = start_y + (dir_y * i);
            
            if !ctx.grid.in_bounds(tx, ty) { break; }
            
            // SAFETY: We just checked in_bounds above
            let target_type = unsafe { ctx.grid.get_type_unchecked(tx as u32, ty as u32) };
            
            // CASE 1: Empty cell
            if target_type == EL_EMPTY {
                best_x = tx;
                best_y = ty;
                found = true;
                
                // Check for chimney in rise direction
                let ahead_x = tx + rise_x;
                let ahead_y = ty + rise_y;
                if ctx.grid.in_bounds(ahead_x, ahead_y) {
                    let ahead_type = unsafe { ctx.grid.get_type_unchecked(ahead_x as u32, ahead_y as u32) };
                    if ahead_type == EL_EMPTY {
                        has_chimney = true;
                        break;
                    }
                    if (ahead_type as usize) < ELEMENT_DATA.len() {
                        if ELEMENT_DATA[ahead_type as usize].density > my_density {
                            has_chimney = true;
                            break;
                        }
                    }
                }
                continue;
            }
            
            // Bounds check
            if (target_type as usize) >= ELEMENT_DATA.len() { break; }
            
            // CASE 2: Occupied - can we displace it?
            let t_cat = ELEMENT_DATA[target_type as usize].category;
            
            if t_cat != CAT_SOLID {
                let t_density = ELEMENT_DATA[target_type as usize].density;
                if t_density > my_density {
                    best_x = tx;
                    best_y = ty;
                    found = true;
                    break;
                }
            }
            
            // CASE 3: Wall or lighter/same gas - stop
            break;
        }
        
        ScanResult { found, x: best_x, y: best_y, has_chimney }
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
        if (element as usize) >= ELEMENT_DATA.len() { return; }
        
        let props = &ELEMENT_DATA[element as usize];
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
        if self.try_rise(ctx, x, y, xi + rise_x, yi + rise_y, density) { return; }
        
        // --- 2. Rise DIAGONALLY ---
        if rise_x == 0 || rise_y == 0 {
            // Axis-aligned rise: true diagonals (rise + lateral).
            let (dx1, dy1, dx2, dy2) = if rise_x == 0 {
                (s1, rise_y, s2, rise_y)
            } else {
                (rise_x, s1, rise_x, s2)
            };
            if self.try_rise(ctx, x, y, xi + dx1, yi + dy1, density) { return; }
            if self.try_rise(ctx, x, y, xi + dx2, yi + dy2, density) { return; }
        } else {
            // Diagonal rise: try axis components as a fallback.
            if self.try_rise(ctx, x, y, xi + rise_x, yi, density) { return; }
            if self.try_rise(ctx, x, y, xi, yi + rise_y, density) { return; }
        }
        
        // --- 3. Dispersion: Scan ceiling for chimneys (EXACT TypeScript) ---
        let left_target = self.scan_ceiling(ctx, xi, yi, px1, py1, range, density, rise_x, rise_y);
        let right_target = self.scan_ceiling(ctx, xi, yi, px2, py2, range, density, rise_x, rise_y);
        
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
            ScanResult { found: false, x: xi, y: yi, has_chimney: false }
        };
        
        if target.found && (target.x != xi || target.y != yi) {
            unsafe { ctx.grid.swap_unchecked(x, y, target.x as u32, target.y as u32); }
        }
    }
}
