use crate::elements::{EL_EMPTY, ELEMENT_DATA, GRAVITY, AIR_FRICTION, MAX_VELOCITY, CAT_GAS};
use crate::grid::Grid;

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
