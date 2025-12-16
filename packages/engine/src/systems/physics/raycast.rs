use crate::elements::{EL_EMPTY};
use crate::grid::Grid;

use super::perf::{PERF_RAYCAST_COLLISIONS, PERF_RAYCAST_STEPS};
use super::types::PhysicsResult;

/// Cap for DDA steps to avoid extremely long raycasts on high velocities
const MAX_RAYCAST_STEPS: i32 = 64;

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
        let mut r = PhysicsResult::no_move(start_x, start_y);
        r.speed = speed;
        return r;
    }
    // If no velocity, stay in place
    if vx.abs() < 0.01 && vy.abs() < 0.01 {
        let mut r = PhysicsResult::no_move(start_x, start_y);
        r.speed = speed;
        return r;
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
