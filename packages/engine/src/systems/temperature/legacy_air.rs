use crate::grid::Grid;

use super::rng::xorshift32;

/// LEGACY MODE: Per-pixel air temperature update with neighbor diffusion
/// This is more accurate than SIMD batch because each air cell samples a random neighbor
/// and can diffuse heat between air cells (not just lerp to ambient)
#[inline]
pub(super) fn update_air_temperature_legacy(grid: &mut Grid, x: u32, y: u32, ambient_temp: f32, rng: &mut u32) {
    let xi = x as i32;
    let yi = y as i32;

    let my_temp = grid.get_temp(xi, yi);

    // Air tends towards ambient temperature
    let diff_ambient = ambient_temp - my_temp;
    if diff_ambient.abs() > 0.5 {
        grid.set_temp(x, y, my_temp + diff_ambient * 0.02);
    }

    // Also sample ONE random neighbor for diffusion (like particles do)
    // This creates more realistic heat flow through air
    let dir = xorshift32(rng) & 3;
    let (nx, ny) = match dir {
        0 => (xi, yi - 1),     // Up
        1 => (xi, yi + 1),     // Down
        2 => (xi - 1, yi),     // Left
        _ => (xi + 1, yi),     // Right
    };

    if grid.in_bounds(nx, ny) {
        let neighbor_temp = grid.get_temp(nx, ny);
        let diff = neighbor_temp - my_temp;

        // Air has conductivity ~5 → transfer_rate = 0.025
        if diff.abs() > 0.5 {
            let transfer_rate = 0.025;
            let updated_temp = grid.get_temp(xi, yi); // Re-read after ambient lerp
            grid.set_temp(x, y, updated_temp + diff * transfer_rate);
            grid.set_temp(nx as u32, ny as u32, neighbor_temp - diff * transfer_rate);
        }
    }
}
