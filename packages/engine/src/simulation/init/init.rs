use std::sync::Arc;

use crate::behaviors::BehaviorRegistry;
use crate::chunks::{ChunkGrid, CHUNK_SIZE, MergedDirtyRects};
use crate::domain::content::ContentRegistry;
use crate::grid::Grid;
use crate::rigid_body_system::RigidBodySystem;

use super::perf_stats::PerfStats;
use super::RenderBuffers;
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
        chunk_gating_enabled: true,
        sparse_row_skip_enabled: true,
        temperature_every_frame: false,

        render: RenderBuffers {
            dirty_list: Vec::with_capacity(1000),
            chunk_transfer_buffer: vec![0u32; (CHUNK_SIZE * CHUNK_SIZE) as usize],
            merged_rects: MergedDirtyRects::new(500),
            // Start with a small buffer; `extract_rect_pixels` will resize on demand.
            rect_transfer_buffer: vec![0u32; (CHUNK_SIZE * CHUNK_SIZE) as usize],
        },
        perf_enabled: false,
        perf_stats: PerfStats::default(),
        perf_stats_last_speed_max: 0.0,
    }
}

pub(super) fn create_world_core_with_move_buffer_capacity(
    width: u32,
    height: u32,
    move_buffer_capacity: usize,
) -> WorldCore {
    WorldCore {
        content: Arc::new(ContentRegistry::from_generated()),
        grid: Grid::new_with_move_buffer_capacity(width, height, move_buffer_capacity),
        chunks: ChunkGrid::new(width, height),
        behaviors: BehaviorRegistry::new(),
        rigid_bodies: RigidBodySystem::new(),
        gravity_x: 0.0,
        gravity_y: 1.0,
        ambient_temperature: 20.0,
        particle_count: 0,
        frame: 0,
        rng_state: 12345,
        chunk_gating_enabled: true,
        sparse_row_skip_enabled: true,
        temperature_every_frame: false,

        render: RenderBuffers {
            dirty_list: Vec::with_capacity(1000),
            chunk_transfer_buffer: vec![0u32; (CHUNK_SIZE * CHUNK_SIZE) as usize],
            merged_rects: MergedDirtyRects::new(500),
            rect_transfer_buffer: vec![0u32; (CHUNK_SIZE * CHUNK_SIZE) as usize],
        },
        perf_enabled: false,
        perf_stats: PerfStats::default(),
        perf_stats_last_speed_max: 0.0,
    }
}
