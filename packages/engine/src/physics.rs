//! Physics System - Phase 2: Newtonian Particle Physics
//! 
//! Implements velocity-based movement with DDA raycasting for collision detection.
//! 
//! Key concepts:
//! - Particles have velocity (vx, vy) that persists across frames
//! - Gravity accelerates particles downward each frame
//! - Friction decays velocity based on material properties
//! - DDA raycast detects collisions along the velocity vector
//! - Bounce factor determines energy retained after collision

use crate::grid::Grid;
use crate::elements::{ElementId, EL_EMPTY, ELEMENT_DATA, GRAVITY, AIR_FRICTION, MAX_VELOCITY, CAT_GAS, CAT_SOLID, CAT_ENERGY};
use crate::chunks::ChunkGrid;

/// Result of a physics step for a single particle
#[derive(Clone, Copy, Debug)]
pub struct PhysicsResult {
    /// New X position (may be same as old if blocked)
    pub new_x: u32,
    /// New Y position
    pub new_y: u32,
    /// Did particle collide with something?
    pub collided: bool,
    /// Element that was hit (if collided)
    pub hit_element: ElementId,
}

/// Apply gravity to a particle's velocity
/// Gases get INVERTED gravity (they rise instead of fall)
#[inline]
pub fn apply_gravity(grid: &mut Grid, x: u32, y: u32, gravity_y: f32) {
    let idx = grid.index(x, y);
    let element = grid.types[idx];
    
    if element == EL_EMPTY {
        return;
    }
    
    let props = &ELEMENT_DATA[element as usize];
    
    // Gases rise (inverted gravity)
    let effective_gravity = if props.category == CAT_GAS {
        -gravity_y * 0.5  // Gases rise slower than solids fall
    } else {
        gravity_y
    };
    
    // Apply gravity (GRAVITY constant from JSON = 0.5)
    grid.vy[idx] += effective_gravity * GRAVITY;
    
    // Clamp to max velocity
    grid.vy[idx] = grid.vy[idx].clamp(-MAX_VELOCITY, MAX_VELOCITY);
    grid.vx[idx] = grid.vx[idx].clamp(-MAX_VELOCITY, MAX_VELOCITY);
}

/// Apply friction to a particle's velocity
#[inline]
pub fn apply_friction(grid: &mut Grid, x: u32, y: u32) {
    let idx = grid.index(x, y);
    let element = grid.types[idx];
    
    if element == EL_EMPTY {
        return;
    }
    
    let props = &ELEMENT_DATA[element as usize];
    
    // Use 1.0 (no decay) if friction is zero to avoid "static" elements ignoring physics
    let friction = if props.friction == 0.0 { 1.0 } else { props.friction };
    
    // Apply element-specific friction
    grid.vx[idx] *= friction;
    grid.vy[idx] *= friction;
    
    // Apply global air friction
    grid.vx[idx] *= AIR_FRICTION;
    grid.vy[idx] *= AIR_FRICTION;
    
    // Zero out very small velocities (prevents floating point creep)
    if grid.vx[idx].abs() < 0.01 {
        grid.vx[idx] = 0.0;
    }
    if grid.vy[idx].abs() < 0.01 {
        grid.vy[idx] = 0.0;
    }
}

/// DDA Raycast - move particle along velocity vector, stopping at first collision
/// 
/// Uses Bresenham-style DDA (Digital Differential Analyzer) to step through
/// grid cells along the velocity vector until we hit something or reach the end.
/// 
/// Returns (final_x, final_y, hit_element_or_none)
pub fn raycast_move(
    grid: &Grid,
    start_x: u32,
    start_y: u32,
    vx: f32,
    vy: f32,
) -> PhysicsResult {
    // If no velocity, stay in place
    if vx.abs() < 0.01 && vy.abs() < 0.01 {
        return PhysicsResult {
            new_x: start_x,
            new_y: start_y,
            collided: false,
            hit_element: EL_EMPTY,
        };
    }
    
    let mut x = start_x as f32;
    let mut y = start_y as f32;
    
    let dx = vx;
    let dy = vy;
    
    // Number of steps = max of |dx| and |dy|, at least 1
    let steps = dx.abs().max(dy.abs()).ceil() as i32;
    if steps == 0 {
        return PhysicsResult {
            new_x: start_x,
            new_y: start_y,
            collided: false,
            hit_element: EL_EMPTY,
        };
    }
    
    let step_x = dx / steps as f32;
    let step_y = dy / steps as f32;
    
    let mut last_valid_x = start_x;
    let mut last_valid_y = start_y;
    
    for _ in 0..steps {
        x += step_x;
        y += step_y;
        
        let ix = x.round() as i32;
        let iy = y.round() as i32;
        
        // Check bounds
        if !grid.in_bounds(ix, iy) {
            // Hit world boundary
            return PhysicsResult {
                new_x: last_valid_x,
                new_y: last_valid_y,
                collided: true,
                hit_element: EL_EMPTY, // Boundary
            };
        }
        
        let ux = ix as u32;
        let uy = iy as u32;
        
        // Skip if we're at start position
        if ux == start_x && uy == start_y {
            continue;
        }
        
        // Check if cell is occupied
        let hit_element = grid.get_type(ix, iy);
        if hit_element != EL_EMPTY {
            // Collision!
            return PhysicsResult {
                new_x: last_valid_x,
                new_y: last_valid_y,
                collided: true,
                hit_element,
            };
        }
        
        // Cell is empty, we can move here
        last_valid_x = ux;
        last_valid_y = uy;
    }
    
    // Reached end without collision
    PhysicsResult {
        new_x: last_valid_x,
        new_y: last_valid_y,
        collided: false,
        hit_element: EL_EMPTY,
    }
}

/// Handle collision response - apply bounce or stop
pub fn handle_collision(
    grid: &mut Grid,
    x: u32,
    y: u32,
    result: &PhysicsResult,
) {
    if !result.collided {
        return;
    }
    
    let idx = grid.index(x, y);
    let element = grid.types[idx];
    
    if element == EL_EMPTY {
        return;
    }
    
    let props = &ELEMENT_DATA[element as usize];
    let bounce = props.bounce;
    
    // Determine collision direction and apply bounce
    let vx = grid.vx[idx];
    let vy = grid.vy[idx];
    
    // Simple bounce: reverse velocity component and apply bounce factor
    // If we hit something below, reverse vy
    // If we hit something to the side, reverse vx
    
    let dx = result.new_x as i32 - x as i32;
    let dy = result.new_y as i32 - y as i32;
    
    // Vertical collision (hit floor/ceiling)
    if dy.abs() < vy.abs() as i32 && vy.abs() > 0.1 {
        grid.vy[idx] = -vy * bounce;
        // Add some horizontal scatter when bouncing
        grid.vx[idx] += (vx.signum()) * vy.abs() * 0.1;
    }
    
    // Horizontal collision (hit wall)
    if dx.abs() < vx.abs() as i32 && vx.abs() > 0.1 {
        grid.vx[idx] = -vx * bounce;
    }
    
    // If bounce is very small, just stop
    if bounce < 0.1 {
        if vy.abs() < 1.0 {
            grid.vy[idx] = 0.0;
        }
        if vx.abs() < 1.0 {
            grid.vx[idx] = 0.0;
        }
    }
}

/// Full physics update for a single particle
/// Returns true if particle moved
/// 
/// NOTE: No `updated` flag check here - we rely on correct processing order
/// (bottom-to-top for gravity) to prevent double-processing.
/// This allows behaviors to still run after physics.
/// 
/// GASES are skipped - they use inverted gravity and are handled by gas.rs behavior
pub fn update_particle_physics(
    grid: &mut Grid,
    chunks: &mut ChunkGrid,
    x: u32,
    y: u32,
    gravity_y: f32,
) -> bool {
    let idx = grid.index(x, y);
    
    let element = grid.types[idx];
    if element == EL_EMPTY {
        return false;
    }
    
    let props = &ELEMENT_DATA[element as usize];
    
    // Static solids should not be accelerated by physics
    if props.category == CAT_SOLID {
        grid.set_vx(x, y, 0.0);
        grid.set_vy(x, y, 0.0);
        return false;
    }
    
    // Energy (fire/spark/electricity) is driven by its own behavior, not gravity
    if props.category == CAT_ENERGY {
        grid.set_vx(x, y, 0.0);
        grid.set_vy(x, y, 0.0);
        return false;
    }
    
    // Respect explicit "ignore gravity" flag for future elements
    if props.ignores_gravity() {
        return false;
    }
    
    // Skip gases - they rise (inverted gravity) and are handled by gas.rs behavior
    // Processing them here would cause double-processing issues
    if props.category == CAT_GAS {
        return false;
    }
    
    // 1. Apply gravity
    apply_gravity(grid, x, y, gravity_y);
    
    // 2. Apply friction
    apply_friction(grid, x, y);
    
    // 3. Get current velocity
    let vx = grid.get_vx(x, y);
    let vy = grid.get_vy(x, y);
    
    // 4. No movement if velocity is zero
    if vx.abs() < 0.1 && vy.abs() < 0.1 {
        return false;
    }
    
    // 5. Raycast to find collision point
    let result = raycast_move(grid, x, y, vx, vy);
    
    // 6. Handle collision (apply bounce)
    if result.collided {
        handle_collision(grid, x, y, &result);
    }
    
    // 7. Move particle if position changed
    if result.new_x != x || result.new_y != y {
        grid.swap(x, y, result.new_x, result.new_y);
        
        // Mark chunks as dirty
        chunks.mark_dirty(x, y);
        chunks.mark_dirty(result.new_x, result.new_y);
        
        return true;
    }
    
    false
}
