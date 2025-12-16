use super::super::UpdateContext;
use crate::elements::EL_WATER;

/// Find water within radius (mirrors TypeScript findWater)
pub(super) fn find_water(ctx: &UpdateContext, cx: i32, cy: i32, radius: i32) -> Option<(i32, i32)> {
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            let nx = cx + dx;
            let ny = cy + dy;
            if ctx.grid.in_bounds(nx, ny) {
                if ctx.grid.get_type(nx, ny) == EL_WATER {
                    return Some((nx, ny));
                }
            }
        }
    }
    None
}

/// Check if there's water nearby (mirrors TypeScript hasWaterNeighbor)
pub(super) fn has_water_neighbor(ctx: &UpdateContext, x: i32, y: i32) -> bool {
    find_water(ctx, x, y, 1).is_some()
}
