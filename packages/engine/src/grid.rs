//! Grid - Structure of Arrays (SoA) for cache-friendly particle storage
//! 
//! Phase 5: ABGR color format for direct Canvas copy
//! 
//! Instead of: Vec<Option<Particle>>  // Bad: many allocations, poor cache
//! We have:    types[], colors[], temps[]  // Good: linear memory, SIMD-friendly

use crate::elements::{ElementId, EL_EMPTY};
use crate::chunks::CHUNK_SIZE;

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
}

impl MoveBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            data: vec![(0, 0, 0, 0); capacity], // Single allocation at startup
            count: 0,
            capacity,
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
        }
        // If full, silently drop. Better than GC stutter!
    }
    
    /// Reset counter - memory stays allocated
    #[inline(always)]
    pub fn clear(&mut self) {
        self.count = 0;
    }
    
    /// Get raw pointer to data for unsafe iteration
    #[inline(always)]
    pub fn as_ptr(&self) -> *const ParticleMove {
        self.data.as_ptr()
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
    
    // Phase 4: Zero-allocation move buffer
    pub pending_moves: MoveBuffer,
}

impl Grid {
    pub fn new(width: u32, height: u32) -> Self {
        let size = (width * height) as usize;
        
        Self {
            width,
            height,
            size,
            types: vec![EL_EMPTY; size],
            colors: vec![BG_COLOR; size],
            life: vec![0; size],
            updated: vec![0; size],
            temperature: vec![20.0; size],
            // Phase 4: Fixed buffer for ~100k moves (~1.6MB RAM)
            // Enough for nuclear explosions, never reallocates!
            pending_moves: MoveBuffer::new(100_000),
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
    
    #[inline]
    pub fn reset_updated(&mut self) {
        self.updated.fill(0);
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
    
    // === Swap two cells (all data) ===
    // Phase 4: Records the move for chunk tracking
    pub fn swap(&mut self, x1: u32, y1: u32, x2: u32, y2: u32) {
        let idx1 = self.index(x1, y1);
        let idx2 = self.index(x2, y2);
        
        // Record move if there's a particle moving (idx1 has particle, going to idx2)
        // This tracks where particles go for chunk system
        if self.types[idx1] != EL_EMPTY {
            self.pending_moves.push((x1, y1, x2, y2));
        }
        
        self.swap_idx(idx1, idx2);
    }
    
    #[inline]
    pub fn swap_idx(&mut self, idx1: usize, idx2: usize) {
        self.types.swap(idx1, idx2);
        self.colors.swap(idx1, idx2);
        self.life.swap(idx1, idx2);
        self.updated.swap(idx1, idx2);
        self.temperature.swap(idx1, idx2);
    }
    
    // === Phase 4: Move tracking for chunks (Zero-Allocation) ===
    
    /// Clear pending moves (call at frame start)
    /// Memory stays allocated - just resets counter
    pub fn clear_moves(&mut self) {
        self.pending_moves.clear();
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
    }
    
    // === Clear single cell ===
    pub fn clear_cell(&mut self, x: u32, y: u32) {
        let idx = self.index(x, y);
        self.types[idx] = EL_EMPTY;
        self.colors[idx] = BG_COLOR;
        self.life[idx] = 0;
        self.temperature[idx] = 20.0;
    }
    
    // === Clear entire grid ===
    pub fn clear(&mut self) {
        self.types.fill(EL_EMPTY);
        self.colors.fill(BG_COLOR);
        self.life.fill(0);
        self.updated.fill(0);
        self.temperature.fill(20.0);
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
    #[inline(always)]
    pub unsafe fn swap_unchecked(&mut self, x1: u32, y1: u32, x2: u32, y2: u32) {
        let idx1 = self.index_unchecked(x1, y1);
        let idx2 = self.index_unchecked(x2, y2);
        
        // Record move for chunk tracking (only if particle is moving)
        if *self.types.get_unchecked(idx1) != EL_EMPTY {
            self.pending_moves.push((x1, y1, x2, y2));
        }
        
        // Raw pointer swap - no bounds checks!
        let ptr_types = self.types.as_mut_ptr();
        let ptr_colors = self.colors.as_mut_ptr();
        let ptr_life = self.life.as_mut_ptr();
        let ptr_updated = self.updated.as_mut_ptr();
        let ptr_temp = self.temperature.as_mut_ptr();
        
        std::ptr::swap(ptr_types.add(idx1), ptr_types.add(idx2));
        std::ptr::swap(ptr_colors.add(idx1), ptr_colors.add(idx2));
        std::ptr::swap(ptr_life.add(idx1), ptr_life.add(idx2));
        std::ptr::swap(ptr_updated.add(idx1), ptr_updated.add(idx2));
        std::ptr::swap(ptr_temp.add(idx1), ptr_temp.add(idx2));
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
                for x in start_x..end_x {
                    let idx = row_offset + (x as usize);
                    // Only update temperature if cell is empty (air)
                    // Particles keep their own temperature!
                    if *types_ptr.add(idx) == EL_EMPTY {
                        *temps_ptr.add(idx) = temp;
                    }
                }
            }
        }
    }
    
    /// Get average air temperature in chunk (for sync when going to sleep)
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
}
