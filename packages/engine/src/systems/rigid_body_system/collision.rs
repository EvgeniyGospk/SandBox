use crate::grid::Grid;
use crate::rigid_body::{RigidBody, Vec2};
use crate::elements::EL_EMPTY;

pub(super) fn collides_at(body: &RigidBody, grid: &Grid, pos: Vec2) -> bool {
    let (sin, cos) = body.angle.sin_cos();
    let w = grid.width() as i32;
    let h = grid.height() as i32;

    for p in body.pixels.iter() {
        let dx = p.dx as f32;
        let dy = p.dy as f32;

        // Rotate (currently angle stays at 0.0, but keep math for future).
        let rx = dx * cos - dy * sin;
        let ry = dx * sin + dy * cos;

        let wx = (pos.x + rx).round() as i32;
        let wy = (pos.y + ry).round() as i32;

        if wx < 0 || wx >= w || wy < 0 || wy >= h {
            return true;
        }

        let t = grid.get_type(wx, wy);
        if t != EL_EMPTY {
            return true;
        }
    }

    false
}
