use crate::chunks::CHUNK_SIZE;

use super::WorldCore;

pub(super) fn process_chunk_row(world: &mut WorldCore, cy: u32, chunks_x: u32, go_right: bool) {
    if go_right {
        for cx in 0..chunks_x {
            world.process_chunk(cx, cy, go_right);
        }
    } else {
        for cx in (0..chunks_x).rev() {
            world.process_chunk(cx, cy, go_right);
        }
    }
}

pub(super) fn process_chunk(world: &mut WorldCore, cx: u32, cy: u32, go_right: bool) {
    // Skip sleeping chunks with no activity
    if world.chunk_gating_enabled && !world.chunks.should_process(cx, cy) {
        return;
    }

    // Calculate pixel bounds for this chunk
    let start_x = cx * CHUNK_SIZE;
    let start_y = cy * CHUNK_SIZE;
    let end_x = (start_x + CHUNK_SIZE).min(world.grid.width());
    let end_y = (start_y + CHUNK_SIZE).min(world.grid.height());

    debug_assert!(
        (end_y as usize) <= world.grid.row_has_data.len(),
        "process_chunk: row_has_data too small (end_y={}, len={})",
        end_y,
        world.grid.row_has_data.len()
    );

    let mut had_movement = false;

    // Process rows within chunk (bottom to top for gravity)
    if world.gravity_y >= 0.0 {
        for y in (start_y..end_y).rev() {
            // Sparse skip: check row_has_data
            if world.sparse_row_skip_enabled && !world.grid.row_has_data[y as usize] {
                continue;
            }
            if go_right {
                for x in start_x..end_x {
                    let moved = world.update_particle_chunked(x, y);
                    if world.perf_enabled {
                        world.perf_stats.particles_processed += 1;
                        if moved {
                            world.perf_stats.particles_moved += 1;
                        }
                    }
                    if moved {
                        had_movement = true;
                    }
                }
            } else {
                for x in (start_x..end_x).rev() {
                    let moved = world.update_particle_chunked(x, y);
                    if world.perf_enabled {
                        world.perf_stats.particles_processed += 1;
                        if moved {
                            world.perf_stats.particles_moved += 1;
                        }
                    }
                    if moved {
                        had_movement = true;
                    }
                }
            }
        }
    } else {
        for y in start_y..end_y {
            // Sparse skip: check row_has_data
            if world.sparse_row_skip_enabled && !world.grid.row_has_data[y as usize] {
                continue;
            }
            if go_right {
                for x in start_x..end_x {
                    let moved = world.update_particle_chunked(x, y);
                    if world.perf_enabled {
                        world.perf_stats.particles_processed += 1;
                        if moved {
                            world.perf_stats.particles_moved += 1;
                        }
                    }
                    if moved {
                        had_movement = true;
                    }
                }
            } else {
                for x in (start_x..end_x).rev() {
                    let moved = world.update_particle_chunked(x, y);
                    if world.perf_enabled {
                        world.perf_stats.particles_processed += 1;
                        if moved {
                            world.perf_stats.particles_moved += 1;
                        }
                    }
                    if moved {
                        had_movement = true;
                    }
                }
            }
        }
    }

    // Update chunk state
    world.chunks.end_chunk_update(cx, cy, had_movement);
}
