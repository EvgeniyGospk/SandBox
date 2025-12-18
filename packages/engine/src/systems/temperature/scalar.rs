use crate::domain::content::ContentRegistry;
use crate::elements::EL_EMPTY;
use crate::grid::Grid;

use super::rng::xorshift32;
use super::transform::transform_particle;

/// Process temperature for entire grid
/// Mirrors TypeScript processTemperatureGrid exactly
pub fn process_temperature_grid(
    content: &ContentRegistry,
    grid: &mut Grid,
    ambient_temp: f32,
    frame: u64,
    rng: &mut u32,
) {
    let h = grid.height();
    let w = grid.width();

    for y in 0..h {
        for x in 0..w {
            update_temperature(content, grid, x, y, ambient_temp, frame, rng);
        }
    }
}

/// Heat transfer using Newton's law of cooling (simplified)
/// Stochastic: only check ONE random neighbor for performance
/// EXACT port of TypeScript updateTemperature
fn update_temperature(
    content: &ContentRegistry,
    grid: &mut Grid,
    x: u32,
    y: u32,
    ambient_temp: f32,
    frame: u64,
    rng: &mut u32,
) {
    let xi = x as i32;
    let yi = y as i32;

    let my_temp = grid.get_temp(xi, yi);
    let element = grid.get_type(xi, yi);

    // Empty cells (air) tend towards ambient temperature
    if element == EL_EMPTY {
        let diff = ambient_temp - my_temp;

        if diff.abs() > 0.5 {
            grid.set_temp(x, y, my_temp + diff * 0.02);
        }
    }

    // Get conductivity (air = 5 if empty)
    let conductivity = if element != EL_EMPTY {
        content
            .props(element)
            .map(|p| p.heat_conductivity)
            .unwrap_or(0)
    } else {
        5
    };

    // Skip if insulator (conductivity 0)
    if conductivity == 0 { return; }

    // Pick random neighbor direction (EXACT TypeScript: Math.floor(Math.random() * 4))
    // PHASE 1 OPT: & 3 instead of % 4 (saves ~40 CPU cycles)
    let dir = xorshift32(rng) & 3;
    let (nx, ny) = match dir {
        0 => (xi, yi - 1),     // Up
        1 => (xi, yi + 1),     // Down
        2 => (xi - 1, yi),     // Left
        _ => (xi + 1, yi),     // Right
    };

    // Boundary: heat sink to ambient temperature
    if !grid.in_bounds(nx, ny) {
        let diff = ambient_temp - my_temp;
        // Slow heat loss at edges
        grid.set_temp(x, y, my_temp + diff * 0.02);
        return;
    }

    // Heat transfer with neighbor
    let neighbor_temp = grid.get_temp(nx, ny);
    let diff = neighbor_temp - my_temp;

    // Optimization: skip if temperature difference is negligible
    if diff.abs() < 0.5 { return; }

    // Transfer rate based on conductivity (0-100 → 0.0-0.5)
    let transfer_rate = (conductivity as f32 / 100.0) * 0.5;

    // Exchange heat (conservation of energy)
    let new_temp = my_temp + diff * transfer_rate;
    grid.set_temp(x, y, new_temp);
    grid.set_temp(nx as u32, ny as u32, neighbor_temp - diff * transfer_rate);

    // Check phase changes for particles
    if element != EL_EMPTY {
        if let Some(new_element) = content.check_phase_change(element, new_temp) {
            transform_particle(content, grid, x, y, new_element, new_temp, frame);
        }
    }
}
