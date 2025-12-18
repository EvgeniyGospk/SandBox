use crate::rigid_body::RigidBody;

use super::WorldCore;

pub(super) fn spawn_rigid_body(world: &mut WorldCore, x: f32, y: f32, w: i32, h: i32, element_id: u8) -> u32 {
    let body = RigidBody::new_rect(x, y, w, h, element_id, 0);
    match world
        .rigid_bodies
        .add_body(&world.content, body, &mut world.grid)
    {
        Some(res) => {
            world.particle_count = world.particle_count.saturating_add(res.pixels);
            res.id
        }
        None => 0,
    }
}

pub(super) fn spawn_rigid_circle(world: &mut WorldCore, x: f32, y: f32, radius: i32, element_id: u8) -> u32 {
    let body = RigidBody::new_circle(x, y, radius, element_id, 0);
    match world
        .rigid_bodies
        .add_body(&world.content, body, &mut world.grid)
    {
        Some(res) => {
            world.particle_count = world.particle_count.saturating_add(res.pixels);
            res.id
        }
        None => 0,
    }
}

pub(super) fn remove_rigid_body(world: &mut WorldCore, id: u32) {
    let removed = world.rigid_bodies.remove_body(id, &mut world.grid);
    world.particle_count = world.particle_count.saturating_sub(removed);
}

pub(super) fn rigid_body_count(world: &WorldCore) -> usize {
    world.rigid_bodies.body_count()
}
