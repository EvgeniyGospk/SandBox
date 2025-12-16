//! Physics System - Phase 2: Newtonian Particle Physics
//! 
//! Implements velocity-based movement with DDA raycasting for collision detection.
//! 
//! Key concepts:
//! - Particles have velocity (vx, vy) that persists across frames
//! - Gravity accelerates particles downward each frame
//! - Friction decays velocity based on material properties
//! - DDA raycast detects collisions along the velocity vector
//! - Bounce factor determines energy retained after collision

mod perf;
mod types;
mod forces;
mod raycast;
mod collision;
mod update;

pub use perf::{reset_physics_perf_counters, take_physics_perf_counters};
pub use types::PhysicsResult;
pub use forces::{apply_friction, apply_gravity};
pub use raycast::raycast_move;
pub use collision::handle_collision;
pub use update::update_particle_physics;
