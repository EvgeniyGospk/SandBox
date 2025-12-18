use crate::elements::EL_EMPTY;
use crate::grid::Grid;

use super::types::PhysicsResult;

/// Handle collision response - apply bounce or stop
pub fn handle_collision(
    grid: &mut Grid,
    x: u32,
    y: u32,
    result: &PhysicsResult,
    bounce: f32,
) {
    if !result.collided {
        return;
    }

    let idx = grid.index(x, y);
    let element = grid.types[idx];

    if element == EL_EMPTY {
        return;
    }

    let bounce = bounce.clamp(0.0, 1.0);

    let mut vx = grid.vx[idx];
    let mut vy = grid.vy[idx];

    let mut nx = result.normal_x as f32;
    let mut ny = result.normal_y as f32;
    let n2 = nx * nx + ny * ny;
    if n2 <= 0.0 {
        return;
    }
    let inv_len = 1.0 / n2.sqrt();
    nx *= inv_len;
    ny *= inv_len;

    let vdotn = vx * nx + vy * ny;
    if vdotn < 0.0 {
        let restitution = bounce;
        let tangent_damp = 0.1;
        let mut out_vn = -restitution * vdotn;

        if bounce < 0.1 && vdotn.abs() < 1.0 {
            out_vn = 0.0;
        }

        let tx = -ny;
        let ty = nx;
        let vt = vx * tx + vy * ty;
        let out_vt = vt * (1.0 - tangent_damp);

        vx = out_vn * nx + out_vt * tx;
        vy = out_vn * ny + out_vt * ty;
    }

    if vx.abs() < 0.01 {
        vx = 0.0;
    }
    if vy.abs() < 0.01 {
        vy = 0.0;
    }

    if !vx.is_finite() {
        vx = 0.0;
    }
    if !vy.is_finite() {
        vy = 0.0;
    }

    grid.vx[idx] = vx;
    grid.vy[idx] = vy;
}
