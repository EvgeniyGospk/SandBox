use super::*;

// ============================================================================
// PHASE 2: MERGED DIRTY RECTANGLES FOR GPU BATCHING
// ============================================================================
// 
// Instead of uploading each dirty chunk separately (N calls to texSubImage2D),
// we merge adjacent dirty chunks into larger rectangles.
// 
// Example: 6 dirty chunks in a row → 1 rectangle upload
// 
// Algorithm: Row-based run-length encoding
// 1. For each row of chunks, find runs of consecutive dirty chunks
// 2. Output (x, y, width, height) in CHUNK units

/// Represents a merged rectangle of dirty chunks (in CHUNK coordinates)
#[derive(Clone, Copy, Debug)]
pub struct DirtyRect {
    pub cx: u32,      // Chunk X
    pub cy: u32,      // Chunk Y
    pub cw: u32,      // Width in chunks
    pub ch: u32,      // Height in chunks (always 1 for row-based RLE)
}

/// Buffer for storing merged dirty rectangles (reused across frames)
pub struct MergedDirtyRects {
    rects: Vec<DirtyRect>,
    count: usize,
}

impl MergedDirtyRects {
    pub fn new(capacity: usize) -> Self {
        Self {
            rects: vec![DirtyRect { cx: 0, cy: 0, cw: 0, ch: 0 }; capacity],
            count: 0,
        }
    }

    #[inline]
    pub fn clear(&mut self) {
        self.count = 0;
    }

    #[inline]
    pub fn push(&mut self, rect: DirtyRect) {
        if self.count < self.rects.len() {
            self.rects[self.count] = rect;
            self.count += 1;
        }
    }

    #[inline]
    pub fn count(&self) -> usize {
        self.count
    }

    #[inline]
    pub fn get(&self, idx: usize) -> Option<&DirtyRect> {
        if idx < self.count {
            Some(&self.rects[idx])
        } else {
            None
        }
    }

    /// Get raw pointer for JS interop
    pub fn as_ptr(&self) -> *const DirtyRect {
        self.rects.as_ptr()
    }
}

impl ChunkGrid {
    /// PHASE 2: Collect dirty chunks and merge into rectangles
    /// 
    /// Uses row-based run-length encoding to merge horizontal runs.
    /// Returns number of rectangles generated.
    /// 
    /// Call get_merged_rect(idx) to retrieve each rectangle.
    pub fn collect_merged_dirty_rects(&self, output: &mut MergedDirtyRects) -> usize {
        output.clear();

        // Row-based RLE: scan each row and find runs of consecutive dirty chunks
        for cy in 0..self.chunks_y {
            let mut run_start: Option<u32> = None;

            for cx in 0..self.chunks_x {
                let idx = self.chunk_idx_from_coords(cx, cy);
                let is_dirty = Self::check_bit(&self.visual_dirty_bits, idx);

                if is_dirty {
                    // Start or continue a run
                    if run_start.is_none() {
                        run_start = Some(cx);
                    }
                } else {
                    // End of run (if any)
                    if let Some(start) = run_start {
                        output.push(DirtyRect {
                            cx: start,
                            cy,
                            cw: cx - start,
                            ch: 1,
                        });
                        run_start = None;
                    }
                }
            }

            // End of row - close any open run
            if let Some(start) = run_start {
                output.push(DirtyRect {
                    cx: start,
                    cy,
                    cw: self.chunks_x - start,
                    ch: 1,
                });
            }
        }

        output.count()
    }

    /// PHASE 2: Try to merge vertically adjacent rectangles
    /// 
    /// After row-based RLE, we can merge rectangles that have the same
    /// X start and width across consecutive rows.
    /// 
    /// This further reduces the number of GPU uploads.
    pub fn merge_vertical(&self, rects: &mut MergedDirtyRects) {
        if rects.count() < 2 { return; }

        // Simple O(n²) merge - fine for small numbers of rectangles
        let mut i = 0;
        while i < rects.count {
            let rect_i = rects.rects[i];
            let mut j = i + 1;

            while j < rects.count {
                let rect_j = rects.rects[j];

                // Can merge if same X, same width, and adjacent rows
                if rect_j.cx == rect_i.cx 
                    && rect_j.cw == rect_i.cw 
                    && rect_j.cy == rect_i.cy + rect_i.ch 
                {
                    // Extend rect_i downward
                    rects.rects[i].ch += rect_j.ch;

                    // Remove rect_j by swapping with last
                    rects.count -= 1;
                    if j < rects.count {
                        rects.rects[j] = rects.rects[rects.count];
                    }
                    // Don't increment j - check the swapped element
                } else {
                    j += 1;
                }
            }

            i += 1;
        }
    }
}
