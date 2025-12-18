//! Chunk System - Phase 5: BitSet Optimization
//! 
//! Optimization:
//! - Vec<bool> (1 byte per chunk) -> Vec<u64> (1 bit per chunk)
//! - 64x memory reduction for dirty flags
//! - L1 Cache friendly iteration

use crate::elements::{ElementId, EL_EMPTY};

mod bitset;
mod lifecycle;
mod counts;
mod merged_rects;
mod compat;

pub use merged_rects::{DirtyRect, MergedDirtyRects};

/// Chunk size in pixels (32x32 is cache-friendly)
pub const CHUNK_SIZE: u32 = 32;

/// Number of frames before an EMPTY chunk goes to sleep
/// Only empty chunks can sleep - chunks with particles must always be processed
const SLEEP_THRESHOLD: u32 = 60;

/// Chunk state
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ChunkState {
    Active,
    Sleeping,
}

/// Manages chunk-based spatial optimization
pub struct ChunkGrid {
    chunks_x: u32,
    chunks_y: u32,
    chunk_count: usize,
    
    /// Number of u64 words needed for BitSet
    #[allow(dead_code)]
    u64_count: usize,
    
    /// Whether empty chunks are allowed to transition into `ChunkState::Sleeping`.
    /// When disabled, `ChunkState` is forced to `Active` (useful for perf comparisons).
    sleep_enabled: bool,

    state: Vec<ChunkState>,
    
    // === BITSET OPTIMIZATION (Phase 5) ===
    // 1 bit = 1 chunk. u64 stores 64 chunks.
    dirty_bits: Vec<u64>,
    visual_dirty_bits: Vec<u64>,
    
    idle_frames: Vec<u32>,
    particle_count: Vec<u32>,
    
    // Lazy Hydration
    pub virtual_temp: Vec<f32>,
    pub just_woke_up: Vec<bool>,
    
    // Legacy compatibility (world.rs uses visual_dirty[idx])
    pub visual_dirty: Vec<bool>,

    // Perf counters (reset each frame)
    pub woke_this_frame: u32,
    pub slept_this_frame: u32,
}

impl ChunkGrid {
    /// Create chunk grid for given world dimensions
    pub fn new(world_width: u32, world_height: u32) -> Self {
        let chunks_x = (world_width + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let chunks_y = (world_height + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let chunk_count = (chunks_x * chunks_y) as usize;
        
        // How many u64 needed to store chunk_count bits?
        let u64_count = (chunk_count + 63) / 64;
        
        Self {
            chunks_x,
            chunks_y,
            chunk_count,
            u64_count,
            sleep_enabled: true,
            state: vec![ChunkState::Active; chunk_count],
            // BitSet: all bits set = all dirty initially
            dirty_bits: vec![!0u64; u64_count],
            visual_dirty_bits: vec![!0u64; u64_count],
            idle_frames: vec![0; chunk_count],
            particle_count: vec![0; chunk_count],
            virtual_temp: vec![20.0; chunk_count],
            just_woke_up: vec![false; chunk_count],
            // Legacy compatibility
            visual_dirty: vec![true; chunk_count],
            woke_this_frame: 0,
            slept_this_frame: 0,
        }
    }
}
