//! Grid - Structure of Arrays (SoA) for cache-friendly particle storage
//! 
//! Phase 5: ABGR color format for direct Canvas copy
//! Phase 5.1: Parallel processing with Rayon
//! 
//! Instead of: Vec<Option<Particle>>  // Bad: many allocations, poor cache
//! We have:    types[], colors[], temps[]  // Good: linear memory, SIMD-friendly

use crate::elements::{ElementId, EL_EMPTY};
use crate::chunks::CHUNK_SIZE;

// Background color in ABGR format (little-endian: 0xAABBGGRR -> bytes [RR,GG,BB,AA])
// RGB(10,10,10) with alpha=255 -> 0xFF0A0A0A in ABGR
const BG_COLOR: u32 = 0xFF0A0A0A; // Same value since R=G=B

mod move_buffer;
pub use move_buffer::{MoveBuffer, ParticleMove};

mod indexing;
mod accessors;
mod moves;
mod sparse;
mod hydration;

/// SoA Grid - all particle data in separate arrays
pub struct Grid {
    width: u32,
    height: u32,
    size: usize,
    
    // Structure of Arrays - each property in its own contiguous array
    pub types: Vec<ElementId>,      // Element type (0 = empty)
    pub colors: Vec<u32>,           // ABGR packed color
    pub life: Vec<u16>,             // Remaining lifetime (0 = infinite)
    pub updated: Vec<u8>,           // 0 = not updated, 1 = updated this frame
    pub temperature: Vec<f32>,      // Temperature in °C
    
    // Phase 2: Newtonian Physics - Velocity arrays
    pub vx: Vec<f32>,               // Horizontal velocity (pixels/frame)
    pub vy: Vec<f32>,               // Vertical velocity (pixels/frame)
    
    // Phase 4: Zero-allocation move buffer
    pub pending_moves: MoveBuffer,

    // Sparse bookkeeping: bitset of non-empty cells per chunk (stride = chunks_x * chunks_y, each bit = cell)
    pub non_empty_chunks: Vec<u64>, // one bit per chunk, to skip fully empty chunks fast
    pub row_has_data: Vec<bool>,    // per-row fast skip inside chunk (32 rows per chunk)
}

impl Grid {
    pub fn new(width: u32, height: u32) -> Self {
        let size = (width * height) as usize;
        
        let chunks_x = (width + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let chunks_y = (height + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let chunk_bits = ((chunks_x * chunks_y) as usize + 63) / 64;
        Self {
            width,
            height,
            size,
            types: vec![EL_EMPTY; size],
            colors: vec![BG_COLOR; size],
            life: vec![0; size],
            updated: vec![0; size],
            temperature: vec![20.0; size],
            // Phase 2: Velocity arrays (start at 0)
            vx: vec![0.0; size],
            vy: vec![0.0; size],
            // Phase 4: Fixed buffer for 1M moves (~16MB RAM)
            // Enough for heavy scenes with 1M+ particles
            pending_moves: MoveBuffer::new(1_000_000),

            // Sparse bookkeeping
            non_empty_chunks: vec![0u64; chunk_bits],
            row_has_data: vec![false; (chunks_y * CHUNK_SIZE) as usize],
        }
    }
    
    // === Sparse helpers ===
    fn mark_cell_non_empty(&mut self, x: u32, y: u32) {
        let chunks_x = (self.width + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let cx = x / CHUNK_SIZE;
        let cy = y / CHUNK_SIZE;
        let chunk_idx = (cy * chunks_x + cx) as usize;
        let word = chunk_idx / 64;
        let bit = chunk_idx % 64;
        if word < self.non_empty_chunks.len() {
            self.non_empty_chunks[word] |= 1u64 << bit;
        }
        self.row_has_data[y as usize] = true;
    }

    fn mark_cell_empty(&mut self, _x: u32, _y: u32) {
        // NOTE: sparse bookkeeping is refreshed once per frame in step(), not per cell change!
        // This avoids O(N) operations on every particle removal
    }
}
