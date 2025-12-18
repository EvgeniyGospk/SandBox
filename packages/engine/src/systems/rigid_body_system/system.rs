use crate::chunks::ChunkGrid;
use crate::domain::content::ContentRegistry;
use crate::elements::{GRAVITY, CAT_SOLID};
use crate::grid::Grid;
use crate::rigid_body::{RigidBody, Vec2};

use super::collision::collides_at;
use super::rasterize::{clear_body, rasterize_body};

/// Manages all rigid bodies in the simulation
pub struct RigidBodySystem {
    bodies: Vec<RigidBody>,
    next_id: u32,
}

pub struct SpawnResult {
    pub id: u32,
    pub pixels: u32,
}

impl RigidBodySystem {
    pub fn new() -> Self {
        Self {
            bodies: Vec::new(),
            next_id: 1,
        }
    }

    /// Add a new rigid body.
    ///
    /// Returns `None` if the body cannot be placed.
    pub fn add_body(
        &mut self,
        content: &ContentRegistry,
        mut body: RigidBody,
        grid: &mut Grid,
        chunks: &mut ChunkGrid,
    ) -> Option<SpawnResult> {
        // Enforce SOLID pixels for now to prevent the particle solver from trying to move the body.
        if body.pixels.is_empty() {
            return None;
        }

        let Some(p0) = content.props(body.pixels[0].element) else {
            return None;
        };
        if p0.category != CAT_SOLID {
            return None;
        }

        let id = self.next_id;
        self.next_id = self.next_id.saturating_add(1);
        body.id = id;
        body.active = true;

        // Place only if all target cells are empty and in-bounds.
        if collides_at(&body, grid, body.pos) {
            return None;
        }

        rasterize_body(content, &mut body, grid, chunks);
        let pixels = body.prev_world_coords.len() as u32;
        self.bodies.push(body);
        Some(SpawnResult { id, pixels })
    }

    /// Remove a rigid body by ID.
    pub fn remove_body(&mut self, id: u32, grid: &mut Grid, chunks: &mut ChunkGrid) -> u32 {
        if let Some(idx) = self.bodies.iter().position(|b| b.id == id) {
            let mut body = self.bodies.swap_remove(idx);
            let removed = body.prev_world_coords.len() as u32;
            clear_body(&mut body, grid, chunks);
            return removed;
        }
        0
    }

    /// Remove all bodies (used by World::clear()).
    pub fn clear(&mut self, grid: &mut Grid, chunks: &mut ChunkGrid) {
        for body in self.bodies.iter_mut() {
            clear_body(body, grid, chunks);
        }
        self.bodies.clear();
        self.next_id = 1;
    }

    pub fn body_count(&self) -> usize {
        self.bodies.len()
    }

    /// Main update loop (runs before particle physics).
    pub fn update(
        &mut self,
        content: &ContentRegistry,
        grid: &mut Grid,
        chunks: &mut ChunkGrid,
        gravity_x: f32,
        gravity_y: f32,
    ) {
        for body in self.bodies.iter_mut() {
            if !body.active {
                continue;
            }

            // Remove current rasterization so collision tests don't self-intersect.
            clear_body(body, grid, chunks);

            // Integrate velocity (very simple).
            body.velocity.x += gravity_x * GRAVITY;
            body.velocity.y += gravity_y * GRAVITY;

            // Clamp to keep cost bounded and avoid tunneling.
            body.velocity.x = body.velocity.x.clamp(-10.0, 10.0);
            body.velocity.y = body.velocity.y.clamp(-10.0, 10.0);

            let desired = Vec2::new(body.pos.x + body.velocity.x, body.pos.y + body.velocity.y);

            // Resolve per-axis (cheap + deterministic).
            let mut next = body.pos;

            let try_x = Vec2::new(desired.x, next.y);
            if collides_at(body, grid, try_x) {
                body.velocity.x = -body.velocity.x * body.restitution;
            } else {
                next.x = try_x.x;
            }

            let try_y = Vec2::new(next.x, desired.y);
            if collides_at(body, grid, try_y) {
                body.velocity.y = -body.velocity.y * body.restitution;
            } else {
                next.y = try_y.y;
            }

            body.pos = next;

            // Rasterize back into the particle grid.
            rasterize_body(content, body, grid, chunks);
        }
    }
}

impl Default for RigidBodySystem {
    fn default() -> Self {
        Self::new()
    }
}
