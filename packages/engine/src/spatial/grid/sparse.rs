use super::*;

impl Grid {
    /// Refresh chunk occupancy bits based on current row_has_data flags
    /// PHASE 5.1: Parallel row scanning with Rayon when feature enabled
    pub fn refresh_chunk_bits(&mut self) {
        let height = self.height as usize;

        let max_rows = self.row_has_data.len().min(self.row_non_empty.len());
        let limit = height.min(max_rows);
        for y in 0..limit {
            self.row_has_data[y] = self.row_non_empty[y] > 0;
        }
        for y in limit..self.row_has_data.len() {
            self.row_has_data[y] = false;
        }
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
