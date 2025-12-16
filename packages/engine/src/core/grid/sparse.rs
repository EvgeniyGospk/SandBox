use super::*;

#[cfg(feature = "parallel")]
use rayon::prelude::*;

impl Grid {
    /// Refresh chunk occupancy bits based on current row_has_data flags
    /// PHASE 5.1: Parallel row scanning with Rayon when feature enabled
    pub fn refresh_chunk_bits(&mut self) {
        let width = self.width as usize;
        let height = self.height as usize;

        // First: scan all rows to update row_has_data
        // Note: parallel version uses chunks to avoid borrow issues
        #[cfg(feature = "parallel")]
        {
            // Process rows in parallel chunks
            let types = &self.types;
            let results: Vec<bool> = (0..height).into_par_iter().map(|y| {
                let start = y * width;
                let end = start + width;
                types[start..end].iter().any(|&t| t != EL_EMPTY)
            }).collect();

            for (y, has_data) in results.into_iter().enumerate() {
                self.row_has_data[y] = has_data;
            }
        }

        #[cfg(not(feature = "parallel"))]
        {
            for y in 0..height {
                let start = y * width;
                let end = start + width;
                self.row_has_data[y] = self.types[start..end].iter().any(|&t| t != EL_EMPTY);
            }
        }

        // Then: update chunk bits based on row_has_data
        let chunks_x = (self.width + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let chunks_y = (self.height + CHUNK_SIZE - 1) / CHUNK_SIZE;
        let mut bits = vec![0u64; self.non_empty_chunks.len()];

        for cy in 0..chunks_y {
            let start_y = cy * CHUNK_SIZE;
            let end_y = (start_y + CHUNK_SIZE).min(self.height);
            let mut has_data_row = false;
            for ry in start_y..end_y {
                if self.row_has_data[ry as usize] {
                    has_data_row = true;
                    break;
                }
            }
            if has_data_row {
                for cx in 0..chunks_x {
                    let chunk_idx = (cy * chunks_x + cx) as usize;
                    let word = chunk_idx / 64;
                    let bit = chunk_idx % 64;
                    bits[word] |= 1u64 << bit;
                }
            }
        }
        self.non_empty_chunks = bits;
    }

    #[allow(dead_code)]
    fn refresh_sparse_row(&mut self, y: u32) {
        let width = self.width as usize;
        let start = (y as usize) * width;
        let end = start + width;
        let row_slice = &self.types[start..end];
        self.row_has_data[y as usize] = row_slice.iter().any(|&t| t != EL_EMPTY);
    }
}
