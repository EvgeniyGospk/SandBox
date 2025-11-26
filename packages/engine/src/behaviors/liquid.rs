//! LiquidBehavior - Pure dispersion-based liquid physics
//! 
//! Port from: apps/web/src/lib/engine/behaviors/LiquidBehavior.ts
//! EXACT 1:1 port of the TypeScript algorithm
//! 
//! Philosophy:
//! - No mass, no pressure formulas - just discrete particle movement
//! - Liquids "scan & teleport" up to N cells horizontally (dispersion rate)
//! - Prioritizes falling into holes/cliffs for waterfall effect
//! - Heavier liquids can push lighter ones horizontally for level equalization

use super::{Behavior, UpdateContext, get_random_dir, xorshift32};
use crate::elements::{ELEMENT_DATA, EL_EMPTY, CAT_LIQUID, CAT_GAS};

/// Result of scanning a horizontal line
struct ScanResult {
    found: bool,
    x: i32,
    has_cliff: bool,
}

pub struct LiquidBehavior;

impl LiquidBehavior {
    pub fn new() -> Self {
        Self
    }
    
    /// Try to move liquid to target cell (mirrors TypeScript tryMove)
    fn try_move(&self, ctx: &mut UpdateContext, from_x: u32, from_y: u32, to_x: i32, to_y: i32, my_density: f32) -> bool {
        if !ctx.grid.in_bounds(to_x, to_y) { return false; }
        
        let target_type = ctx.grid.get_type(to_x, to_y);
        
        // Empty cell - just move
        if target_type == EL_EMPTY {
            ctx.grid.swap(from_x, from_y, to_x as u32, to_y as u32);
            return true;
        }
        
        // Bounds check
        if (target_type as usize) >= ELEMENT_DATA.len() { return false; }
        
        // Check if we can displace (heavier sinks into lighter)
        let t_cat = ELEMENT_DATA[target_type as usize].category;
        if t_cat == CAT_LIQUID || t_cat == CAT_GAS {
            if my_density > ELEMENT_DATA[target_type as usize].density {
                ctx.grid.swap(from_x, from_y, to_x as u32, to_y as u32);
                return true;
            }
        }
        
        false
    }
    
    /// Scan horizontally for empty cells or cliffs (mirrors TypeScript scanLine)
    fn scan_line(&self, ctx: &UpdateContext, start_x: i32, y: i32, dir: i32, range: i32, my_density: f32) -> ScanResult {
        let mut best_x = start_x;
        let mut found = false;
        let mut has_cliff = false;
        
        for i in 1..=range {
            let tx = start_x + (dir * i);
            
            if !ctx.grid.in_bounds(tx, y) { break; }
            
            let target_type = ctx.grid.get_type(tx, y);
            
            // CASE 1: Empty cell
            if target_type == EL_EMPTY {
                best_x = tx;
                found = true;
                
                // Check for cliff below (waterfall effect)
                if ctx.grid.in_bounds(tx, y + 1) && ctx.grid.is_empty(tx, y + 1) {
                    has_cliff = true;
                    break;
                }
                continue;
            }
            
            // Bounds check
            if (target_type as usize) >= ELEMENT_DATA.len() { break; }
            
            // CASE 2: Occupied cell - check if we can displace
            let t_cat = ELEMENT_DATA[target_type as usize].category;
            
            if t_cat == CAT_LIQUID || t_cat == CAT_GAS {
                let t_density = ELEMENT_DATA[target_type as usize].density;
                
                if my_density > t_density {
                    best_x = tx;
                    found = true;
                    break;
                }
            }
            
            // CASE 3: Wall or same/heavier liquid - stop scanning
            break;
        }
        
        ScanResult { found, x: best_x, has_cliff }
    }
}

impl Behavior for LiquidBehavior {
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
        
        // --- 1. Gravity: Fall Down ---
        if self.try_move(ctx, x, y, xi, yi + 1, density) { return; }
        
        // --- 2. Gravity: Fall Diagonally ---
        if self.try_move(ctx, x, y, xi + dx1, yi + 1, density) { return; }
        if self.try_move(ctx, x, y, xi + dx2, yi + 1, density) { return; }
        
        // --- 3. Dispersion: Scan & Teleport (EXACT TypeScript algorithm) ---
        let left_target = self.scan_line(ctx, xi, yi, -1, range, density);
        let right_target = self.scan_line(ctx, xi, yi, 1, range, density);
        
        // Choose best target (mirrors TypeScript logic exactly)
        let target_x = if left_target.found && right_target.found {
            if left_target.has_cliff && !right_target.has_cliff {
                left_target.x
            } else if !left_target.has_cliff && right_target.has_cliff {
                right_target.x
            } else {
                // Both have space - random choice (using frame + x for determinism)
                let rand = xorshift32(ctx.rng);
                if rand & 1 == 0 { left_target.x } else { right_target.x }
            }
        } else if left_target.found {
            left_target.x
        } else if right_target.found {
            right_target.x
        } else {
            xi // No movement
        };
        
        if target_x != xi {
            ctx.grid.swap(x, y, target_x as u32, y);
        }
    }
}
