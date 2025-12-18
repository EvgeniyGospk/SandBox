//! Grid - Structure of Arrays (SoA) for cache-friendly particle storage
//! 
//! Phase 5: ABGR color format for direct Canvas copy
//! Phase 5.1: Parallel processing with Rayon
//! 
//! Instead of: Vec<Option<Particle>>  // Bad: many allocations, poor cache
//! We have:    types[], colors[], temps[]  // Good: linear memory, SIMD-friendly

use crate::elements::{ElementId, EL_EMPTY};

// Background color in ABGR format (little-endian: 0xAABBGGRR -> bytes [RR,GG,BB,AA])
// RGB(10,10,10) with alpha=255 -> 0xFF0A0A0A in ABGR
pub(crate) const BG_COLOR: u32 = 0xFF0A0A0A; // Same value since R=G=B

mod indexing;
mod accessors;
mod moves;

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
            // Phase 2: Velocity arrays (start at 0)
            vx: vec![0.0; size],
            vy: vec![0.0; size],
        }
    }
}
