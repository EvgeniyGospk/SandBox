//! RigidBodySystem - STUB (Rigid Bodies disabled for refactor)
//!
//! TODO: Rebuild from scratch with proper physics
//! - SAT collision detection
//! - Impulse-based resolution
//! - Proper rotation physics

use crate::grid::Grid;
use crate::rigid_body::RigidBody;
use crate::chunks::ChunkGrid;

/// Manages all rigid bodies in the simulation
/// STUB: Currently disabled - all methods are no-ops
pub struct RigidBodySystem {
    next_id: u32,
}

impl RigidBodySystem {
    pub fn new() -> Self {
        Self {
            next_id: 1,
        }
    }
    
    /// Add a new rigid body
    /// STUB: Returns 0 (failure) - rigid bodies disabled
    pub fn add_body(&mut self, _body: RigidBody, _grid: &mut Grid, _chunks: &mut ChunkGrid) -> u32 {
        // TODO: Implement proper spawn logic
        0
    }
    
    /// Remove a rigid body by ID
    /// STUB: No-op
    pub fn remove_body(&mut self, _id: u32) {
        // TODO: Implement
    }
    
    /// Get body count
    /// STUB: Always returns 0
    pub fn body_count(&self) -> usize {
        0
    }
    
    /// Main update loop
    /// STUB: No-op - physics disabled
    pub fn update(&mut self, _grid: &mut Grid, _chunks: &mut ChunkGrid, _gravity_y: f32) {
        // TODO: Implement proper physics step
    }
}

impl Default for RigidBodySystem {
    fn default() -> Self {
        Self::new()
    }
}
