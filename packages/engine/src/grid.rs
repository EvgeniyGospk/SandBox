//! Grid - Structure of Arrays (SoA) for cache-friendly particle storage
//! 
//! Phase 4: Added move tracking for chunk optimization
//! 
//! Instead of: Vec<Option<Particle>>  // Bad: many allocations, poor cache
//! We have:    types[], colors[], temps[]  // Good: linear memory, SIMD-friendly

use crate::elements::{ElementId, EL_EMPTY};

const BG_COLOR: u32 = 0xFF0A0A0A;

/// Recorded particle movement (from_x, from_y, to_x, to_y)
pub type ParticleMove = (u32, u32, u32, u32);

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
    
    // Phase 4: Track moves for chunk system
    pending_moves: Vec<ParticleMove>,
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
            pending_moves: Vec::with_capacity(256), // Pre-allocate for typical frame
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
    
    // === Phase 4: Move tracking for chunks ===
    
    /// Get pending moves and clear the list
    pub fn drain_moves(&mut self) -> std::vec::Drain<'_, ParticleMove> {
        self.pending_moves.drain(..)
    }
    
    /// Clear pending moves (call at frame start)
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
}
