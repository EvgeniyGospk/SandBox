use crate::elements::{EL_EMPTY, ELEMENT_DATA};
use crate::grid::Grid;

use super::types::PhysicsResult;

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
