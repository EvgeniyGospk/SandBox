use crate::elements::{get_color_with_variation, get_props, EL_EMPTY, ELEMENT_COUNT};

use super::WorldCore;

pub(super) fn add_particle(world: &mut WorldCore, x: u32, y: u32, element: u8) -> bool {
    if x >= world.grid.width() || y >= world.grid.height() {
        return false;
    }

    // Validate element ID
    if (element as usize) >= ELEMENT_COUNT || element == EL_EMPTY {
        return false;
    }

    if !world.grid.is_empty(x as i32, y as i32) {
        return false;
    }

    let seed = ((x * 7 + y * 13 + world.frame as u32) & 31) as u8;
    let props = get_props(element);

    world.grid.set_particle(
        x,
        y,
        element,
        get_color_with_variation(element, seed),
        props.lifetime,
        props.default_temp,
    );

    // Phase 4: Track particle in chunk
    world.chunks.add_particle(x, y);

    world.particle_count += 1;
    true
}

pub(super) fn add_particles_in_radius(world: &mut WorldCore, cx: i32, cy: i32, radius: i32, element: u8) {
    let r2 = radius * radius;
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            if dx * dx + dy * dy <= r2 {
                let x = cx + dx;
                let y = cy + dy;
                if x >= 0 && y >= 0 {
                    add_particle(world, x as u32, y as u32, element);
                }
            }
        }
    }
}

pub(super) fn remove_particle(world: &mut WorldCore, x: u32, y: u32) -> bool {
    if x >= world.grid.width() || y >= world.grid.height() {
        return false;
    }

    if world.grid.is_empty(x as i32, y as i32) {
        return false;
    }

    // Phase 4: Track removal in chunk
    world.chunks.remove_particle(x, y);
    world.chunks.mark_dirty(x, y); // Ensure render updates even without movement

    world.grid.clear_cell(x, y);
    if world.particle_count > 0 {
        world.particle_count -= 1;
    }
    true
}

pub(super) fn remove_particles_in_radius(world: &mut WorldCore, cx: i32, cy: i32, radius: i32) {
    let r2 = radius * radius;
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            if dx * dx + dy * dy <= r2 {
                let x = cx + dx;
                let y = cy + dy;
                if x >= 0 && y >= 0 {
                    remove_particle(world, x as u32, y as u32);
                }
            }
        }
    }
}

pub(super) fn clear(world: &mut WorldCore) {
    world.grid.clear();
    world.chunks.reset();
    world.rigid_bodies = super::RigidBodySystem::new();
    world.particle_count = 0;
    world.frame = 0;
}
