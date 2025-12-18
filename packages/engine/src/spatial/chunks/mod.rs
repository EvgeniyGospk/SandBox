//! Chunk System - fixed-size chunk grid for spatial partitioning.

/// Chunk size in pixels (32x32 is cache-friendly)
pub const CHUNK_SIZE: u32 = 32;

/// Manages chunk-based spatial partitioning.
pub struct ChunkGrid {
    chunks_x: u32,
    chunks_y: u32,
    chunk_count: usize,
}

impl ChunkGrid {
    /// Create chunk grid for given world dimensions
    pub fn new(world_width: u32, world_height: u32) -> Self {
        let chunks_x = (world_width + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let chunks_y = (world_height + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let chunk_count = (chunks_x * chunks_y) as usize;

        Self {
            chunks_x,
            chunks_y,
            chunk_count,
        }
    }

    /// Get chunk dimensions.
    pub fn dimensions(&self) -> (u32, u32) {
        (self.chunks_x, self.chunks_y)
    }

    /// Get total chunk count.
    pub fn total_chunks(&self) -> usize {
        self.chunk_count
    }

    /// Get active chunk count (always full grid).
    pub fn active_chunk_count(&self) -> usize {
        self.chunk_count
    }
}
