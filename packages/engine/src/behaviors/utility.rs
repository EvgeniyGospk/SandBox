//! UtilityBehavior - Handles Clone and Void elements
//! 
//! Port from: apps/web/src/lib/engine/behaviors/UtilityBehavior.ts
//! EXACT 1:1 port of the TypeScript algorithm
//! 
//! Clone: Duplicates touching elements into empty neighbors
//! Void: Destroys all touching elements

use super::{Behavior, UpdateContext};
use crate::elements::{
    ELEMENT_DATA, ElementId, EL_EMPTY, EL_CLONE, EL_VOID, CAT_UTILITY,
    get_color_with_variation
};

/// Neighbor directions
const DIRECTIONS: [(i32, i32); 4] = [
    (0, -1),  // Up
    (0, 1),   // Down
    (-1, 0),  // Left
    (1, 0),   // Right
];

pub struct UtilityBehavior;

impl UtilityBehavior {
    pub fn new() -> Self {
        Self
    }
    
    /// VOID: Destroys all adjacent particles (except other utilities)
    /// Mirrors TypeScript processVoid exactly
    fn process_void(&self, ctx: &mut UpdateContext) {
        let x = ctx.x as i32;
        let y = ctx.y as i32;
        
        for (dx, dy) in DIRECTIONS.iter() {
            let nx = x + dx;
            let ny = y + dy;
            
            if !ctx.grid.in_bounds(nx, ny) { continue; }
            
            let neighbor_type = ctx.grid.get_type(nx, ny);
            
            // Don't destroy empty, void, or clone
            if neighbor_type != EL_EMPTY && neighbor_type != EL_VOID && neighbor_type != EL_CLONE {
                ctx.clear_cell_dirty(nx as u32, ny as u32);
            }
        }
    }
    
    /// CLONE: Finds a donor element and copies it to empty adjacent cells
    /// Mirrors TypeScript processClone exactly
    fn process_clone(&self, ctx: &mut UpdateContext) {
        let x = ctx.x as i32;
        let y = ctx.y as i32;
        let frame = ctx.frame;
        
        // 1. Find a donor element (first non-utility neighbor)
        let mut source_type: ElementId = EL_EMPTY;
        
        for (dx, dy) in DIRECTIONS.iter() {
            let nx = x + dx;
            let ny = y + dy;
            
            if !ctx.grid.in_bounds(nx, ny) { continue; }
            
            let neighbor_type = ctx.grid.get_type(nx, ny);
            
            if neighbor_type != EL_EMPTY {
                // Bounds check
                if (neighbor_type as usize) >= ELEMENT_DATA.len() { continue; }
                
                let cat = ELEMENT_DATA[neighbor_type as usize].category;
                if cat != CAT_UTILITY {
                    source_type = neighbor_type;
                    break;
                }
            }
        }
        
        // No donor found
        if source_type == EL_EMPTY { return; }
        
        // 2. Clone into ONE empty adjacent cell (EXACT TypeScript: rotate start direction by frame)
        let start_dir = (frame % 4) as usize;
        
        for i in 0..4 {
            let dir_idx = (start_dir + i) % 4;
            let (dx, dy) = DIRECTIONS[dir_idx];
            let nx = x + dx;
            let ny = y + dy;
            
            if !ctx.grid.in_bounds(nx, ny) { continue; }
            if !ctx.grid.is_empty(nx, ny) { continue; }
            
            // Create cloned particle (mirrors TypeScript exactly)
            let seed = ((nx as u32 * 7 + ny as u32 * 13 + frame as u32) & 31) as u8;
            let props = &ELEMENT_DATA[source_type as usize];
            
            ctx.set_particle_dirty(
                nx as u32, ny as u32,
                source_type,
                get_color_with_variation(source_type, seed),
                props.lifetime,
                props.default_temp
            );
            
            return; // Only clone ONE per frame!
        }
    }
}

impl Behavior for UtilityBehavior {
    fn update(&self, ctx: &mut UpdateContext) {
        let xi = ctx.x as i32;
        let yi = ctx.y as i32;
        
        let element = ctx.grid.get_type(xi, yi);
        if element == EL_EMPTY { return; }
        
        if element == EL_VOID {
            self.process_void(ctx);
        } else if element == EL_CLONE {
            self.process_clone(ctx);
        }
    }
}
