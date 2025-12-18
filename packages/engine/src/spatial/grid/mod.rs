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
pub(crate) const BG_COLOR: u32 = 0xFF0A0A0A; // Same value since R=G=B

const MIN_MOVE_BUFFER_CAPACITY: usize = 1024;
const MAX_MOVE_BUFFER_CAPACITY: usize = 1_000_000;

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

    pub row_has_data: Vec<bool>,    // per-row fast skip inside chunk (32 rows per chunk)
    row_non_empty: Vec<u32>,
}

impl Grid {
    pub fn new(width: u32, height: u32) -> Self {
        let size = (width * height) as usize;

        let chunks_y = (height + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let sparse_rows = (chunks_y * CHUNK_SIZE) as usize;
        let move_capacity = size.clamp(MIN_MOVE_BUFFER_CAPACITY, MAX_MOVE_BUFFER_CAPACITY);
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
            pending_moves: MoveBuffer::new(move_capacity),
            row_has_data: vec![false; sparse_rows],
            row_non_empty: vec![0u32; sparse_rows],
        }
    }

    pub fn new_with_move_buffer_capacity(width: u32, height: u32, move_buffer_capacity: usize) -> Self {
        let size = (width * height) as usize;

        let chunks_y = (height + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let sparse_rows = (chunks_y * CHUNK_SIZE) as usize;
        Self {
            width,
            height,
            size,
            types: vec![EL_EMPTY; size],
            colors: vec![BG_COLOR; size],
            life: vec![0; size],
            updated: vec![0; size],
            temperature: vec![20.0; size],
            vx: vec![0.0; size],
            vy: vec![0.0; size],
            pending_moves: MoveBuffer::new(move_buffer_capacity),
            row_has_data: vec![false; sparse_rows],
            row_non_empty: vec![0u32; sparse_rows],
        }
    }
    
    // === Sparse helpers ===
    fn mark_cell_non_empty(&mut self, _x: u32, y: u32) {
        let yi = y as usize;
        if yi < self.row_non_empty.len() {
            self.row_non_empty[yi] = self.row_non_empty[yi].saturating_add(1);
            self.row_has_data[yi] = true;
        }
    }

    fn mark_cell_empty(&mut self, _x: u32, _y: u32) {
        let yi = _y as usize;
        if yi < self.row_non_empty.len() {
            if self.row_non_empty[yi] > 0 {
                self.row_non_empty[yi] -= 1;
            }
            self.row_has_data[yi] = self.row_non_empty[yi] > 0;
        }
    }
}
