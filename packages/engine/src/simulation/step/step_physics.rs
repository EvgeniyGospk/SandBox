use crate::chunks::CHUNK_SIZE;
use crate::elements::EL_EMPTY;
use crate::physics::update_particle_physics;

use super::{PerfTimer, WorldCore};

pub(super) fn process_physics(world: &mut WorldCore) {
    let (chunks_x, chunks_y) = world.chunks.dimensions();
    let gravity_x = world.gravity_x;
    let gravity_y = world.gravity_y;

    // Choose processing order based on gravity direction
    if gravity_y >= 0.0 {
        // Positive gravity: particles fall DOWN → process bottom-to-top
        for cy in (0..chunks_y).rev() {
            for cx in 0..chunks_x {
                world.process_physics_chunk(cx, cy, gravity_x, gravity_y, false);
            }
        }
    } else {
        // Negative gravity: particles fly UP → process top-to-bottom
        for cy in 0..chunks_y {
            for cx in 0..chunks_x {
                world.process_physics_chunk(cx, cy, gravity_x, gravity_y, true);
            }
        }
    }
}

pub(super) fn process_physics_chunk(
    world: &mut WorldCore,
    cx: u32,
    cy: u32,
    gravity_x: f32,
    gravity_y: f32,
    top_to_bottom: bool,
) {
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
    let mut chunk_calls: u32 = 0;
    let mut chunk_steps: u32 = 0;

    if top_to_bottom {
        // For negative gravity: process top-to-bottom
        for y in start_y..end_y {
            for x in start_x..end_x {
                let element = world.grid.get_type(x as i32, y as i32);
                if element != EL_EMPTY {
                    // Ensure each particle is integrated at most once per step.
                    if world.grid.is_updated(x, y) {
                        continue;
                    }
                    world.grid.set_updated(x, y, true);
                    let res = update_particle_physics(
                        &world.content,
                        &mut world.grid,
                        x,
                        y,
                        gravity_x,
                        gravity_y,
                    );
                    if sample_chunk {
                        chunk_calls = chunk_calls.saturating_add(1);
                        chunk_steps = chunk_steps.saturating_add(res.steps);
                    }
                    if world.perf_enabled {
                        world.perf_stats.physics_calls = world.perf_stats.physics_calls.saturating_add(1);
                        world.perf_stats.raycast_steps_total =
                            world.perf_stats.raycast_steps_total.saturating_add(res.steps);
                        if res.collided {
                            world.perf_stats.raycast_collisions =
                                world.perf_stats.raycast_collisions.saturating_add(1);
                        }
                        if res.speed > world.perf_stats_last_speed_max {
                            world.perf_stats_last_speed_max = res.speed;
                        }
                    }
                }
            }
        }
    } else {
        // For positive gravity: process bottom-to-top
        for y in (start_y..end_y).rev() {
            for x in start_x..end_x {
                let element = world.grid.get_type(x as i32, y as i32);
                if element != EL_EMPTY {
                    // Ensure each particle is integrated at most once per step.
                    if world.grid.is_updated(x, y) {
                        continue;
                    }
                    world.grid.set_updated(x, y, true);
                    let res = update_particle_physics(
                        &world.content,
                        &mut world.grid,
                        x,
                        y,
                        gravity_x,
                        gravity_y,
                    );
                    if sample_chunk {
                        chunk_calls = chunk_calls.saturating_add(1);
                        chunk_steps = chunk_steps.saturating_add(res.steps);
                    }
                    if world.perf_enabled {
                        world.perf_stats.physics_calls = world.perf_stats.physics_calls.saturating_add(1);
                        world.perf_stats.raycast_steps_total =
                            world.perf_stats.raycast_steps_total.saturating_add(res.steps);
                        if res.collided {
                            world.perf_stats.raycast_collisions =
                                world.perf_stats.raycast_collisions.saturating_add(1);
                        }
                        if res.speed > world.perf_stats_last_speed_max {
                            world.perf_stats_last_speed_max = res.speed;
                        }
                    }
                }
            }
        }
    }

    if let Some(t) = t_chunk {
        let tm = t.elapsed_ms();
        let c = chunk_calls as f64;
        let s = chunk_steps as f64;

        world.perf_stats.physics_split_s_cc += c * c;
        world.perf_stats.physics_split_s_ss += s * s;
        world.perf_stats.physics_split_s_cs += c * s;
        world.perf_stats.physics_split_s_ct += c * tm;
        world.perf_stats.physics_split_s_st += s * tm;
        world.perf_stats.physics_split_s_c += c;
        world.perf_stats.physics_split_s_s += s;
        world.perf_stats.physics_split_s_t += tm;
        world.perf_stats.physics_split_sample_n = world.perf_stats.physics_split_sample_n.saturating_add(1);
    }
}
