use super::super::*;

pub(super) fn hydrate_chunk_impl(grid: &mut Grid, cx: u32, cy: u32, temp: f32) {
    let start_x = cx * CHUNK_SIZE;
    let start_y = cy * CHUNK_SIZE;
    let end_x = (start_x + CHUNK_SIZE).min(grid.width);
    let end_y = (start_y + CHUNK_SIZE).min(grid.height);

    // Use raw pointers for speed (chunk bounds are guaranteed valid)
    let types_ptr = grid.types.as_ptr();
    let temps_ptr = grid.temperature.as_mut_ptr();
    let width = grid.width as usize;

    unsafe {
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

                // Found empty cell - count consecutive empties
                let run_start = x;
                while x < end_x && *types_ptr.add(row_offset + (x as usize)) == EL_EMPTY {
                    x += 1;
                }
                let run_len = (x - run_start) as usize;

                // PHASE 1 OPT: Use SIMD for runs of 4+ cells
                #[cfg(target_arch = "wasm32")]
                {
                    use std::arch::wasm32::*;

                    let run_ptr = temps_ptr.add(row_offset + (run_start as usize));
                    let mut i = 0usize;

                    // Process 4 cells at a time with SIMD
                    let v_temp = f32x4_splat(temp);
                    while i + 4 <= run_len {
                        v128_store(run_ptr.add(i) as *mut v128, v_temp);
                        i += 4;
                    }

                    // Scalar remainder
                    while i < run_len {
                        *run_ptr.add(i) = temp;
                        i += 1;
                    }
                }

                #[cfg(not(target_arch = "wasm32"))]
                {
                    // Scalar fallback for non-WASM
                    let run_ptr = temps_ptr.add(row_offset + (run_start as usize));
                    for i in 0..run_len {
                        *run_ptr.add(i) = temp;
                    }
                }
            }
        }
    }
}

pub(super) fn get_average_air_temp_impl(grid: &Grid, cx: u32, cy: u32) -> f32 {
    let start_x = cx * CHUNK_SIZE;
    let start_y = cy * CHUNK_SIZE;
    let end_x = (start_x + CHUNK_SIZE).min(grid.width);
    let end_y = (start_y + CHUNK_SIZE).min(grid.height);

    let types_ptr = grid.types.as_ptr();
    let temps_ptr = grid.temperature.as_ptr();
    let width = grid.width as usize;

    let mut sum = 0.0f32;
    let mut count = 0u32;

    unsafe {
        for y in start_y..end_y {
            let row_offset = (y as usize) * width;
            for x in start_x..end_x {
                let idx = row_offset + (x as usize);
                if *types_ptr.add(idx) == EL_EMPTY {
                    sum += *temps_ptr.add(idx);
                    count += 1;
                }
            }
        }
    }

    if count > 0 {
        sum / (count as f32)
    } else {
        // No air in chunk (fully occupied) - return room temp
        20.0
    }
}
