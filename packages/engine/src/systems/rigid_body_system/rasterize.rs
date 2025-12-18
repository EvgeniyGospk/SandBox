use crate::chunks::ChunkGrid;
use crate::domain::content::ContentRegistry;
use crate::grid::Grid;
use crate::rigid_body::RigidBody;

pub(super) fn clear_body(body: &mut RigidBody, grid: &mut Grid, chunks: &mut ChunkGrid) {
    for &(x, y) in body.prev_world_coords.iter() {
        if !grid.in_bounds(x, y) {
            continue;
        }
        let ux = x as u32;
        let uy = y as u32;
        grid.clear_cell(ux, uy);
        chunks.remove_particle(ux, uy);
        chunks.mark_dirty(ux, uy);
    }
    body.prev_world_coords.clear();
}

pub(super) fn rasterize_body(
    content: &ContentRegistry,
    body: &mut RigidBody,
    grid: &mut Grid,
    chunks: &mut ChunkGrid,
) {
    body.prev_world_coords.clear();
    body.prev_world_coords.reserve(body.pixels.len());

    let (sin, cos) = body.angle.sin_cos();
    let w = grid.width() as i32;
    let h = grid.height() as i32;

    for p in body.pixels.iter() {
        let dx = p.dx as f32;
        let dy = p.dy as f32;

        let rx = dx * cos - dy * sin;
        let ry = dx * sin + dy * cos;

        let wx = (body.pos.x + rx).round() as i32;
        let wy = (body.pos.y + ry).round() as i32;

        if wx < 0 || wx >= w || wy < 0 || wy >= h {
            continue;
        }

        let x = wx as u32;
        let y = wy as u32;

        // Enforce SOLID pixels: don't overwrite existing particles.
        if !grid.is_empty(wx, wy) {
            continue;
        }

        let element = p.element;
        let Some(props) = content.props(element) else {
            continue;
        };
        let color = content
            .color_with_variation(element, p.color_seed)
            .unwrap_or(props.color);

        grid.set_particle(x, y, element, color, props.lifetime, props.default_temp);
        chunks.add_particle(x, y);

        body.prev_world_coords.push((wx, wy));
    }
}
    