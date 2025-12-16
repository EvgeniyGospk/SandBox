use crate::elements::{get_color_with_variation, ElementId, EL_EMPTY, ELEMENT_DATA};
use crate::reactions::Reaction;

use super::WorldCore;

pub(super) fn process_reactions(world: &mut WorldCore, x: u32, y: u32, element: ElementId) {
    if world.perf_enabled {
        world.perf_stats.reactions_checked = world.perf_stats.reactions_checked.saturating_add(1);
    }

    // Pick a random neighbor
    // PHASE 1 OPT: & 3 instead of % 4 (saves ~40 CPU cycles)
    let dir = super::xorshift32(&mut world.rng_state) & 3;
    let xi = x as i32;
    let yi = y as i32;

    let (nx, ny) = match dir {
        0 => (xi, yi - 1),
        1 => (xi, yi + 1),
        2 => (xi - 1, yi),
        _ => (xi + 1, yi),
    };

    if !world.grid.in_bounds(nx, ny) {
        return;
    }

    let neighbor_type = world.grid.get_type(nx, ny);
    if neighbor_type == EL_EMPTY {
        return;
    }

    // Phase 1: O(1) reaction lookup from LUT
    if let Some(reaction) = world.reactions.get(element, neighbor_type) {
        // Roll the dice (chance is 0-255 in new system)
        let roll = (super::xorshift32(&mut world.rng_state) & 0xFF) as u8;
        if roll >= reaction.chance {
            return;
        }

        // Copy reaction to release the borrow before apply
        let r = *reaction;
        world.apply_reaction(x, y, nx as u32, ny as u32, &r);
    }
}

pub(super) fn apply_reaction(
    world: &mut WorldCore,
    src_x: u32,
    src_y: u32,
    target_x: u32,
    target_y: u32,
    reaction: &Reaction,
) {
    if world.perf_enabled {
        world.perf_stats.reactions_applied = world.perf_stats.reactions_applied.saturating_add(1);
    }

    // A. Transform the TARGET (victim)
    if reaction.target_becomes == EL_EMPTY {
        world.remove_particle(target_x, target_y);
    } else {
        world.replace_particle(target_x, target_y, reaction.target_becomes);
    }

    // B. Transform the SOURCE (aggressor) - BILATERAL!
    if reaction.source_becomes != Reaction::NO_CHANGE {
        if reaction.source_becomes == EL_EMPTY {
            world.remove_particle(src_x, src_y);
        } else {
            world.replace_particle(src_x, src_y, reaction.source_becomes);
        }
    }

    // C. Spawn byproduct (smoke, steam)
    if reaction.spawn != EL_EMPTY {
        let sxi = src_x as i32;
        let syi = src_y as i32;
        let txi = target_x as i32;
        let tyi = target_y as i32;

        // Try to spawn above the reaction site
        if world.grid.is_empty(sxi, syi - 1) {
            world.add_particle(src_x, (syi - 1) as u32, reaction.spawn);
        } else if world.grid.is_empty(txi, tyi - 1) {
            world.add_particle(target_x, (tyi - 1) as u32, reaction.spawn);
        }
    }
}

pub(super) fn replace_particle(world: &mut WorldCore, x: u32, y: u32, element: ElementId) {
    let seed = ((x * 7 + y * 13 + world.frame as u32) & 31) as u8;
    let props = &ELEMENT_DATA[element as usize];

    // Save current temperature BEFORE replacing
    let current_temp = world.grid.get_temp(x as i32, y as i32);

    world.grid.set_particle(
        x,
        y,
        element,
        get_color_with_variation(element, seed),
        props.lifetime,
        current_temp,
    );

    // Mark as updated
    world.grid.set_updated(x, y, true);

    // CRITICAL: Mark chunk as dirty for rendering!
    // Without this, reactions don't trigger re-render!
    world.chunks.mark_dirty(x, y);
}
