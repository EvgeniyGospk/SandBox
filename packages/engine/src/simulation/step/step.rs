use crate::behaviors::{reset_liquid_scan_counter, take_liquid_scan_counter};
use crate::elements::EL_EMPTY;
use crate::physics::{reset_physics_perf_counters, take_physics_perf_counters};
use crate::temperature::{
    process_temperature_grid_chunked, reset_phase_change_counter, take_phase_change_counter,
};

use super::{PerfTimer, WorldCore};

pub(super) fn step(world: &mut WorldCore) {
    let perf_on = world.perf_enabled;
    if perf_on {
        world.perf_stats.reset();
        world.perf_stats_last_speed_max = 0.0;
        // Snapshot pre-step counts
        world.perf_stats.active_chunks = world.chunks.active_chunk_count() as u32;
        world.perf_stats.particle_count = world.particle_count;
        world.perf_stats.grid_size = world.grid.size() as u32;
        // rough memory estimate of SoA arrays (bytes)
        world.perf_stats.memory_bytes = (world.grid.size() as u32)
            .saturating_mul(20); // types(1)+colors(4)+life(2)+updated(1)+temp(4)+vx(4)+vy(4)
        reset_physics_perf_counters();
        reset_liquid_scan_counter();
        reset_phase_change_counter();
    }
    let step_start = if perf_on { Some(PerfTimer::start()) } else { None };

    // Reset updated flags and clear move tracking
    // Pass 1: `updated` is reserved for physics to guarantee
    // "at most one physics integration per particle per step".
    world.grid.reset_updated();

    // === RIGID BODY PHYSICS ===
    // Update rigid bodies BEFORE particle physics so particles can react to new body positions
    if perf_on {
        let t0 = PerfTimer::start();
        world
            .rigid_bodies
            .update(&world.content, &mut world.grid, world.gravity_x, world.gravity_y);
        world.perf_stats.rigid_ms = t0.elapsed_ms();
    } else {
        world
            .rigid_bodies
            .update(&world.content, &mut world.grid, world.gravity_x, world.gravity_y);
    }

    // === PHASE 2: PHYSICS PASS ===
    // Apply gravity and velocity-based movement BEFORE behavior pass
    if perf_on {
        let t0 = PerfTimer::start();
        world.process_physics();
        world.perf_stats.physics_ms = t0.elapsed_ms();

        if world.perf_split || world.perf_detailed {
            let n = world.perf_stats.physics_split_sample_n as f64;
            if n >= 3.0 {
                let m00 = n;
                let m01 = world.perf_stats.physics_split_s_c;
                let m02 = world.perf_stats.physics_split_s_s;
                let m10 = m01;
                let m11 = world.perf_stats.physics_split_s_cc;
                let m12 = world.perf_stats.physics_split_s_cs;
                let m20 = m02;
                let m21 = m12;
                let m22 = world.perf_stats.physics_split_s_ss;

                let det = m00 * (m11 * m22 - m12 * m21)
                    - m01 * (m10 * m22 - m12 * m20)
                    + m02 * (m10 * m21 - m11 * m20);

                if det.abs() > 1e-9 {
                    let b0 = world.perf_stats.physics_split_s_t;
                    let b1 = world.perf_stats.physics_split_s_ct;
                    let b2 = world.perf_stats.physics_split_s_st;

                    let det_a2 = m00 * (m11 * b2 - b1 * m21)
                        - m01 * (m10 * b2 - b1 * m20)
                        + b0 * (m10 * m21 - m11 * m20);

                    let a2 = det_a2 / det; // ms per raycast step

                    let raycast_ms = (a2 * (world.perf_stats.raycast_steps_total as f64)).max(0.0);
                    let raycast_ms = raycast_ms.min(world.perf_stats.physics_ms);
                    world.perf_stats.physics_raycast_ms = raycast_ms;
                    world.perf_stats.physics_other_ms = (world.perf_stats.physics_ms - raycast_ms).max(0.0);
                } else {
                    world.perf_stats.physics_raycast_ms = 0.0;
                    world.perf_stats.physics_other_ms = world.perf_stats.physics_ms;
                }
            } else {
                world.perf_stats.physics_raycast_ms = 0.0;
                world.perf_stats.physics_other_ms = world.perf_stats.physics_ms;
            }
        } else {
            world.perf_stats.physics_raycast_ms = 0.0;
            world.perf_stats.physics_other_ms = 0.0;
        }
    } else {
        world.process_physics();
    }

    // Pass 2: Behaviors also rely on `updated` to prevent double-processing,
    // so we must reset it after physics.
    world.grid.reset_updated();

    let go_right = (world.frame & 1) == 0;
    let (chunks_x, chunks_y) = world.chunks.dimensions();

    if perf_on {
        let t0 = PerfTimer::start();
        // Process chunks from bottom to top (for gravity)
        if world.gravity_y >= 0.0 {
            for cy in (0..chunks_y).rev() {
                world.process_chunk_row(cy, chunks_x, go_right);
            }
        } else {
            for cy in 0..chunks_y {
                world.process_chunk_row(cy, chunks_x, go_right);
            }
        }
        world.perf_stats.chunks_ms = t0.elapsed_ms();

        if world.perf_split || world.perf_detailed {
            let s_ee = world.perf_stats.chunks_split_s_ee;
            let s_nn = world.perf_stats.chunks_split_s_nn;
            let s_en = world.perf_stats.chunks_split_s_en;
            let s_et = world.perf_stats.chunks_split_s_et;
            let s_nt = world.perf_stats.chunks_split_s_nt;

            let det = s_ee * s_nn - s_en * s_en;
            if det.abs() > 1e-9 {
                let a = (s_et * s_nn - s_nt * s_en) / det; // ms per empty cell
                let b = (s_nt * s_ee - s_et * s_en) / det; // ms per non-empty cell

                world.perf_stats.chunks_empty_ms = (a * (world.perf_stats.chunk_empty_cells as f64)).max(0.0);
                world.perf_stats.chunks_non_empty_ms = (b * (world.perf_stats.chunk_non_empty_cells as f64)).max(0.0);
            } else {
                world.perf_stats.chunks_empty_ms = 0.0;
                world.perf_stats.chunks_non_empty_ms = 0.0;
            }
        } else {
            world.perf_stats.chunks_empty_ms = 0.0;
            world.perf_stats.chunks_non_empty_ms = 0.0;
        }
    } else {
        // Process chunks from bottom to top (for gravity)
        if world.gravity_y >= 0.0 {
            for cy in (0..chunks_y).rev() {
                world.process_chunk_row(cy, chunks_x, go_right);
            }
        } else {
            for cy in 0..chunks_y {
                world.process_chunk_row(cy, chunks_x, go_right);
            }
        }
    }

    // Temperature pass - run every frame
    if perf_on {
        let t0 = PerfTimer::start();
        let (temp_processed, air_processed, air_ms_est, particle_ms_est) = process_temperature_grid_chunked(
            &world.content,
            &mut world.grid,
            world.ambient_temperature,
            world.frame,
            &mut world.rng_state,
            world.perf_split || world.perf_detailed,
        );
        world.perf_stats.temperature_ms = t0.elapsed_ms();
        world.perf_stats.temp_cells = temp_processed;
        world.perf_stats.simd_air_cells = air_processed;
        world.perf_stats.temperature_air_ms = air_ms_est;
        world.perf_stats.temperature_particle_ms = particle_ms_est;
    } else {
        process_temperature_grid_chunked(
            &world.content,
            &mut world.grid,
            world.ambient_temperature,
            world.frame,
            &mut world.rng_state,
            false,
        );
    }

    if perf_on {
        // Post-step snapshot
        world.perf_stats.active_chunks = world.chunks.active_chunk_count() as u32;
        world.perf_stats.particle_count = world.particle_count;
        let (ray_steps, ray_collisions) = take_physics_perf_counters();
        world.perf_stats.raycast_steps_total = ray_steps as u32;
        world.perf_stats.raycast_collisions = ray_collisions as u32;
        world.perf_stats.raycast_speed_max = world.perf_stats_last_speed_max;
        world.perf_stats.phase_changes = take_phase_change_counter() as u32;
        world.perf_stats.liquid_scans = 0;
        let liquid_scans = take_liquid_scan_counter();
        world.perf_stats.liquid_scans = liquid_scans as u32;
        world.perf_stats.raycast_speed_max = world
            .perf_stats
            .raycast_speed_max
            .max(world.perf_stats_last_speed_max);
        if world.perf_detailed {
            let mut non_empty = 0u32;
            for t in world.grid.types.iter() {
                if *t != EL_EMPTY {
                    non_empty = non_empty.saturating_add(1);
                }
            }
            world.perf_stats.non_empty_cells = non_empty;
        }
        if let Some(start) = step_start {
            world.perf_stats.step_ms = start.elapsed_ms();
        }
    }

    world.frame += 1;
}
