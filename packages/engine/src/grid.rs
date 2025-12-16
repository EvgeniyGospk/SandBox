//! Grid - Structure of Arrays (SoA) for cache-friendly particle storage
//! 
//! Phase 5: ABGR color format for direct Canvas copy
//! Phase 5.1: Parallel processing with Rayon
//! 
//! Instead of: Vec<Option<Particle>>  // Bad: many allocations, poor cache
//! We have:    types[], colors[], temps[]  // Good: linear memory, SIMD-friendly

use crate::elements::{ElementId, EL_EMPTY};
use crate::chunks::CHUNK_SIZE;

#[cfg(feature = "parallel")]
use rayon::prelude::*;

// Background color in ABGR format (little-endian: 0xAABBGGRR -> bytes [RR,GG,BB,AA])
// RGB(10,10,10) with alpha=255 -> 0xFF0A0A0A in ABGR
const BG_COLOR: u32 = 0xFF0A0A0A; // Same value since R=G=B

/// Recorded particle movement (from_x, from_y, to_x, to_y)
pub type ParticleMove = (u32, u32, u32, u32);

// === PHASE 4: ZERO-ALLOCATION MOVE BUFFER ===
// Fixed-size buffer that never reallocates. GC killer!

/// Fixed-capacity move buffer - allocated once, reused forever
pub struct MoveBuffer {
    data: Vec<ParticleMove>,
    pub count: usize,
    capacity: usize,
    overflow_count: usize,
}

impl MoveBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            data: vec![(0, 0, 0, 0); capacity], // Single allocation at startup
            count: 0,
            capacity,
            overflow_count: 0,
        }
    }
    
    /// Push move - drops silently if buffer full (1 frame desync is invisible)
    #[inline(always)]
    pub fn push(&mut self, m: ParticleMove) {
        if self.count < self.capacity {
            // SAFETY: We just checked bounds above
            unsafe {
                *self.data.get_unchecked_mut(self.count) = m;
            }
            self.count += 1;
        } else {
            self.overflow_count += 1;
        }
        // If full, silently drop. Better than GC stutter!
    }
    
    /// Reset counter - memory stays allocated
    #[inline(always)]
    pub fn clear(&mut self) {
        self.count = 0;
        self.overflow_count = 0;
    }
    
    /// Get raw pointer to data for unsafe iteration
    #[inline(always)]
    pub fn as_ptr(&self) -> *const ParticleMove {
        self.data.as_ptr()
    }

    #[inline(always)]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    #[inline(always)]
    pub fn overflow_count(&self) -> usize {
        self.overflow_count
    }
}

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
    
    // === Dimensions ===
    #[inline]
    pub fn width(&self) -> u32 { self.width }
    
    #[inline]
    pub fn height(&self) -> u32 { self.height }
    
    #[inline]
    pub fn size(&self) -> usize { self.size }
    
    // === Index conversion ===
    #[inline]
    pub fn index(&self, x: u32, y: u32) -> usize {
        (y * self.width + x) as usize
    }
    
    #[inline]
    pub fn coords(&self, idx: usize) -> (u32, u32) {
        let x = (idx as u32) % self.width;
        let y = (idx as u32) / self.width;
        (x, y)
    }
    
    // === Bounds checking ===
    #[inline]
    pub fn in_bounds(&self, x: i32, y: i32) -> bool {
        x >= 0 && x < self.width as i32 && y >= 0 && y < self.height as i32
    }
    
    #[inline]
    pub fn is_empty(&self, x: i32, y: i32) -> bool {
        if !self.in_bounds(x, y) { return false; }
        self.types[self.index(x as u32, y as u32)] == EL_EMPTY
    }
    
    #[inline]
    pub fn is_empty_idx(&self, idx: usize) -> bool {
        self.types[idx] == EL_EMPTY
    }
    
    // === Type access ===
    #[inline]
    pub fn get_type(&self, x: i32, y: i32) -> ElementId {
        if !self.in_bounds(x, y) { return EL_EMPTY; }
        self.types[self.index(x as u32, y as u32)]
    }
    
    #[inline]
    pub fn get_type_idx(&self, idx: usize) -> ElementId {
        self.types[idx]
    }
    
    #[inline]
    pub fn set_type(&mut self, x: u32, y: u32, t: ElementId) {
        let idx = self.index(x, y);
        self.types[idx] = t;
    }
    
    // === Color access ===
    #[inline]
    pub fn get_color(&self, x: u32, y: u32) -> u32 {
        self.colors[self.index(x, y)]
    }
    
    #[inline]
    pub fn set_color(&mut self, x: u32, y: u32, c: u32) {
        let idx = self.index(x, y);
        self.colors[idx] = c;
    }
    
    // === Life access ===
    #[inline]
    pub fn get_life(&self, x: u32, y: u32) -> u16 {
        self.life[self.index(x, y)]
    }
    
    #[inline]
    pub fn set_life(&mut self, x: u32, y: u32, l: u16) {
        let idx = self.index(x, y);
        self.life[idx] = l;
    }
    
    // === Updated flag ===
    #[inline]
    pub fn is_updated(&self, x: u32, y: u32) -> bool {
        self.updated[self.index(x, y)] == 1
    }
    
    #[inline]
    pub fn is_updated_idx(&self, idx: usize) -> bool {
        self.updated[idx] == 1
    }
    
    #[inline]
    pub fn set_updated(&mut self, x: u32, y: u32, u: bool) {
        let idx = self.index(x, y);
        self.updated[idx] = if u { 1 } else { 0 };
    }
    
    /// Reset updated flags for all cells
    /// PHASE 5.1: Parallel fill with Rayon when feature enabled
    #[inline]
    pub fn reset_updated(&mut self) {
        #[cfg(feature = "parallel")]
        {
            self.updated.par_iter_mut().for_each(|v| *v = 0);
        }
        #[cfg(not(feature = "parallel"))]
        {
            self.updated.fill(0);
        }
    }
    
    // === Temperature access ===
    #[inline]
    pub fn get_temp(&self, x: i32, y: i32) -> f32 {
        if !self.in_bounds(x, y) { return 20.0; }
        self.temperature[self.index(x as u32, y as u32)]
    }
    
    #[inline]
    pub fn set_temp(&mut self, x: u32, y: u32, t: f32) {
        let idx = self.index(x, y);
        self.temperature[idx] = t;
    }
    
    // === Phase 2: Velocity access ===
    #[inline]
    pub fn get_vx(&self, x: u32, y: u32) -> f32 {
        self.vx[self.index(x, y)]
    }
    
    #[inline]
    pub fn get_vy(&self, x: u32, y: u32) -> f32 {
        self.vy[self.index(x, y)]
    }
    
    #[inline]
    pub fn set_vx(&mut self, x: u32, y: u32, v: f32) {
        let idx = self.index(x, y);
        self.vx[idx] = v;
    }
    
    #[inline]
    pub fn set_vy(&mut self, x: u32, y: u32, v: f32) {
        let idx = self.index(x, y);
        self.vy[idx] = v;
    }
    
    #[inline]
    pub fn add_velocity(&mut self, x: u32, y: u32, dvx: f32, dvy: f32) {
        let idx = self.index(x, y);
        self.vx[idx] += dvx;
        self.vy[idx] += dvy;
    }
    
    #[inline(always)]
    fn record_cross_chunk_swap_moves(
        &mut self,
        x1: u32,
        y1: u32,
        t1: ElementId,
        x2: u32,
        y2: u32,
        t2: ElementId,
    ) {
        if t1 == EL_EMPTY && t2 == EL_EMPTY {
            return;
        }

        let c1_x = x1 >> 5; // x1 / 32
        let c1_y = y1 >> 5; // y1 / 32
        let c2_x = x2 >> 5;
        let c2_y = y2 >> 5;

        if c1_x == c2_x && c1_y == c2_y {
            return;
        }

        let has1 = t1 != EL_EMPTY;
        let has2 = t2 != EL_EMPTY;

        match (has1, has2) {
            // Particle moved 1 -> 2
            (true, false) => self.pending_moves.push((x1, y1, x2, y2)),
            // Particle moved 2 -> 1
            (false, true) => self.pending_moves.push((x2, y2, x1, y1)),
            // Two particles swapped across chunks: record both so per-chunk counts remain stable.
            (true, true) => {
                self.pending_moves.push((x1, y1, x2, y2));
                self.pending_moves.push((x2, y2, x1, y1));
            }
            (false, false) => {}
        }
    }

    // === Swap two cells (all data) ===
    // Phase 4: Records cross-chunk moves for chunk tracking
    pub fn swap(&mut self, x1: u32, y1: u32, x2: u32, y2: u32) {
        let idx1 = self.index(x1, y1);
        let idx2 = self.index(x2, y2);
        
        // Record cross-chunk movement based on pre-swap occupancy.
        let t1 = self.types[idx1];
        let t2 = self.types[idx2];
        self.record_cross_chunk_swap_moves(x1, y1, t1, x2, y2, t2);
        
        self.swap_idx(idx1, idx2);
        // NOTE: sparse bookkeeping is refreshed once per frame in step(), not per swap!
    }
    
    #[inline]
    pub fn swap_idx(&mut self, idx1: usize, idx2: usize) {
        self.types.swap(idx1, idx2);
        self.colors.swap(idx1, idx2);
        self.life.swap(idx1, idx2);
        self.updated.swap(idx1, idx2);
        self.temperature.swap(idx1, idx2);
        // Phase 2: Swap velocity too
        self.vx.swap(idx1, idx2);
        self.vy.swap(idx1, idx2);
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

    fn refresh_sparse_row(&mut self, y: u32) {
        let width = self.width as usize;
        let start = (y as usize) * width;
        let end = start + width;
        let row_slice = &self.types[start..end];
        self.row_has_data[y as usize] = row_slice.iter().any(|&t| t != EL_EMPTY);
    }

    
    // === Phase 4: Move tracking for chunks (Zero-Allocation) ===
    
    /// Clear pending moves (call at frame start)
    /// Memory stays allocated - just resets counter
    pub fn clear_moves(&mut self) {
        self.pending_moves.clear();
    }

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
    
    // === Set particle with all data ===
    // Match TypeScript: new particles are NOT updated, so they can move this frame
    pub fn set_particle(&mut self, x: u32, y: u32, element: ElementId, color: u32, life: u16, temp: f32) {
        let idx = self.index(x, y);
        self.types[idx] = element;
        self.colors[idx] = color;
        self.life[idx] = life;
        self.updated[idx] = 0;  // NOT updated - can move this frame!
        self.temperature[idx] = temp;
        // Phase 2: New particles start with zero velocity
        self.vx[idx] = 0.0;
        self.vy[idx] = 0.0;

        // Sparse bookkeeping
        self.mark_cell_non_empty(x, y);
    }
    
    // === Clear single cell ===
    pub fn clear_cell(&mut self, x: u32, y: u32) {
        let idx = self.index(x, y);
        self.types[idx] = EL_EMPTY;
        self.colors[idx] = BG_COLOR;
        self.life[idx] = 0;
        self.temperature[idx] = 20.0;
        // Phase 2: Clear velocity
        self.vx[idx] = 0.0;
        self.vy[idx] = 0.0;

        self.mark_cell_empty(x, y);
    }
    
    // === Clear entire grid ===
    pub fn clear(&mut self) {
        self.types.fill(EL_EMPTY);
        self.colors.fill(BG_COLOR);
        self.life.fill(0);
        self.updated.fill(0);
        self.temperature.fill(20.0);
        // Phase 2: Clear velocity
        self.vx.fill(0.0);
        self.vy.fill(0.0);

        // Reset sparse bookkeeping
        self.non_empty_chunks.fill(0);
        self.row_has_data.fill(false);
    }
    
    // === Get raw pointers for JS interop ===
    pub fn types_ptr(&self) -> *const ElementId {
        self.types.as_ptr()
    }
    
    pub fn colors_ptr(&self) -> *const u32 {
        self.colors.as_ptr()
    }
    
    pub fn temperature_ptr(&self) -> *const f32 {
        self.temperature.as_ptr()
    }
    
    // === PHASE 1: UNSAFE ACCESS (ZERO OVERHEAD) ===
    // These methods skip bounds checks for maximum performance.
    // ONLY use when coordinates are mathematically guaranteed valid!
    
    /// Get index without bounds check
    #[inline(always)]
    pub fn index_unchecked(&self, x: u32, y: u32) -> usize {
        debug_assert!(
            x < self.width && y < self.height,
            "index_unchecked: out of bounds ({}, {}) for {}x{} grid",
            x,
            y,
            self.width,
            self.height
        );
        (y * self.width + x) as usize
    }
    
    /// Fast type read - UNSAFE: caller must ensure x,y are valid
    #[inline(always)]
    pub unsafe fn get_type_unchecked(&self, x: u32, y: u32) -> ElementId {
        let idx = self.index_unchecked(x, y);
        *self.types.get_unchecked(idx)
    }
    
    /// Fast updated check - UNSAFE: caller must ensure idx is valid  
    #[inline(always)]
    pub unsafe fn is_updated_unchecked(&self, idx: usize) -> bool {
        *self.updated.get_unchecked(idx) == 1
    }
    
    /// Fast set updated - UNSAFE: caller must ensure idx is valid
    #[inline(always)]
    pub unsafe fn set_updated_unchecked(&mut self, idx: usize, u: bool) {
        *self.updated.get_unchecked_mut(idx) = if u { 1 } else { 0 };
    }
    
    /// Fast life read - UNSAFE: caller must ensure idx is valid
    #[inline(always)]
    pub unsafe fn get_life_unchecked(&self, idx: usize) -> u16 {
        *self.life.get_unchecked(idx)
    }
    
    /// Fast life write - UNSAFE: caller must ensure idx is valid
    #[inline(always)]
    pub unsafe fn set_life_unchecked(&mut self, idx: usize, l: u16) {
        *self.life.get_unchecked_mut(idx) = l;
    }
    
    /// Fast particle write - UNSAFE: caller must ensure x,y are valid
    #[inline(always)]
    pub unsafe fn set_particle_unchecked(&mut self, x: u32, y: u32, element: ElementId, color: u32, life: u16, temp: f32) {
        let idx = self.index_unchecked(x, y);
        *self.types.get_unchecked_mut(idx) = element;
        *self.colors.get_unchecked_mut(idx) = color;
        *self.life.get_unchecked_mut(idx) = life;
        *self.updated.get_unchecked_mut(idx) = 0;
        *self.temperature.get_unchecked_mut(idx) = temp;
    }
    
    /// Fast swap using raw pointers - UNSAFE: caller must ensure both coords are valid
    /// This is the hottest path in the simulation!
    /// 
    /// PHASE 4 OPTIMIZATION: Only record moves that cross chunk boundaries!
    /// Before: Every swap was recorded → millions of writes per second
    /// After: Only cross-chunk swaps → 10-100x fewer writes
    #[inline(always)]
    pub unsafe fn swap_unchecked(&mut self, x1: u32, y1: u32, x2: u32, y2: u32) {
        let idx1 = self.index_unchecked(x1, y1);
        let idx2 = self.index_unchecked(x2, y2);

        debug_assert!(
            idx1 < self.size && idx2 < self.size,
            "swap_unchecked: computed idx out of bounds (idx1={}, idx2={}, size={})",
            idx1,
            idx2,
            self.size
        );
        
        // === PHASE 4: SMART MOVE RECORDING ===
        // Only record moves that cross chunk boundaries, based on pre-swap occupancy.
        let t1 = *self.types.get_unchecked(idx1);
        let t2 = *self.types.get_unchecked(idx2);
        self.record_cross_chunk_swap_moves(x1, y1, t1, x2, y2, t2);
        
        // Raw pointer swap - no bounds checks!
        let ptr_types = self.types.as_mut_ptr();
        let ptr_colors = self.colors.as_mut_ptr();
        let ptr_life = self.life.as_mut_ptr();
        let ptr_updated = self.updated.as_mut_ptr();
        let ptr_temp = self.temperature.as_mut_ptr();
        let ptr_vx = self.vx.as_mut_ptr();
        let ptr_vy = self.vy.as_mut_ptr();
        
        std::ptr::swap(ptr_types.add(idx1), ptr_types.add(idx2));
        std::ptr::swap(ptr_colors.add(idx1), ptr_colors.add(idx2));
        std::ptr::swap(ptr_life.add(idx1), ptr_life.add(idx2));
        std::ptr::swap(ptr_updated.add(idx1), ptr_updated.add(idx2));
        std::ptr::swap(ptr_temp.add(idx1), ptr_temp.add(idx2));
        // Swap velocity vectors as well so momentum moves with the particle
        std::ptr::swap(ptr_vx.add(idx1), ptr_vx.add(idx2));
        std::ptr::swap(ptr_vy.add(idx1), ptr_vy.add(idx2));
    }
    
    /// Fast clear cell - UNSAFE: caller must ensure x,y are valid
    #[inline(always)]
    pub unsafe fn clear_cell_unchecked(&mut self, x: u32, y: u32) {
        let idx = self.index_unchecked(x, y);
        *self.types.get_unchecked_mut(idx) = EL_EMPTY;
        *self.colors.get_unchecked_mut(idx) = BG_COLOR;
        *self.life.get_unchecked_mut(idx) = 0;
        *self.temperature.get_unchecked_mut(idx) = 20.0;
    }
    
    // === Lazy Hydration: Chunk temperature methods ===
    
    /// Hydrate chunk - fill air cells with virtual temperature
    /// Called when chunk wakes up from sleep
    /// PHASE 1 OPT: Uses SIMD for contiguous empty cell runs
    pub fn hydrate_chunk(&mut self, cx: u32, cy: u32, temp: f32) {
        let start_x = cx * CHUNK_SIZE;
        let start_y = cy * CHUNK_SIZE;
        let end_x = (start_x + CHUNK_SIZE).min(self.width);
        let end_y = (start_y + CHUNK_SIZE).min(self.height);
        
        // Use raw pointers for speed (chunk bounds are guaranteed valid)
        let types_ptr = self.types.as_ptr();
        let temps_ptr = self.temperature.as_mut_ptr();
        let width = self.width as usize;
        
        unsafe {
            for y in start_y..end_y {
                let row_offset = (y as usize) * width;
                let mut x = start_x;
                
                while x < end_x {
                    let idx = row_offset + (x as usize);
                    
                    // Skip non-empty cells
                    if *types_ptr.add(idx) != EL_EMPTY {
                        x += 1;
                        continue;
                    }
                    
                    // Found empty cell - count consecutive empties
                    let run_start = x;
                    while x < end_x && *types_ptr.add(row_offset + (x as usize)) == EL_EMPTY {
                        x += 1;
                    }
                    let run_len = (x - run_start) as usize;
                    
                    // PHASE 1 OPT: Use SIMD for runs of 4+ cells
                    #[cfg(target_arch = "wasm32")]
                    {
                        use std::arch::wasm32::*;
                        
                        let run_ptr = temps_ptr.add(row_offset + (run_start as usize));
                        let mut i = 0usize;
                        
                        // Process 4 cells at a time with SIMD
                        let v_temp = f32x4_splat(temp);
                        while i + 4 <= run_len {
                            v128_store(run_ptr.add(i) as *mut v128, v_temp);
                            i += 4;
                        }
                        
                        // Scalar remainder
                        while i < run_len {
                            *run_ptr.add(i) = temp;
                            i += 1;
                        }
                    }
                    
                    #[cfg(not(target_arch = "wasm32"))]
                    {
                        // Scalar fallback for non-WASM
                        let run_ptr = temps_ptr.add(row_offset + (run_start as usize));
                        for i in 0..run_len {
                            *run_ptr.add(i) = temp;
                        }
                    }
                }
            }
        }
    }
    
    /// Get average air temperature in chunk (for sync when going to sleep)
    /// PHASE 1 OPT: Uses SIMD horizontal sum for accumulation
    pub fn get_average_air_temp(&self, cx: u32, cy: u32) -> f32 {
        let start_x = cx * CHUNK_SIZE;
        let start_y = cy * CHUNK_SIZE;
        let end_x = (start_x + CHUNK_SIZE).min(self.width);
        let end_y = (start_y + CHUNK_SIZE).min(self.height);
        
        let types_ptr = self.types.as_ptr();
        let temps_ptr = self.temperature.as_ptr();
        let width = self.width as usize;
        
        let mut sum = 0.0f32;
        let mut count = 0u32;
        
        unsafe {
            for y in start_y..end_y {
                let row_offset = (y as usize) * width;
                for x in start_x..end_x {
                    let idx = row_offset + (x as usize);
                    if *types_ptr.add(idx) == EL_EMPTY {
                        sum += *temps_ptr.add(idx);
                        count += 1;
                    }
                }
            }
        }
        
        if count > 0 {
            sum / (count as f32)
        } else {
            // No air in chunk (fully occupied) - return room temp
            20.0
        }
    }
    
    // === PHASE 1: SIMD-optimized batch operations ===
    
    /// Batch lerp air temperatures towards target (for active chunks)
    /// Processes contiguous empty cell runs with SIMD
    /// Returns number of cells processed
    #[cfg(target_arch = "wasm32")]
    pub unsafe fn batch_lerp_air_temps(&mut self, cx: u32, cy: u32, target_temp: f32, lerp_speed: f32) -> u32 {
        use std::arch::wasm32::*;
        
        let start_x = cx * CHUNK_SIZE;
        let start_y = cy * CHUNK_SIZE;
        let end_x = (start_x + CHUNK_SIZE).min(self.width);
        let end_y = (start_y + CHUNK_SIZE).min(self.height);
        
        let types_ptr = self.types.as_ptr();
        let temps_ptr = self.temperature.as_mut_ptr();
        let width = self.width as usize;
        
        // SIMD constants
        let v_target = f32x4_splat(target_temp);
        let v_lerp = f32x4_splat(lerp_speed);
        let v_one_minus_lerp = f32x4_splat(1.0 - lerp_speed);
        
        let mut processed = 0u32;
        
        for y in start_y..end_y {
            let row_offset = (y as usize) * width;
            let mut x = start_x;
            
            while x < end_x {
                let idx = row_offset + (x as usize);
                
                // Skip non-empty cells
                if *types_ptr.add(idx) != EL_EMPTY {
                    x += 1;
                    continue;
                }
                
                // Count consecutive empty cells
                let run_start = x;
                while x < end_x && *types_ptr.add(row_offset + (x as usize)) == EL_EMPTY {
                    x += 1;
                }
                let run_len = (x - run_start) as usize;
                processed += run_len as u32;
                
                // Process with SIMD
                let run_ptr = temps_ptr.add(row_offset + (run_start as usize));
                let mut i = 0usize;
                
                // SIMD: 4 cells at a time
                // new_temp = current * (1 - lerp) + target * lerp
                while i + 4 <= run_len {
                    let ptr = run_ptr.add(i);
                    let v_current = v128_load(ptr as *const v128);
                    let v_new = f32x4_add(
                        f32x4_mul(v_current, v_one_minus_lerp),
                        f32x4_mul(v_target, v_lerp)
                    );
                    v128_store(ptr as *mut v128, v_new);
                    i += 4;
                }
                
                // Scalar remainder
                while i < run_len {
                    let ptr = run_ptr.add(i);
                    let current = *ptr;
                    *ptr = current + (target_temp - current) * lerp_speed;
                    i += 1;
                }
            }
        }
        
        processed
    }
    
    /// Non-WASM fallback for batch_lerp_air_temps
    #[cfg(not(target_arch = "wasm32"))]
    pub unsafe fn batch_lerp_air_temps(&mut self, cx: u32, cy: u32, target_temp: f32, lerp_speed: f32) -> u32 {
        let start_x = cx * CHUNK_SIZE;
        let start_y = cy * CHUNK_SIZE;
        let end_x = (start_x + CHUNK_SIZE).min(self.width);
        let end_y = (start_y + CHUNK_SIZE).min(self.height);
        
        let types_ptr = self.types.as_ptr();
        let temps_ptr = self.temperature.as_mut_ptr();
        let width = self.width as usize;
        
        let mut processed = 0u32;
        
        for y in start_y..end_y {
            let row_offset = (y as usize) * width;
            for x in start_x..end_x {
                let idx = row_offset + (x as usize);
                if *types_ptr.add(idx) == EL_EMPTY {
                    let ptr = temps_ptr.add(idx);
                    let current = *ptr;
                    *ptr = current + (target_temp - current) * lerp_speed;
                    processed += 1;
                }
            }
        }
        
        processed
    }
}
