#![cfg(target_arch = "wasm32")]

use super::super::*;

pub(super) unsafe fn batch_lerp_air_temps_impl(
    grid: &mut Grid,
    cx: u32,
    cy: u32,
    target_temp: f32,
    lerp_speed: f32,
) -> u32 {
    use std::arch::wasm32::*;

    let start_x = cx * CHUNK_SIZE;
    let start_y = cy * CHUNK_SIZE;
    let end_x = (start_x + CHUNK_SIZE).min(grid.width);
    let end_y = (start_y + CHUNK_SIZE).min(grid.height);

    let types_ptr = grid.types.as_ptr();
    let temps_ptr = grid.temperature.as_mut_ptr();
    let width = grid.width as usize;

    // SIMD constants
    let v_target = f32x4_splat(target_temp);
    let v_lerp = f32x4_splat(lerp_speed);
    let v_one_minus_lerp = f32x4_splat(1.0 - lerp_speed);

    let mut processed = 0u32;

    for y in start_y..end_y {
        let row_offset = (y as usize) * width;
        let mut x = start_x;

        while x < end_x {
            let idx = row_offset + (x as usize);

            // Skip non-empty cells
            if *types_ptr.add(idx) != EL_EMPTY {
                x += 1;
                continue;
            }

            // Count consecutive empty cells
            let run_start = x;
            while x < end_x && *types_ptr.add(row_offset + (x as usize)) == EL_EMPTY {
                x += 1;
            }
            let run_len = (x - run_start) as usize;
            processed += run_len as u32;

            // Process with SIMD
            let run_ptr = temps_ptr.add(row_offset + (run_start as usize));
            let mut i = 0usize;

            // SIMD: 4 cells at a time
            // new_temp = current * (1 - lerp) + target * lerp
            while i + 4 <= run_len {
                let ptr = run_ptr.add(i);
                let v_current = v128_load(ptr as *const v128);
                let v_new = f32x4_add(
                    f32x4_mul(v_current, v_one_minus_lerp),
                    f32x4_mul(v_target, v_lerp),
                );
                v128_store(ptr as *mut v128, v_new);
                i += 4;
            }

            // Scalar remainder
            while i < run_len {
                let ptr = run_ptr.add(i);
                let current = *ptr;
                *ptr = current + (target_temp - current) * lerp_speed;
                i += 1;
            }
        }
    }

    processed
}
