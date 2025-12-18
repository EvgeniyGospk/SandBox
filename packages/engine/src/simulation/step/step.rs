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
        world.perf_stats.dirty_chunks = world.chunks.dirty_chunk_count() as u32;
        world.perf_stats.pending_moves = world.grid.pending_moves.count as u32;
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

    // === LAZY HYDRATION: Process waking chunks ===
    // When a chunk transitions Sleep -> Active, we need to fill its air cells
    // with the current virtual_temp (which has been smoothly animating)
    if perf_on {
        let t0 = PerfTimer::start();
        world.hydrate_waking_chunks();
        world.perf_stats.hydrate_ms = t0.elapsed_ms();
    } else {
        world.hydrate_waking_chunks();
    }

    // Reset updated flags and clear move tracking
    // Pass 1: `updated` is reserved for physics to guarantee
    // "at most one physics integration per particle per step".
    world.grid.reset_updated();
    world.grid.clear_moves();
    // Refresh sparse markers for rows/chunks (keeps skips accurate)
    world.grid.refresh_chunk_bits();

    // Phase 4: Begin frame for chunk tracking
    world.chunks.begin_frame();

    // === RIGID BODY PHYSICS ===
    // Update rigid bodies BEFORE particle physics so particles can react to new body positions
    if perf_on {
        let t0 = PerfTimer::start();
        world
            .rigid_bodies
            .update(&world.content, &mut world.grid, &mut world.chunks, world.gravity_x, world.gravity_y);
        world.perf_stats.rigid_ms = t0.elapsed_ms();
    } else {
        world
            .rigid_bodies
            .update(&world.content, &mut world.grid, &mut world.chunks, world.gravity_x, world.gravity_y);
    }

    // === PHASE 2: PHYSICS PASS ===
    // Apply gravity and velocity-based movement BEFORE behavior pass
    if perf_on {
        let t0 = PerfTimer::start();
        world.process_physics();
        world.perf_stats.physics_ms = t0.elapsed_ms();
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

    // Phase 4.1: Apply recorded moves to chunk system
    if perf_on {
        let t0 = PerfTimer::start();
        world.apply_pending_moves();
        world.perf_stats.apply_moves_ms = t0.elapsed_ms();
    } else {
        world.apply_pending_moves();
    }

    // Safety net: MoveBuffer overflow means cross-chunk tracking is unreliable.
    // Rebuild chunk particle counts from the authoritative grid to prevent
    // frozen/sleeping chunks and other desync symptoms.
    if world.grid.pending_moves.overflow_count() > 0 {
        world.chunks.mark_all_dirty();
    }

    // Temperature pass - run every 4th frame for performance
    // Lazy Hydration: now updates virtual_temp for sleeping chunks!
    // PERF: Use bitwise AND instead of modulo (4x less temperature updates)
    if world.frame & 3 == 0 {
        if perf_on {
            let t0 = PerfTimer::start();
            let (temp_processed, air_processed) = process_temperature_grid_chunked(
                &world.content,
                &mut world.grid,
                &mut world.chunks, // Now mutable for virtual_temp updates
                world.ambient_temperature,
                world.frame,
                &mut world.rng_state,
            );
            world.perf_stats.temperature_ms = t0.elapsed_ms();
            world.perf_stats.temp_cells = temp_processed;
            world.perf_stats.simd_air_cells = air_processed;
        } else {
            process_temperature_grid_chunked(
                &world.content,
                &mut world.grid,
                &mut world.chunks, // Now mutable for virtual_temp updates
                world.ambient_temperature,
                world.frame,
                &mut world.rng_state,
            );
        }
    }

    if perf_on {
        // Post-step snapshot
        world.perf_stats.active_chunks = world.chunks.active_chunk_count() as u32;
        world.perf_stats.dirty_chunks = world.chunks.dirty_chunk_count() as u32;
        world.perf_stats.pending_moves = world.grid.pending_moves.count as u32;
        world.perf_stats.particle_count = world.particle_count;
        world.perf_stats.move_buffer_overflows = world.grid.pending_moves.overflow_count() as u32;
        world.perf_stats.move_buffer_usage = if world.grid.pending_moves.capacity() > 0 {
            (world.grid.pending_moves.count as f32) / (world.grid.pending_moves.capacity() as f32)
        } else {
            0.0
        };
        let (ray_steps, ray_collisions) = take_physics_perf_counters();
        world.perf_stats.raycast_steps_total = ray_steps as u32;
        world.perf_stats.raycast_collisions = ray_collisions as u32;
        world.perf_stats.raycast_speed_max = world.perf_stats_last_speed_max;
        world.perf_stats.chunks_woken = world.chunks.woke_this_frame;
        world.perf_stats.chunks_slept = world.chunks.slept_this_frame;
        world.perf_stats.phase_changes = take_phase_change_counter() as u32;
        world.perf_stats.liquid_scans = 0;
        let liquid_scans = take_liquid_scan_counter();
        world.perf_stats.liquid_scans = liquid_scans as u32;
        world.perf_stats.raycast_speed_max = world
            .perf_stats
            .raycast_speed_max
            .max(world.perf_stats_last_speed_max);
        // Full grid scan for non-empty cells (only when perf_enabled)
        let mut non_empty = 0u32;
        for t in world.grid.types.iter() {
            if *t != EL_EMPTY {
                non_empty = non_empty.saturating_add(1);
            }
        }
        world.perf_stats.non_empty_cells = non_empty;
        // Chunk particle stats
        let mut sum = 0u32;
        let mut maxp = 0u32;
        for &c in world.chunks.particle_counts().iter() {
            sum = sum.saturating_add(c);
            if c > maxp {
                maxp = c;
            }
        }
        world.perf_stats.chunk_particle_sum = sum;
        world.perf_stats.chunk_particle_max = maxp;
        if let Some(start) = step_start {
            world.perf_stats.step_ms = start.elapsed_ms();
        }
    }

    world.frame += 1;
}
