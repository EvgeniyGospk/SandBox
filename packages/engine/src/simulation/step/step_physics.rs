use crate::chunks::CHUNK_SIZE;
use crate::elements::EL_EMPTY;
use crate::physics::update_particle_physics;

use super::WorldCore;

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
                        &mut world.chunks,
                        x,
                        y,
                        gravity_x,
                        gravity_y,
                    );
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
                        &mut world.chunks,
                        x,
                        y,
                        gravity_x,
                        gravity_y,
                    );
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
}
