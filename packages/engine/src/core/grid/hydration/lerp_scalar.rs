#![cfg(not(target_arch = "wasm32"))]

use super::super::*;

pub(super) unsafe fn batch_lerp_air_temps_impl(
    grid: &mut Grid,
    cx: u32,
    cy: u32,
    target_temp: f32,
    lerp_speed: f32,
) -> u32 {
    let start_x = cx * CHUNK_SIZE;
    let start_y = cy * CHUNK_SIZE;
    let end_x = (start_x + CHUNK_SIZE).min(grid.width);
    let end_y = (start_y + CHUNK_SIZE).min(grid.height);

    let types_ptr = grid.types.as_ptr();
    let temps_ptr = grid.temperature.as_mut_ptr();
    let width = grid.width as usize;

    let mut processed = 0u32;

    for y in start_y..end_y {
        let row_offset = (y as usize) * width;
        for x in start_x..end_x {
            let idx = row_offset + (x as usize);
            if *types_ptr.add(idx) == EL_EMPTY {
                let ptr = temps_ptr.add(idx);
                let current = *ptr;
                *ptr = current + (target_temp - current) * lerp_speed;
                processed += 1;
            }
        }
    }

    processed
}
