use std::sync::Arc;

use crate::behaviors::BehaviorRegistry;
use crate::chunks::ChunkGrid;
use crate::domain::content::ContentRegistry;
use crate::grid::Grid;
use crate::rigid_body_system::RigidBodySystem;

use super::perf_stats::PerfStats;
use super::WorldCore;

pub(super) fn create_world_core(width: u32, height: u32) -> WorldCore {
    WorldCore {
        content: Arc::new(ContentRegistry::from_generated()),
        grid: Grid::new(width, height),
        chunks: ChunkGrid::new(width, height),
        behaviors: BehaviorRegistry::new(),
        rigid_bodies: RigidBodySystem::new(),
        gravity_x: 0.0,
        gravity_y: 1.0,
        ambient_temperature: 20.0,
        particle_count: 0,
        frame: 0,
        rng_state: 12345,
        perf_enabled: false,
        perf_detailed: false,
        perf_stats: PerfStats::default(),
        perf_stats_last_speed_max: 0.0,
    }
}
