use crate::chunks::CHUNK_SIZE;
use crate::domain::content::ContentRegistry;
use crate::elements::EL_EMPTY;
use crate::grid::Grid;
use crate::simulation::PerfTimer;

use super::legacy_air::update_air_temperature_legacy;
use super::rng::xorshift32;
use super::transform::transform_particle;

/// Chunked temperature pass for cache-friendly iteration.
pub fn process_temperature_grid_chunked(
    content: &ContentRegistry,
    grid: &mut Grid,
    ambient_temp: f32,
    frame: u64,
    rng: &mut u32,
    perf_detailed: bool,
) -> (u32, u32, f64, f64) {
    let cx_count = (grid.width() + CHUNK_SIZE - 1) / CHUNK_SIZE;
    let cy_count = (grid.height() + CHUNK_SIZE - 1) / CHUNK_SIZE;
    let mut processed_non_empty = 0u32;
    let mut simd_air_cells = 0u32;

    const SAMPLE_MASK: u32 = 63;
    let frame_u32 = frame as u32;

    let mut s_aa = 0.0;
    let mut s_pp = 0.0;
    let mut s_ap = 0.0;
    let mut s_at = 0.0;
    let mut s_pt = 0.0;
    let mut sample_n = 0u32;
    let mut sample_total_ms = 0.0;
    let mut sample_total_cells = 0u64;

    for cy in 0..cy_count {
        for cx in 0..cx_count {
            // LEGACY MODE: Per-pixel processing for smoother thermodynamics
            // Each air cell is processed individually with random neighbor sampling

            let start_x = cx * CHUNK_SIZE;
            let start_y = cy * CHUNK_SIZE;
            let end_x = (start_x + CHUNK_SIZE).min(grid.width());
            let end_y = (start_y + CHUNK_SIZE).min(grid.height());

            let sample_chunk = perf_detailed
                && (((cx.wrapping_mul(73856093)
                    ^ cy.wrapping_mul(19349663)
                    ^ frame_u32.wrapping_mul(83492791))
                    & SAMPLE_MASK)
                    == 0);
            let t_chunk = if sample_chunk { Some(PerfTimer::start()) } else { None };
            let mut air_in_chunk: u32 = 0;
            let mut part_in_chunk: u32 = 0;

            for y in start_y..end_y {
                for x in start_x..end_x {
                    let element = grid.get_type(x as i32, y as i32);
                    if element == EL_EMPTY {
                        // Air cell: lerp towards ambient + random neighbor diffusion
                        update_air_temperature_legacy(grid, x, y, ambient_temp, rng);
                        simd_air_cells += 1;
                        if sample_chunk {
                            air_in_chunk = air_in_chunk.saturating_add(1);
                        }
                    } else {
                        // Particle: full heat transfer logic
                        update_particle_temperature(content, grid, x, y, ambient_temp, frame, rng);
                        processed_non_empty += 1;
                        if sample_chunk {
                            part_in_chunk = part_in_chunk.saturating_add(1);
                        }
                    }
                }
            }

            if let Some(t) = t_chunk {
                let t_ms = t.elapsed_ms();
                let a = air_in_chunk as f64;
                let p = part_in_chunk as f64;
                s_aa += a * a;
                s_pp += p * p;
                s_ap += a * p;
                s_at += a * t_ms;
                s_pt += p * t_ms;
                sample_n = sample_n.saturating_add(1);
                sample_total_ms += t_ms;
                sample_total_cells = sample_total_cells.saturating_add((air_in_chunk as u64).saturating_add(part_in_chunk as u64));
            }
        }
    }

    let (air_ms_est, particle_ms_est) = if perf_detailed && sample_n > 0 {
        let det = s_aa * s_pp - s_ap * s_ap;
        if det.abs() > 1e-9 {
            let a = (s_at * s_pp - s_pt * s_ap) / det; // ms per air cell
            let b = (s_pt * s_aa - s_at * s_ap) / det; // ms per particle cell
            let air_ms = (a * (simd_air_cells as f64)).max(0.0);
            let part_ms = (b * (processed_non_empty as f64)).max(0.0);
            (air_ms, part_ms)
        } else if sample_total_cells > 0 {
            let avg_ms_per_cell = sample_total_ms / (sample_total_cells as f64);
            let air_ms = avg_ms_per_cell * (simd_air_cells as f64);
            let part_ms = avg_ms_per_cell * (processed_non_empty as f64);
            (air_ms, part_ms)
        } else {
            (0.0, 0.0)
        }
    } else {
        (0.0, 0.0)
    };

    (processed_non_empty, simd_air_cells, air_ms_est, particle_ms_est)
}

/// Update temperature for a single NON-EMPTY cell (particle)
/// PHASE 1 OPT: Separate function for particles only (air handled by SIMD batch)
fn update_particle_temperature(
    content: &ContentRegistry,
    grid: &mut Grid,
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
        transform_particle(content, grid, x, y, new_element, my_temp, frame);
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
        transform_particle(content, grid, x, y, new_element, new_temp, frame);
    }
}
