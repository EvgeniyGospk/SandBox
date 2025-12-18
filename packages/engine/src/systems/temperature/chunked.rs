use crate::chunks::{ChunkGrid, CHUNK_SIZE};
use crate::domain::content::ContentRegistry;
use crate::elements::EL_EMPTY;
use crate::grid::Grid;

use super::legacy_air::update_air_temperature_legacy;
use super::rng::xorshift32;
use super::transform::transform_particle_with_chunks;

/// Lazy Hydration: Process temperature with chunk-aware optimization
/// 
/// - Sleeping chunks: Only update virtual_temp (O(1) per chunk)
/// - Active chunks: Per-pixel processing for smoother thermodynamics
///   (each air cell samples a random neighbor for realistic heat diffusion)
pub fn process_temperature_grid_chunked(
    content: &ContentRegistry,
    grid: &mut Grid,
    chunks: &mut ChunkGrid,  // Now mutable for virtual_temp updates!
    ambient_temp: f32,
    frame: u64,
    rng: &mut u32
) -> (u32, u32) {
    let (cx_count, cy_count) = chunks.dimensions();
    let mut processed_non_empty = 0u32;
    let mut simd_air_cells = 0u32;

    // Air conductivity speed (same as in update_temperature: 0.02)
    const AIR_LERP_SPEED: f32 = 0.02;

    for cy in 0..cy_count {
        for cx in 0..cx_count {
            if chunks.is_sleeping(cx, cy) {
                // === PATH 1: CHUNK IS SLEEPING (Fast O(1)) ===
                // Just smoothly animate virtual_temp towards ambient
                // This is the SAME math as update_temperature for air, but for ONE number
                chunks.update_virtual_temp(cx, cy, ambient_temp, AIR_LERP_SPEED);
            } else {
                // === PATH 2: CHUNK IS ACTIVE ===
                // LEGACY MODE: Per-pixel processing for smoother thermodynamics
                // Each air cell is processed individually with random neighbor sampling

                let start_x = cx * CHUNK_SIZE;
                let start_y = cy * CHUNK_SIZE;
                let end_x = (start_x + CHUNK_SIZE).min(grid.width());
                let end_y = (start_y + CHUNK_SIZE).min(grid.height());

                for y in start_y..end_y {
                    for x in start_x..end_x {
                        let element = grid.get_type(x as i32, y as i32);
                        if element == EL_EMPTY {
                            // Air cell: lerp towards ambient + random neighbor diffusion
                            update_air_temperature_legacy(grid, x, y, ambient_temp, rng);
                            simd_air_cells += 1;
                        } else {
                            // Particle: full heat transfer logic
                            update_particle_temperature(content, grid, chunks, x, y, ambient_temp, frame, rng);
                            processed_non_empty += 1;
                        }
                    }
                }

                // Sync virtual_temp with actual air temperature in chunk
                if frame & 3 == 0 {
                    let avg = grid.get_average_air_temp(cx, cy);
                    chunks.set_virtual_temp(cx, cy, avg);
                }
            }
        }
    }

    (processed_non_empty, simd_air_cells)
}

/// Update temperature for a single NON-EMPTY cell (particle)
/// PHASE 1 OPT: Separate function for particles only (air handled by SIMD batch)
fn update_particle_temperature(
    content: &ContentRegistry,
    grid: &mut Grid,
    chunks: &mut ChunkGrid,
    x: u32,
    y: u32,
    ambient_temp: f32,
    frame: u64,
    rng: &mut u32
) {
    let xi = x as i32;
    let yi = y as i32;

    let my_temp = grid.get_temp(xi, yi);
    let element = grid.get_type(xi, yi);

    // Skip if empty (shouldn't happen, but guard)
    if element == EL_EMPTY { return; }

    // Get conductivity
    let Some(props) = content.props(element) else {
        return;
    };

    let conductivity = props.heat_conductivity;

    // Skip if insulator (conductivity 0)
    if conductivity == 0 { return; }

    // BUG FIX: Check phase changes FIRST using CURRENT temperature
    // This ensures frozen water turns to ice even if at thermal equilibrium
    // (when diff < 0.5 would cause early return before old phase check)
    if let Some(new_element) = content.check_phase_change(element, my_temp) {
        transform_particle_with_chunks(content, grid, chunks, x, y, new_element, my_temp, frame);
        return; // Already transformed, no need for heat transfer
    }

    // Pick random neighbor direction
    // PHASE 1 OPT: & 3 instead of % 4
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
    if let Some(new_element) = content.check_phase_change(element, new_temp) {
        transform_particle_with_chunks(content, grid, chunks, x, y, new_element, new_temp, frame);
    }
}
