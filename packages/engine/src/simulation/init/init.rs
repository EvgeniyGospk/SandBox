use std::sync::Arc;

use crate::behaviors::BehaviorRegistry;
use crate::chunks::ChunkGrid;
use crate::domain::content::ContentRegistry;
use crate::grid::Grid;
use crate::rigid_body_system::RigidBodySystem;

use super::perf_stats::PerfStats;
use super::WorldCore;

pub(super) fn create_world_core(width: u32, height: u32) -> WorldCore {
    let total_cells = (width as u64) * (height as u64);
    let (physics_cadence_mask, behavior_cadence_mask) = if total_cells >= 2_000_000 {
        (0b111_1111, 0b111_1111)  // 128-frame cadence for very large worlds
    } else if total_cells >= 1_000_000 {
        (0b11_1111, 0b111_1111)  // physics=64, behavior=128 for large worlds
    } else if total_cells >= 400_000 {
        (0b1111, 0b1_1111)  // physics=16, behavior=32 for medium worlds
    } else {
        (0, 0)  // no cadence for small worlds
    };
    let temperature_cadence_mask = if total_cells >= 2_000_000 {
        0b1_1111  // 32-frame cadence for very large worlds
    } else if total_cells >= 1_000_000 {
        0b1_1111  // 32-frame cadence for large worlds
    } else if total_cells >= 400_000 {
        0b1111    // 16-frame cadence for medium worlds
    } else {
        0         // no cadence for small worlds
    };

    WorldCore {
        content: Arc::new(ContentRegistry::from_generated()),
        grid: Grid::new(width, height),
        chunks: ChunkGrid::new(width, height),
        behaviors: BehaviorRegistry::new(),
        rigid_bodies: RigidBodySystem::new(),
        gravity_x: 0.0,
        gravity_y: 1.0,
        ambient_temperature: 20.0,
        physics_cadence_mask,
        behavior_cadence_mask,
        temperature_cadence_mask,
        particle_count: 0,
        frame: 0,
        rng_state: 12345,
        temperature_needs_processing: false,
        perf_enabled: false,
        perf_detailed: false,
        perf_split: false,
        perf_stats: PerfStats::default(),
        perf_stats_last_speed_max: 0.0,
    }
}
