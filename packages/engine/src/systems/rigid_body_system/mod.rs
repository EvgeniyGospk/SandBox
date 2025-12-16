//! RigidBodySystem - Minimal kinematic rigid bodies for WASM sandbox
//!
//! This is intentionally simple (no SAT / no impulse solver yet).
//! Goals:
//! - Make SPAWN_RIGID_BODY functional (no more no-op / silent success).
//! - Keep bodies stable and deterministic.
//! - Avoid corrupting the particle grid.
//!
//! Current behavior:
//! - Bodies are rasterized into the particle grid as SOLID pixels.
//! - Simple per-axis collision against world occupancy.
//! - No rotation physics yet (angle/ang_vel kept, but not integrated).

mod collision;
mod rasterize;
mod system;

pub use system::{RigidBodySystem, SpawnResult};
