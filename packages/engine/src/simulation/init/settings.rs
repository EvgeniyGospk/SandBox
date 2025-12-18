use super::perf_stats::PerfStats;
use super::WorldCore;

pub(super) fn enable_perf_metrics(world: &mut WorldCore, enabled: bool) {
    world.perf_enabled = enabled;
}

pub(super) fn get_perf_stats(world: &WorldCore) -> PerfStats {
    world.perf_stats.clone()
}

pub(super) fn set_gravity(world: &mut WorldCore, x: f32, y: f32) {
    world.gravity_x = x;
    world.gravity_y = y;
}

pub(super) fn set_ambient_temperature(world: &mut WorldCore, temp: f32) {
    world.ambient_temperature = temp;
}

pub(super) fn get_ambient_temperature(world: &WorldCore) -> f32 {
    world.ambient_temperature
}

pub(super) fn set_chunk_sleeping_enabled(world: &mut WorldCore, enabled: bool) {
    world.chunks.set_sleeping_enabled(enabled);
}

pub(super) fn set_chunk_gating_enabled(world: &mut WorldCore, enabled: bool) {
    world.chunk_gating_enabled = enabled;
}

pub(super) fn set_sparse_row_skip_enabled(world: &mut WorldCore, enabled: bool) {
    world.sparse_row_skip_enabled = enabled;
}

pub(super) fn set_temperature_every_frame(world: &mut WorldCore, enabled: bool) {
    world.temperature_every_frame = enabled;
}

pub(super) fn set_cross_chunk_move_tracking_enabled(world: &mut WorldCore, enabled: bool) {
    world.grid.set_cross_chunk_move_tracking_enabled(enabled);
}
