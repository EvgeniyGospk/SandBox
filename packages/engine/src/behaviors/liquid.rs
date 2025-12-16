//! LiquidBehavior - Horizontal dispersion only
//! 
//! Phase 2: Vertical movement handled by physics.rs
//! 
//! Philosophy:
//! - No mass, no pressure formulas - just discrete particle movement
//! - Liquids "scan & teleport" up to N cells horizontally (dispersion rate)
//! - Prioritizes falling into holes/cliffs for waterfall effect
//! - Heavier liquids can push lighter ones horizontally for level equalization
//! 
//! Phase 2: Vertical falling is now done by velocity-based physics

use super::{Behavior, UpdateContext, xorshift32, gravity_dir, perp_dirs};
use crate::elements::{ELEMENT_DATA, EL_EMPTY, CAT_LIQUID, CAT_GAS};
use std::cell::RefCell;

thread_local! {
    pub static PERF_LIQUID_SCANS: RefCell<u64> = RefCell::new(0);
}

pub fn reset_liquid_scan_counter() {
    PERF_LIQUID_SCANS.with(|c| *c.borrow_mut() = 0);
}

pub fn take_liquid_scan_counter() -> u64 {
    PERF_LIQUID_SCANS.with(|c| {
        let val = *c.borrow();
        *c.borrow_mut() = 0;
        val
    })
}

/// Result of scanning a horizontal line
struct ScanResult {
    found: bool,
    x: i32,
    y: i32,
    has_cliff: bool,
}

pub struct LiquidBehavior;

impl LiquidBehavior {
    pub fn new() -> Self {
        Self
    }
    
    /// Try to move liquid to target cell (mirrors TypeScript tryMove)
    /// PHASE 1: Uses unsafe after bounds check
    #[inline]
    fn try_move(&self, ctx: &mut UpdateContext, from_x: u32, from_y: u32, to_x: i32, to_y: i32, my_density: f32) -> bool {
        if !ctx.grid.in_bounds(to_x, to_y) { return false; }
        
        // SAFETY: We just checked in_bounds above
        let target_type = unsafe { ctx.grid.get_type_unchecked(to_x as u32, to_y as u32) };
        
        // Empty cell - just move
        if target_type == EL_EMPTY {
            // SAFETY: Both coords verified (from_x/from_y from caller, to_x/to_y from in_bounds)
            unsafe { ctx.grid.swap_unchecked(from_x, from_y, to_x as u32, to_y as u32); }
            return true;
        }
        
        // Bounds check
        if (target_type as usize) >= ELEMENT_DATA.len() { return false; }
        
        // Check if we can displace (heavier sinks into lighter)
        let t_cat = ELEMENT_DATA[target_type as usize].category;
        if t_cat == CAT_LIQUID || t_cat == CAT_GAS {
            if my_density > ELEMENT_DATA[target_type as usize].density {
                unsafe { ctx.grid.swap_unchecked(from_x, from_y, to_x as u32, to_y as u32); }
                return true;
            }
        }
        
        false
    }
    
    /// Scan along a "horizontal" axis (perpendicular to gravity) for empty cells or cliffs.
    /// PHASE 1: Uses unsafe after bounds check
    #[inline]
    fn scan_line(
        &self,
        ctx: &UpdateContext,
        start_x: i32,
        start_y: i32,
        dir_x: i32,
        dir_y: i32,
        range: i32,
        my_density: f32,
        gx: i32,
        gy: i32,
    ) -> ScanResult {
        let mut best_x = start_x;
        let mut best_y = start_y;
        let mut found = false;
        let mut has_cliff = false;

        PERF_LIQUID_SCANS.with(|c| {
            let mut v = c.borrow_mut();
            *v = v.saturating_add(1);
        });
        
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
                
                // Check for cliff below (waterfall effect)
                let below_x = tx + gx;
                let below_y = ty + gy;
                if ctx.grid.in_bounds(below_x, below_y) {
                    // SAFETY: We just checked in_bounds above
                    let below_type = unsafe { ctx.grid.get_type_unchecked(below_x as u32, below_y as u32) };
                    if below_type == EL_EMPTY {
                        has_cliff = true;
                        break;
                    }
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
                    best_y = ty;
                    found = true;
                    break;
                }
            }
            
            // CASE 3: Wall or same/heavier liquid - stop scanning
            break;
        }
        
        ScanResult { found, x: best_x, y: best_y, has_cliff }
    }
}

impl Behavior for LiquidBehavior {
    fn update(&self, ctx: &mut UpdateContext) {
        let x = ctx.x;
        let y = ctx.y;
        let xi = x as i32;
        let yi = y as i32;
        
        let element = unsafe { ctx.grid.get_type_unchecked(x, y) };
        if element == EL_EMPTY { return; }
        if (element as usize) >= ELEMENT_DATA.len() { return; }
        
        let props = &ELEMENT_DATA[element as usize];
        let density = props.density;
        let range = if props.dispersion > 0 { props.dispersion as i32 } else { 5 };

        // Discrete gravity direction (defaults to down if zero)
        let (gx, gy) = gravity_dir(ctx.gravity_x, ctx.gravity_y);
        let ((px1, py1), (px2, py2)) = perp_dirs(gx, gy);
        
        // Phase 2: Check if we should do dispersion
        // We disperse when:
        // 1. At boundary in gravity direction
        // 2. Blocked by solid/heavy particle in gravity direction
        // 3. Has very low velocity (settled/resting state)
        let adj_x = xi + gx;
        let adj_y = yi + gy;
        
        // Check velocity - if we have significant velocity in gravity direction, let physics handle it
        let idx = ctx.grid.index(x, y);
        let vx = ctx.grid.vx[idx];
        let vy = ctx.grid.vy[idx];
        let v_parallel = vx * (gx as f32) + vy * (gy as f32);
        let moving_in_gravity_dir = v_parallel > 0.3;
        
        // If actively moving in gravity direction with velocity, skip dispersion - physics will handle it
        if moving_in_gravity_dir {
            return;
        }
        
        let blocked_in_gravity_dir = if !ctx.grid.in_bounds(adj_x, adj_y) {
            true // boundary is blocking
        } else {
            let adj_type = unsafe { ctx.grid.get_type_unchecked(adj_x as u32, adj_y as u32) };
            // Blocked if cell in gravity direction is occupied (not empty)
            adj_type != EL_EMPTY
        };
        
        // If not blocked and not moving, still try dispersion (particle might be settling)
        // This fixes the issue where particles wait for physics when they should spread
        if !blocked_in_gravity_dir {
            // Check if there's a "cliff" nearby - empty space in gravity direction at neighboring X
            // If so, we should still try to spread towards it
            let has_nearby_cliff = {
                let cliff1_x = xi + px1 + gx;
                let cliff1_y = yi + py1 + gy;
                let cliff2_x = xi + px2 + gx;
                let cliff2_y = yi + py2 + gy;

                let c1 = if ctx.grid.in_bounds(cliff1_x, cliff1_y) {
                    unsafe { ctx.grid.get_type_unchecked(cliff1_x as u32, cliff1_y as u32) == EL_EMPTY }
                } else {
                    false
                };
                let c2 = if ctx.grid.in_bounds(cliff2_x, cliff2_y) {
                    unsafe { ctx.grid.get_type_unchecked(cliff2_x as u32, cliff2_y as u32) == EL_EMPTY }
                } else {
                    false
                };
                c1 || c2
            };
            
            if !has_nearby_cliff {
                return;
            }
        }
        
        // --- Dispersion: Scan & Teleport (EXACT TypeScript algorithm) ---
        let left_target = self.scan_line(ctx, xi, yi, px1, py1, range, density, gx, gy);
        let right_target = self.scan_line(ctx, xi, yi, px2, py2, range, density, gx, gy);
        
        // Choose best target (mirrors TypeScript logic exactly)
        let target = if left_target.found && right_target.found {
            if left_target.has_cliff && !right_target.has_cliff {
                left_target
            } else if !left_target.has_cliff && right_target.has_cliff {
                right_target
            } else {
                let rand = xorshift32(ctx.rng);
                if rand & 1 == 0 { left_target } else { right_target }
            }
        } else if left_target.found {
            left_target
        } else if right_target.found {
            right_target
        } else {
            ScanResult { found: false, x: xi, y: yi, has_cliff: false }
        };
        
        if target.found && (target.x != xi || target.y != yi) {
            let _ = self.try_move(ctx, x, y, target.x, target.y, density);
        }
    }
}
