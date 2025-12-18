use crate::chunks::ChunkGrid;
use crate::domain::content::ContentRegistry;
use crate::elements::{EL_EMPTY, GRAVITY, AIR_FRICTION, MAX_VELOCITY, CAT_GAS, CAT_SOLID, CAT_ENERGY, CAT_BIO};
use crate::grid::Grid;

use super::collision::handle_collision;
use super::raycast::raycast_move;
use super::types::PhysicsResult;

/// Full physics update for a single particle
/// Returns true if particle moved
/// 
/// NOTE: No `updated` flag check here - we rely on correct processing order
/// (bottom-to-top for gravity) to prevent double-processing.
/// This allows behaviors to still run after physics.
/// 
/// GASES are skipped - they use inverted gravity and are handled by gas.rs behavior
pub fn update_particle_physics(
    content: &ContentRegistry,
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
        return PhysicsResult::no_move(x, y);
    }

    let Some(props) = content.props(element) else {
        return PhysicsResult::no_move(x, y);
    };

    // Static solids should not be accelerated by physics
    if props.category == CAT_SOLID {
        grid.set_vx(x, y, 0.0);
        grid.set_vy(x, y, 0.0);
        return PhysicsResult::no_move(x, y);
    }

    // Energy (fire/spark/electricity) is driven by its own behavior, not gravity
    if props.category == CAT_ENERGY {
        grid.set_vx(x, y, 0.0);
        grid.set_vy(x, y, 0.0);
        return PhysicsResult::no_move(x, y);
    }

    // Bio (plants/seeds) are behavior-driven; physics movement here causes double-moves.
    if props.category == CAT_BIO {
        grid.set_vx(x, y, 0.0);
        grid.set_vy(x, y, 0.0);
        return PhysicsResult::no_move(x, y);
    }

    // Respect explicit "ignore gravity" flag for future elements
    if props.ignores_gravity() {
        return PhysicsResult::no_move(x, y);
    }

    // Skip gases - they rise (inverted gravity) and are handled by gas.rs behavior
    // Processing them here would cause double-processing issues
    if props.category == CAT_GAS {
        return PhysicsResult::no_move(x, y);
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
        return PhysicsResult::no_move(x, y);
    }

    // 5. Raycast to find collision point
    let mut result = raycast_move(grid, x, y, vx, vy);
    result.speed = (vx * vx + vy * vy).sqrt();

    // 6. Handle collision (apply bounce)
    if result.collided {
        handle_collision(grid, x, y, &result, props.bounce);
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
