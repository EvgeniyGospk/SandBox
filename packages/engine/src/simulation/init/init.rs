use crate::behaviors::BehaviorRegistry;
use crate::chunks::{ChunkGrid, CHUNK_SIZE, MergedDirtyRects};
use crate::grid::Grid;
use crate::reactions::ReactionSystem;
use crate::rigid_body_system::RigidBodySystem;

use super::perf_stats::PerfStats;
use super::WorldCore;

pub(super) fn create_world_core(width: u32, height: u32) -> WorldCore {
    WorldCore {
        grid: Grid::new(width, height),
        chunks: ChunkGrid::new(width, height),
        behaviors: BehaviorRegistry::new(),
        reactions: ReactionSystem::new(),
        rigid_bodies: RigidBodySystem::new(),
        gravity_x: 0.0,
        gravity_y: 1.0,
        ambient_temperature: 20.0,
        particle_count: 0,
        frame: 0,
        rng_state: 12345,
        // Phase 3: Smart Rendering
        dirty_list: Vec::with_capacity(1000),
        chunk_transfer_buffer: vec![0u32; (CHUNK_SIZE * CHUNK_SIZE) as usize],
        // Phase 2: GPU Batching
        merged_rects: MergedDirtyRects::new(500),
        // Start with a small buffer; `extract_rect_pixels` will resize on demand.
        rect_transfer_buffer: vec![0u32; (CHUNK_SIZE * CHUNK_SIZE) as usize],
        perf_enabled: false,
        perf_stats: PerfStats::default(),
        perf_stats_last_speed_max: 0.0,
    }
}
