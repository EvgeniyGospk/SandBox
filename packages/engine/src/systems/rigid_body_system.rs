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

use crate::chunks::ChunkGrid;
use crate::elements::{get_color_with_variation, EL_EMPTY, ELEMENT_DATA, GRAVITY, CAT_SOLID};
use crate::grid::Grid;
use crate::rigid_body::{RigidBody, Vec2};

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
    pub fn add_body(&mut self, mut body: RigidBody, grid: &mut Grid, chunks: &mut ChunkGrid) -> Option<SpawnResult> {
        // Enforce SOLID pixels for now to prevent the particle solver from trying to move the body.
        if body.pixels.is_empty() {
            return None;
        }
        if (body.pixels[0].element as usize) >= ELEMENT_DATA.len() {
            return None;
        }
        if ELEMENT_DATA[body.pixels[0].element as usize].category != CAT_SOLID {
            return None;
        }

        let id = self.next_id;
        self.next_id = self.next_id.saturating_add(1);
        body.id = id;
        body.active = true;

        // Place only if all target cells are empty and in-bounds.
        if Self::collides_at(&body, grid, body.pos) {
            return None;
        }

        Self::rasterize_body(&mut body, grid, chunks);
        let pixels = body.prev_world_coords.len() as u32;
        self.bodies.push(body);
        Some(SpawnResult { id, pixels })
    }

    /// Remove a rigid body by ID.
    pub fn remove_body(&mut self, id: u32, grid: &mut Grid, chunks: &mut ChunkGrid) -> u32 {
        if let Some(idx) = self.bodies.iter().position(|b| b.id == id) {
            let mut body = self.bodies.swap_remove(idx);
            let removed = body.prev_world_coords.len() as u32;
            Self::clear_body(&mut body, grid, chunks);
            return removed;
        }
        0
    }

    /// Remove all bodies (used by World::clear()).
    pub fn clear(&mut self, grid: &mut Grid, chunks: &mut ChunkGrid) {
        for body in self.bodies.iter_mut() {
            Self::clear_body(body, grid, chunks);
        }
        self.bodies.clear();
        self.next_id = 1;
    }

    pub fn body_count(&self) -> usize {
        self.bodies.len()
    }

    /// Main update loop (runs before particle physics).
    pub fn update(&mut self, grid: &mut Grid, chunks: &mut ChunkGrid, gravity_x: f32, gravity_y: f32) {
        for body in self.bodies.iter_mut() {
            if !body.active {
                continue;
            }

            // Remove current rasterization so collision tests don't self-intersect.
            Self::clear_body(body, grid, chunks);

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
            if Self::collides_at(body, grid, try_x) {
                body.velocity.x = -body.velocity.x * body.restitution;
            } else {
                next.x = try_x.x;
            }

            let try_y = Vec2::new(next.x, desired.y);
            if Self::collides_at(body, grid, try_y) {
                body.velocity.y = -body.velocity.y * body.restitution;
            } else {
                next.y = try_y.y;
            }

            body.pos = next;

            // Rasterize back into the particle grid.
            Self::rasterize_body(body, grid, chunks);
        }
    }

    fn collides_at(body: &RigidBody, grid: &Grid, pos: Vec2) -> bool {
        let (sin, cos) = body.angle.sin_cos();
        let w = grid.width() as i32;
        let h = grid.height() as i32;

        for p in body.pixels.iter() {
            let dx = p.dx as f32;
            let dy = p.dy as f32;

            // Rotate (currently angle stays at 0.0, but keep math for future).
            let rx = dx * cos - dy * sin;
            let ry = dx * sin + dy * cos;

            let wx = (pos.x + rx).round() as i32;
            let wy = (pos.y + ry).round() as i32;

            if wx < 0 || wx >= w || wy < 0 || wy >= h {
                return true;
            }

            let t = grid.get_type(wx, wy);
            if t != EL_EMPTY {
                return true;
            }
        }

        false
    }

    fn clear_body(body: &mut RigidBody, grid: &mut Grid, chunks: &mut ChunkGrid) {
        for &(x, y) in body.prev_world_coords.iter() {
            if !grid.in_bounds(x, y) {
                continue;
            }
            let ux = x as u32;
            let uy = y as u32;
            grid.clear_cell(ux, uy);
            chunks.remove_particle(ux, uy);
            chunks.mark_dirty(ux, uy);
        }
        body.prev_world_coords.clear();
    }

    fn rasterize_body(body: &mut RigidBody, grid: &mut Grid, chunks: &mut ChunkGrid) {
        body.prev_world_coords.clear();
        body.prev_world_coords.reserve(body.pixels.len());

        let (sin, cos) = body.angle.sin_cos();
        let w = grid.width() as i32;
        let h = grid.height() as i32;

        for p in body.pixels.iter() {
            let dx = p.dx as f32;
            let dy = p.dy as f32;

            let rx = dx * cos - dy * sin;
            let ry = dx * sin + dy * cos;

            let wx = (body.pos.x + rx).round() as i32;
            let wy = (body.pos.y + ry).round() as i32;

            if wx < 0 || wx >= w || wy < 0 || wy >= h {
                continue;
            }

            let x = wx as u32;
            let y = wy as u32;

            // Enforce SOLID pixels: don't overwrite existing particles.
            if !grid.is_empty(wx, wy) {
                continue;
            }

            let element = p.element;
            let props = &ELEMENT_DATA[element as usize];
            let color = get_color_with_variation(element, p.color_seed);

            grid.set_particle(x, y, element, color, props.lifetime, props.default_temp);
            chunks.add_particle(x, y);

            body.prev_world_coords.push((wx, wy));
        }
    }
}

impl Default for RigidBodySystem {
    fn default() -> Self {
        Self::new()
    }
}
