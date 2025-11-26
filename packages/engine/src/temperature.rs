//! Temperature System - Thermodynamics and Phase Changes
//! 
//! Port from: apps/web/src/lib/engine/core/Simulation.ts
//! EXACT 1:1 port of the TypeScript temperature algorithms
//! 
//! - Heat transfer using Newton's law of cooling (simplified)
//! - Stochastic: only check ONE random neighbor for performance
//! - Phase changes (melting, freezing, boiling, condensing)

use crate::grid::Grid;
use crate::elements::{
    ELEMENT_DATA, ElementId, EL_EMPTY, EL_STONE, EL_SAND, EL_METAL, EL_ICE, EL_WATER, EL_STEAM, EL_LAVA,
    ELEMENT_COUNT, get_color_with_variation
};

/// Phase change definitions: (element, high_temp, high_to, low_temp, low_to)
/// EXACT match to TypeScript apps/web/src/lib/engine/elements.ts
const PHASE_CHANGES: [(ElementId, Option<(f32, ElementId)>, Option<(f32, ElementId)>); 7] = [
    // Stone: melts at 900°C -> Lava
    (EL_STONE, Some((900.0, EL_LAVA)), None),
    // Sand: melts at 1700°C -> Lava (glass)
    (EL_SAND, Some((1700.0, EL_LAVA)), None),
    // Metal: melts at 1500°C -> Lava
    (EL_METAL, Some((1500.0, EL_LAVA)), None),
    // Ice: melts at 0°C -> Water
    (EL_ICE, Some((0.0, EL_WATER)), None),
    // Water: boils at 100°C -> Steam, freezes at 0°C -> Ice
    (EL_WATER, Some((100.0, EL_STEAM)), Some((0.0, EL_ICE))),
    // Lava: solidifies at 700°C -> Stone
    (EL_LAVA, None, Some((700.0, EL_STONE))),
    // Steam: condenses at 90°C -> Water (EXACT TypeScript value!)
    (EL_STEAM, None, Some((90.0, EL_WATER))),
];

/// Get phase change for element at given temperature
/// Returns new element if phase change occurs, None otherwise
pub fn check_phase_change(element: ElementId, temp: f32) -> Option<ElementId> {
    for (el, high, low) in PHASE_CHANGES.iter() {
        if *el == element {
            // Check high temp (melting/boiling)
            if let Some((threshold, new_el)) = high {
                if temp > *threshold {
                    return Some(*new_el);
                }
            }
            // Check low temp (freezing/condensing)
            if let Some((threshold, new_el)) = low {
                if temp < *threshold {
                    return Some(*new_el);
                }
            }
            return None;
        }
    }
    None
}

/// Process temperature for entire grid
/// Mirrors TypeScript processTemperatureGrid exactly
pub fn process_temperature_grid(grid: &mut Grid, ambient_temp: f32, frame: u64, rng: &mut u32) {
    let h = grid.height();
    let w = grid.width();
    
    for y in 0..h {
        for x in 0..w {
            update_temperature(grid, x, y, ambient_temp, frame, rng);
        }
    }
}

/// Heat transfer using Newton's law of cooling (simplified)
/// Stochastic: only check ONE random neighbor for performance
/// EXACT port of TypeScript updateTemperature
fn update_temperature(grid: &mut Grid, x: u32, y: u32, ambient_temp: f32, frame: u64, rng: &mut u32) {
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
    let conductivity = if element != EL_EMPTY && (element as usize) < ELEMENT_COUNT {
        ELEMENT_DATA[element as usize].heat_conductivity
    } else {
        5
    };
    
    // Skip if insulator (conductivity 0)
    if conductivity == 0 { return; }
    
    // Pick random neighbor direction (EXACT TypeScript: Math.floor(Math.random() * 4))
    let dir = xorshift32(rng) % 4;
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
        if let Some(new_element) = check_phase_change(element, new_temp) {
            transform_particle(grid, x, y, new_element, new_temp, frame);
        }
    }
}

/// Transform particle to new element, preserving temperature
/// Mirrors TypeScript transformParticle exactly
fn transform_particle(grid: &mut Grid, x: u32, y: u32, new_element: ElementId, temp: f32, frame: u64) {
    let seed = ((x * 7 + y * 13 + frame as u32) & 31) as u8;
    let props = &ELEMENT_DATA[new_element as usize];
    
    grid.set_particle(
        x, y,
        new_element,
        get_color_with_variation(new_element, seed),
        props.lifetime,
        temp  // Keep temperature! Hot stone from lava stays hot
    );
    
    // Mark as updated so it doesn't process again this frame
    grid.set_updated(x, y, true);
}

/// Xorshift32 random number generator
#[inline]
fn xorshift32(state: &mut u32) -> u32 {
    let mut x = *state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *state = x;
    x
}

use crate::chunks::{ChunkGrid, CHUNK_SIZE};

/// Lazy Hydration: Process temperature with chunk-aware optimization
/// 
/// - Sleeping chunks: Only update virtual_temp (O(1) per chunk)
/// - Active chunks: Process pixels + sync virtual_temp back
/// 
/// This reduces O(W*H) to O(active_pixels + all_chunks)
pub fn process_temperature_grid_chunked(
    grid: &mut Grid,
    chunks: &mut ChunkGrid,  // Now mutable for virtual_temp updates!
    ambient_temp: f32,
    frame: u64,
    rng: &mut u32
) {
    let (cx_count, cy_count) = chunks.dimensions();
    
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
                // === PATH 2: CHUNK IS ACTIVE (Slow, pixel-by-pixel) ===
                // Process all pixels in this chunk
                let start_x = cx * CHUNK_SIZE;
                let start_y = cy * CHUNK_SIZE;
                let end_x = (start_x + CHUNK_SIZE).min(grid.width());
                let end_y = (start_y + CHUNK_SIZE).min(grid.height());
                
                for y in start_y..end_y {
                    for x in start_x..end_x {
                        update_temperature(grid, x, y, ambient_temp, frame, rng);
                    }
                }
                
                // Sync virtual_temp with actual air temperature in chunk
                // (so when chunk goes to sleep, it continues from correct value)
                // Do this every 4th frame to save CPU
                if frame % 4 == 0 {
                    let avg = grid.get_average_air_temp(cx, cy);
                    chunks.set_virtual_temp(cx, cy, avg);
                }
            }
        }
    }
}
