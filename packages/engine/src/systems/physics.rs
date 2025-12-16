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
use crate::elements::{ElementId, EL_EMPTY, ELEMENT_DATA, GRAVITY, AIR_FRICTION, MAX_VELOCITY, CAT_GAS, CAT_SOLID, CAT_ENERGY, CAT_BIO};
use crate::chunks::ChunkGrid;
use std::cell::RefCell;

/// Cap for DDA steps to avoid extremely long raycasts on high velocities
const MAX_RAYCAST_STEPS: i32 = 64;

thread_local! {
    pub static PERF_RAYCAST_STEPS: RefCell<u64> = RefCell::new(0);
    pub static PERF_RAYCAST_COLLISIONS: RefCell<u64> = RefCell::new(0);
}

pub fn reset_physics_perf_counters() {
    PERF_RAYCAST_STEPS.with(|c| *c.borrow_mut() = 0);
    PERF_RAYCAST_COLLISIONS.with(|c| *c.borrow_mut() = 0);
}

pub fn take_physics_perf_counters() -> (u64, u64) {
    let steps = PERF_RAYCAST_STEPS.with(|c| {
        let v = *c.borrow();
        *c.borrow_mut() = 0;
        v
    });
    let collisions = PERF_RAYCAST_COLLISIONS.with(|c| {
        let v = *c.borrow();
        *c.borrow_mut() = 0;
        v
    });
    (steps, collisions)
}

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
    pub hit_x: i32,
    pub hit_y: i32,
    pub normal_x: i32,
    pub normal_y: i32,
    /// Steps taken in the DDA raycast
    pub steps: u32,
    /// Speed magnitude used for this integration
    pub speed: f32,
}

/// Apply gravity to a particle's velocity
/// Gases get INVERTED gravity (they rise instead of fall)
#[inline(always)]
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
#[inline(always)]
pub fn apply_friction(grid: &mut Grid, x: u32, y: u32) {
    let idx = grid.index(x, y);
    let element = grid.types[idx];
    
    if element == EL_EMPTY {
        return;
    }
    
    let props = &ELEMENT_DATA[element as usize];
    
    let friction = props.friction.clamp(0.0, 1.0);
    
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
#[inline(always)]
pub fn raycast_move(
    grid: &Grid,
    start_x: u32,
    start_y: u32,
    vx: f32,
    vy: f32,
) -> PhysicsResult {
    let speed = (vx * vx + vy * vy).sqrt();
    if !vx.is_finite() || !vy.is_finite() {
        return PhysicsResult {
            new_x: start_x,
            new_y: start_y,
            collided: false,
            hit_element: EL_EMPTY,
            hit_x: start_x as i32,
            hit_y: start_y as i32,
            normal_x: 0,
            normal_y: 0,
            steps: 0,
            speed,
        };
    }
    // If no velocity, stay in place
    if vx.abs() < 0.01 && vy.abs() < 0.01 {
        return PhysicsResult {
            new_x: start_x,
            new_y: start_y,
            collided: false,
            hit_element: EL_EMPTY,
            hit_x: start_x as i32,
            hit_y: start_y as i32,
            normal_x: 0,
            normal_y: 0,
            steps: 0,
            speed,
        };
    }

    let x0 = start_x as f32 + 0.5;
    let y0 = start_y as f32 + 0.5;
    let x1 = x0 + vx;
    let y1 = y0 + vy;
    let dx = x1 - x0;
    let dy = y1 - y0;

    let mut cx = start_x as i32;
    let mut cy = start_y as i32;
    let mut last_valid_x = start_x;
    let mut last_valid_y = start_y;

    let step_x = if dx > 0.0 { 1 } else if dx < 0.0 { -1 } else { 0 };
    let step_y = if dy > 0.0 { 1 } else if dy < 0.0 { -1 } else { 0 };

    let inv_dx = if dx != 0.0 { 1.0 / dx.abs() } else { f32::INFINITY };
    let inv_dy = if dy != 0.0 { 1.0 / dy.abs() } else { f32::INFINITY };

    let next_boundary_x = if step_x > 0 { (cx + 1) as f32 } else { cx as f32 };
    let next_boundary_y = if step_y > 0 { (cy + 1) as f32 } else { cy as f32 };

    let mut t_max_x = if step_x != 0 { (next_boundary_x - x0).abs() * inv_dx } else { f32::INFINITY };
    let mut t_max_y = if step_y != 0 { (next_boundary_y - y0).abs() * inv_dy } else { f32::INFINITY };
    let t_delta_x = if step_x != 0 { inv_dx } else { f32::INFINITY };
    let t_delta_y = if step_y != 0 { inv_dy } else { f32::INFINITY };

    let mut steps_taken: u32 = 0;
    let max_steps = ((vx.abs() + vy.abs()).ceil() as i32).clamp(1, MAX_RAYCAST_STEPS) as u32;

    let mut hit_x: i32 = cx;
    let mut hit_y: i32 = cy;
    #[allow(unused_assignments)]
    let mut normal_x: i32 = 0;
    #[allow(unused_assignments)]
    let mut normal_y: i32 = 0;

    while steps_taken < max_steps {
        if t_max_x < t_max_y {
            cx += step_x;
            t_max_x += t_delta_x;
            normal_x = -step_x;
            normal_y = 0;
        } else {
            cy += step_y;
            t_max_y += t_delta_y;
            normal_x = 0;
            normal_y = -step_y;
        }

        steps_taken += 1;

        if !grid.in_bounds(cx, cy) {
            hit_x = cx;
            hit_y = cy;
            PERF_RAYCAST_STEPS.with(|c| {
                let mut v = c.borrow_mut();
                *v = v.saturating_add(steps_taken as u64);
            });
            PERF_RAYCAST_COLLISIONS.with(|c| {
                let mut v = c.borrow_mut();
                *v = v.saturating_add(1);
            });
            return PhysicsResult {
                new_x: last_valid_x,
                new_y: last_valid_y,
                collided: true,
                hit_element: EL_EMPTY,
                hit_x,
                hit_y,
                normal_x,
                normal_y,
                steps: steps_taken,
                speed,
            };
        }

        // Skip if we're at start position
        if cx as u32 == start_x && cy as u32 == start_y {
            continue;
        }

        let hit_element = grid.get_type(cx, cy);
        if hit_element != EL_EMPTY {
            hit_x = cx;
            hit_y = cy;
            PERF_RAYCAST_STEPS.with(|c| {
                let mut v = c.borrow_mut();
                *v = v.saturating_add(steps_taken as u64);
            });
            PERF_RAYCAST_COLLISIONS.with(|c| {
                let mut v = c.borrow_mut();
                *v = v.saturating_add(1);
            });
            return PhysicsResult {
                new_x: last_valid_x,
                new_y: last_valid_y,
                collided: true,
                hit_element,
                hit_x,
                hit_y,
                normal_x,
                normal_y,
                steps: steps_taken,
                speed,
            };
        }

        last_valid_x = cx as u32;
        last_valid_y = cy as u32;

        if t_max_x.min(t_max_y) > 1.0 {
            break;
        }
    }

    PERF_RAYCAST_STEPS.with(|c| {
        let mut v = c.borrow_mut();
        *v = v.saturating_add(steps_taken as u64);
    });
    PhysicsResult {
        new_x: last_valid_x,
        new_y: last_valid_y,
        collided: false,
        hit_element: EL_EMPTY,
        hit_x,
        hit_y,
        normal_x: 0,
        normal_y: 0,
        steps: steps_taken,
        speed,
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
    
    let vx = grid.vx[idx];
    let vy = grid.vy[idx];

    if result.normal_y != 0 && vy.abs() > 0.1 {
        grid.vy[idx] = -vy * bounce;
        grid.vx[idx] += vx.signum() * vy.abs() * 0.1;
    }

    if result.normal_x != 0 && vx.abs() > 0.1 {
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
    gravity_x: f32,
    gravity_y: f32,
) -> PhysicsResult {
    let idx = grid.index(x, y);
    
    let element = grid.types[idx];
    if element == EL_EMPTY {
        return PhysicsResult { new_x: x, new_y: y, collided: false, hit_element: EL_EMPTY, hit_x: x as i32, hit_y: y as i32, normal_x: 0, normal_y: 0, steps: 0, speed: 0.0 };
    }
    
    let props = &ELEMENT_DATA[element as usize];
    
    // Static solids should not be accelerated by physics
    if props.category == CAT_SOLID {
        grid.set_vx(x, y, 0.0);
        grid.set_vy(x, y, 0.0);
        return PhysicsResult { new_x: x, new_y: y, collided: false, hit_element: EL_EMPTY, hit_x: x as i32, hit_y: y as i32, normal_x: 0, normal_y: 0, steps: 0, speed: 0.0 };
    }
    
    // Energy (fire/spark/electricity) is driven by its own behavior, not gravity
    if props.category == CAT_ENERGY {
        grid.set_vx(x, y, 0.0);
        grid.set_vy(x, y, 0.0);
        return PhysicsResult { new_x: x, new_y: y, collided: false, hit_element: EL_EMPTY, hit_x: x as i32, hit_y: y as i32, normal_x: 0, normal_y: 0, steps: 0, speed: 0.0 };
    }

    // Bio (plants/seeds) are behavior-driven; physics movement here causes double-moves.
    if props.category == CAT_BIO {
        grid.set_vx(x, y, 0.0);
        grid.set_vy(x, y, 0.0);
        return PhysicsResult { new_x: x, new_y: y, collided: false, hit_element: EL_EMPTY, hit_x: x as i32, hit_y: y as i32, normal_x: 0, normal_y: 0, steps: 0, speed: 0.0 };
    }
    
    // Respect explicit "ignore gravity" flag for future elements
    if props.ignores_gravity() {
        return PhysicsResult { new_x: x, new_y: y, collided: false, hit_element: EL_EMPTY, hit_x: x as i32, hit_y: y as i32, normal_x: 0, normal_y: 0, steps: 0, speed: 0.0 };
    }
    
    // Skip gases - they rise (inverted gravity) and are handled by gas.rs behavior
    // Processing them here would cause double-processing issues
    if props.category == CAT_GAS {
        return PhysicsResult { new_x: x, new_y: y, collided: false, hit_element: EL_EMPTY, hit_x: x as i32, hit_y: y as i32, normal_x: 0, normal_y: 0, steps: 0, speed: 0.0 };
    }
    
    // PERF: Inline gravity + friction to avoid re-reading element/props
    // 1. Apply gravity
    grid.vx[idx] += gravity_x * GRAVITY;
    grid.vy[idx] += gravity_y * GRAVITY;
    grid.vy[idx] = grid.vy[idx].clamp(-MAX_VELOCITY, MAX_VELOCITY);
    grid.vx[idx] = grid.vx[idx].clamp(-MAX_VELOCITY, MAX_VELOCITY);
    
    // 2. Apply friction
    let friction = props.friction.clamp(0.0, 1.0);
    grid.vx[idx] *= friction * AIR_FRICTION;
    grid.vy[idx] *= friction * AIR_FRICTION;
    
    // Zero out very small velocities
    if grid.vx[idx].abs() < 0.01 { grid.vx[idx] = 0.0; }
    if grid.vy[idx].abs() < 0.01 { grid.vy[idx] = 0.0; }

    if !grid.vx[idx].is_finite() { grid.vx[idx] = 0.0; }
    if !grid.vy[idx].is_finite() { grid.vy[idx] = 0.0; }
    
    // 3. Get current velocity
    let vx = grid.vx[idx];
    let vy = grid.vy[idx];
    
    // 4. No movement if velocity is zero
    if vx.abs() < 0.1 && vy.abs() < 0.1 {
        return PhysicsResult { new_x: x, new_y: y, collided: false, hit_element: EL_EMPTY, hit_x: x as i32, hit_y: y as i32, normal_x: 0, normal_y: 0, steps: 0, speed: 0.0 };
    }
    
    // 5. Raycast to find collision point
    let mut result = raycast_move(grid, x, y, vx, vy);
    result.speed = (vx * vx + vy * vy).sqrt();
    
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
        
        return result;
    }
    
    result
}
