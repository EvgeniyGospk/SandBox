//! GasBehavior - Pure dispersion-based gas physics
//! 
//! Port from: apps/web/src/lib/engine/behaviors/GasBehavior.ts
//! EXACT 1:1 port of the TypeScript algorithm
//! 
//! Philosophy:
//! - Gases are "inverted liquids" - they rise instead of fall
//! - Scan & teleport horizontally to find "chimneys" (openings above)
//! - Can bubble up through liquids and powders (density-based)

use super::{Behavior, UpdateContext, get_random_dir, xorshift32};
use crate::elements::{ELEMENT_DATA, EL_EMPTY, CAT_SOLID};

/// Result of scanning ceiling for chimneys
struct ScanResult {
    found: bool,
    x: i32,
    has_chimney: bool,
}

pub struct GasBehavior;

impl GasBehavior {
    pub fn new() -> Self {
        Self
    }
    
    /// Try to rise to target cell (mirrors TypeScript tryRise)
    fn try_rise(&self, ctx: &mut UpdateContext, from_x: u32, from_y: u32, to_x: i32, to_y: i32, my_density: f32) -> bool {
        if !ctx.grid.in_bounds(to_x, to_y) { return false; }
        
        let target_type = ctx.grid.get_type(to_x, to_y);
        
        // Empty cell - just rise
        if target_type == EL_EMPTY {
            ctx.grid.swap(from_x, from_y, to_x as u32, to_y as u32);
            return true;
        }
        
        // Bounds check
        if (target_type as usize) >= ELEMENT_DATA.len() { return false; }
        
        // Can we bubble through? (target must be heavier and not solid)
        let t_cat = ELEMENT_DATA[target_type as usize].category;
        
        if t_cat != CAT_SOLID {
            let t_density = ELEMENT_DATA[target_type as usize].density;
            if t_density > my_density {
                ctx.grid.swap(from_x, from_y, to_x as u32, to_y as u32);
                return true;
            }
        }
        
        false
    }
    
    /// Scan ceiling for chimneys (mirrors TypeScript scanCeiling)
    fn scan_ceiling(&self, ctx: &UpdateContext, start_x: i32, y: i32, dir: i32, range: i32, my_density: f32) -> ScanResult {
        let mut best_x = start_x;
        let mut found = false;
        let mut has_chimney = false;
        
        for i in 1..=range {
            let tx = start_x + (dir * i);
            
            if !ctx.grid.in_bounds(tx, y) { break; }
            
            let target_type = ctx.grid.get_type(tx, y);
            
            // CASE 1: Empty cell
            if target_type == EL_EMPTY {
                best_x = tx;
                found = true;
                
                // Check for chimney above
                if ctx.grid.in_bounds(tx, y - 1) {
                    let above_type = ctx.grid.get_type(tx, y - 1);
                    if above_type == EL_EMPTY {
                        has_chimney = true;
                        break;
                    }
                    if (above_type as usize) < ELEMENT_DATA.len() {
                        if ELEMENT_DATA[above_type as usize].density > my_density {
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
                    found = true;
                    break;
                }
            }
            
            // CASE 3: Wall or lighter/same gas - stop
            break;
        }
        
        ScanResult { found, x: best_x, has_chimney }
    }
}

impl Behavior for GasBehavior {
    fn update(&self, ctx: &mut UpdateContext) {
        let x = ctx.x;
        let y = ctx.y;
        let xi = x as i32;
        let yi = y as i32;
        
        // Get element type
        let element = ctx.grid.get_type(xi, yi);
        if element == EL_EMPTY { return; }
        if (element as usize) >= ELEMENT_DATA.len() { return; }
        
        let props = &ELEMENT_DATA[element as usize];
        let density = props.density;
        // Match TypeScript: props.dispersion || 5 (fallback to 5 if 0)
        let range = if props.dispersion > 0 { props.dispersion as i32 } else { 5 };
        
        let (dx1, dx2) = get_random_dir(ctx.frame, x);
        
        // --- 1. Rise UP (against gravity) ---
        if self.try_rise(ctx, x, y, xi, yi - 1, density) { return; }
        
        // --- 2. Rise DIAGONALLY ---
        if self.try_rise(ctx, x, y, xi + dx1, yi - 1, density) { return; }
        if self.try_rise(ctx, x, y, xi + dx2, yi - 1, density) { return; }
        
        // --- 3. Dispersion: Scan ceiling for chimneys (EXACT TypeScript) ---
        let left_target = self.scan_ceiling(ctx, xi, yi, -1, range, density);
        let right_target = self.scan_ceiling(ctx, xi, yi, 1, range, density);
        
        let target_x = if left_target.found && right_target.found {
            if left_target.has_chimney && !right_target.has_chimney {
                left_target.x
            } else if !left_target.has_chimney && right_target.has_chimney {
                right_target.x
            } else {
                // Random choice
                let rand = xorshift32(ctx.rng);
                if rand & 1 == 0 { left_target.x } else { right_target.x }
            }
        } else if left_target.found {
            left_target.x
        } else if right_target.found {
            right_target.x
        } else {
            xi
        };
        
        if target_x != xi {
            ctx.grid.swap(x, y, target_x as u32, y);
        }
    }
}
