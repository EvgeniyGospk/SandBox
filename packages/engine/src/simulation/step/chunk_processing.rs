use crate::chunks::CHUNK_SIZE;

use super::{PerfTimer, WorldCore};

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
    // Calculate pixel bounds for this chunk
    let start_x = cx * CHUNK_SIZE;
    let start_y = cy * CHUNK_SIZE;
    let end_x = (start_x + CHUNK_SIZE).min(world.grid.width());
    let end_y = (start_y + CHUNK_SIZE).min(world.grid.height());

    const SAMPLE_MASK: u32 = 63;
    let split_on = world.perf_enabled && (world.perf_split || world.perf_detailed);
    let frame_u32 = world.frame as u32;
    let sample_chunk = split_on
        && (((cx.wrapping_mul(73856093) ^ cy.wrapping_mul(19349663) ^ frame_u32.wrapping_mul(83492791)) & SAMPLE_MASK)
            == 0);
    let t_chunk = if sample_chunk { Some(PerfTimer::start()) } else { None };
    let mut empty_in_chunk: u32 = 0;
    let mut non_empty_in_chunk: u32 = 0;

    // Process rows within chunk (bottom to top for gravity)
    if world.gravity_y >= 0.0 {
        for y in (start_y..end_y).rev() {
            if go_right {
                for x in start_x..end_x {
                    if sample_chunk {
                        let element = unsafe { world.grid.get_type_unchecked(x, y) };
                        if element == crate::elements::EL_EMPTY {
                            empty_in_chunk = empty_in_chunk.saturating_add(1);
                        } else {
                            non_empty_in_chunk = non_empty_in_chunk.saturating_add(1);
                        }
                    }
                    let moved = world.update_particle_chunked(x, y);
                    if world.perf_enabled {
                        world.perf_stats.particles_processed += 1;
                        if moved {
                            world.perf_stats.particles_moved += 1;
                        }
                    }
                }
            } else {
                for x in (start_x..end_x).rev() {
                    if sample_chunk {
                        let element = unsafe { world.grid.get_type_unchecked(x, y) };
                        if element == crate::elements::EL_EMPTY {
                            empty_in_chunk = empty_in_chunk.saturating_add(1);
                        } else {
                            non_empty_in_chunk = non_empty_in_chunk.saturating_add(1);
                        }
                    }
                    let moved = world.update_particle_chunked(x, y);
                    if world.perf_enabled {
                        world.perf_stats.particles_processed += 1;
                        if moved {
                            world.perf_stats.particles_moved += 1;
                        }
                    }
                }
            }
        }
    } else {
        for y in start_y..end_y {
            if go_right {
                for x in start_x..end_x {
                    if sample_chunk {
                        let element = unsafe { world.grid.get_type_unchecked(x, y) };
                        if element == crate::elements::EL_EMPTY {
                            empty_in_chunk = empty_in_chunk.saturating_add(1);
                        } else {
                            non_empty_in_chunk = non_empty_in_chunk.saturating_add(1);
                        }
                    }
                    let moved = world.update_particle_chunked(x, y);
                    if world.perf_enabled {
                        world.perf_stats.particles_processed += 1;
                        if moved {
                            world.perf_stats.particles_moved += 1;
                        }
                    }
                }
            } else {
                for x in (start_x..end_x).rev() {
                    if sample_chunk {
                        let element = unsafe { world.grid.get_type_unchecked(x, y) };
                        if element == crate::elements::EL_EMPTY {
                            empty_in_chunk = empty_in_chunk.saturating_add(1);
                        } else {
                            non_empty_in_chunk = non_empty_in_chunk.saturating_add(1);
                        }
                    }
                    let moved = world.update_particle_chunked(x, y);
                    if world.perf_enabled {
                        world.perf_stats.particles_processed += 1;
                        if moved {
                            world.perf_stats.particles_moved += 1;
                        }
                    }
                }
            }
        }
    }

    if let Some(t) = t_chunk {
        let t_ms = t.elapsed_ms();
        let e = empty_in_chunk as f64;
        let n = non_empty_in_chunk as f64;
        let tm = t_ms;
        world.perf_stats.chunks_split_s_ee += e * e;
        world.perf_stats.chunks_split_s_nn += n * n;
        world.perf_stats.chunks_split_s_en += e * n;
        world.perf_stats.chunks_split_s_et += e * tm;
        world.perf_stats.chunks_split_s_nt += n * tm;
        world.perf_stats.chunks_split_sample_n = world.perf_stats.chunks_split_sample_n.saturating_add(1);
    }
}
