//! RigidBody - A solid body that moves as a unit
//!
//! Phase: Hybrid Physics System
//! 
//! The body stores its shape in local coordinates (relative to center 0,0)
//! and transforms them to world coordinates using position and rotation.

mod vec2;
mod body;

pub use vec2::{BodyPixel, Vec2};
pub use body::RigidBody;
