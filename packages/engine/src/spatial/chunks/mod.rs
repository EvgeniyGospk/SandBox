//! Chunk System - Phase 5: BitSet Optimization
//! 
//! Optimization:
//! - Vec<bool> (1 byte per chunk) -> Vec<u64> (1 bit per chunk)
//! - 64x memory reduction for dirty flags
//! - L1 Cache friendly iteration

mod bitset;
mod lifecycle;
mod compat;

/// Chunk size in pixels (32x32 is cache-friendly)
pub const CHUNK_SIZE: u32 = 32;

/// Manages chunk-based spatial optimization
pub struct ChunkGrid {
    chunks_x: u32,
    chunks_y: u32,
    chunk_count: usize,
    
    /// Number of u64 words needed for BitSet
    #[allow(dead_code)]
    u64_count: usize,
    
    // === BITSET OPTIMIZATION (Phase 5) ===
    // 1 bit = 1 chunk. u64 stores 64 chunks.
    dirty_bits: Vec<u64>,
    visual_dirty_bits: Vec<u64>,
    
    // Legacy compatibility (world.rs uses visual_dirty[idx])
    pub visual_dirty: Vec<bool>,
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
            // BitSet: all bits set = all dirty initially
            dirty_bits: vec![!0u64; u64_count],
            visual_dirty_bits: vec![!0u64; u64_count],
            // Legacy compatibility
            visual_dirty: vec![true; chunk_count],
        }
    }
}
