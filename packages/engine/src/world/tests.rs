use super::*;
use crate::chunks::DirtyRect;
use crate::elements::{EL_CLONE, EL_EMPTY, EL_SAND, EL_STONE, EL_VOID};

#[test]
fn extract_rect_pixels_clamps_and_is_tightly_packed() {
    let mut world = WorldCore::new(100, 100);

    for (i, c) in world.grid.colors.iter_mut().enumerate() {
        *c = i as u32;
    }

    // Rect starting at x=64 with width=64 (clamps to x..100 => 36px wide)
    world.merged_rects.clear();
    world.merged_rects.push(DirtyRect {
        cx: 2,
        cy: 0,
        cw: 2,
        ch: 1,
    });

    world.extract_rect_pixels(0);

    let actual_w = 100 - (2 * CHUNK_SIZE);
    let actual_h = CHUNK_SIZE;
    let expected_len = (actual_w as usize) * (actual_h as usize);
    assert!(world.rect_transfer_buffer.len() >= expected_len);

    let buf = &world.rect_transfer_buffer[..expected_len];

    // First row should be grid[0, 64..99]
    assert_eq!(buf[0], 64);
    assert_eq!(buf[(actual_w as usize) - 1], 99);
    // Second row should start immediately after `actual_w` (tightly packed)
    assert_eq!(buf[actual_w as usize], 100 + 64);
}

#[test]
fn extract_rect_pixels_resizes_for_large_rects() {
    let size = (CHUNK_SIZE * 5) as u32; // 160px
    let mut world = WorldCore::new(size, size);

    world.merged_rects.clear();
    world.merged_rects.push(DirtyRect {
        cx: 0,
        cy: 0,
        cw: 5,
        ch: 5,
    });

    world.extract_rect_pixels(0);

    let expected = (size as usize) * (size as usize);
    assert!(world.rect_transfer_buffer.len() >= expected);
}

#[test]
fn utility_clone_spawns_and_updates_counts() {
    let mut world = WorldCore::new(64, 64);

    // Donor above clone (Up is checked first).
    assert!(world.add_particle(10, 9, EL_STONE));
    assert!(world.add_particle(10, 10, EL_CLONE));
    assert_eq!(world.particle_count(), 2);

    world.step();

    // Frame=0 clone starts checking from Up then Down; Down should be empty and get cloned.
    assert_eq!(world.grid.get_type(10, 11), EL_STONE);
    assert_eq!(world.particle_count(), 3);
}

#[test]
fn utility_void_destroys_and_updates_counts() {
    let mut world = WorldCore::new(64, 64);

    assert!(world.add_particle(10, 9, EL_STONE));
    assert!(world.add_particle(10, 10, EL_VOID));
    assert_eq!(world.particle_count(), 2);

    world.step();

    assert_eq!(world.grid.get_type(10, 9), EL_EMPTY);
    assert_eq!(world.particle_count(), 1);
}

#[test]
fn gravity_x_pushes_particles_horizontally() {
    let mut world = WorldCore::new(64, 64);
    world.set_gravity(10.0, 0.0);

    assert!(world.add_particle(30, 30, EL_SAND));
    world.step();

    // With gravity_x=10, sand should move right on the first step.
    assert_eq!(world.grid.get_type(30, 30), EL_EMPTY);
    let mut found = None;
    for yy in 0..64 {
        for xx in 0..64 {
            if world.grid.get_type(xx, yy) == EL_SAND {
                found = Some((xx, yy));
                break;
            }
        }
        if found.is_some() {
            break;
        }
    }
    let (nx, ny) = found.expect("sand should still exist");
    assert_eq!(ny, 30);
    assert!(nx > 30);
}

#[test]
fn spawn_rigid_body_rasterizes_and_counts_pixels() {
    let mut world = WorldCore::new(64, 64);

    let id = world.spawn_rigid_body(20.0, 20.0, 10, 10, EL_STONE);
    assert_ne!(id, 0);
    assert_eq!(world.rigid_body_count(), 1);

    // 10x10 input becomes (2*(10/2)+1)^2 = 11*11 pixels.
    assert_eq!(world.particle_count(), 121);
    assert_eq!(world.grid.get_type(20, 20), EL_STONE);
}

#[test]
fn cross_chunk_swap_of_two_particles_keeps_chunk_counts() {
    let mut world = WorldCore::new(64, 64);

    let y = 10;
    let left_x = CHUNK_SIZE - 1;
    let right_x = CHUNK_SIZE;

    assert!(world.add_particle(left_x, y, EL_STONE));
    assert!(world.add_particle(right_x, y, EL_SAND));

    let left_chunk = world.chunks.chunk_index(left_x, y);
    let right_chunk = world.chunks.chunk_index(right_x, y);
    assert_ne!(left_chunk, right_chunk);
    assert_eq!(world.chunks.particle_counts()[left_chunk], 1);
    assert_eq!(world.chunks.particle_counts()[right_chunk], 1);

    world.grid.clear_moves();
    unsafe { world.grid.swap_unchecked(left_x, y, right_x, y) };
    assert_eq!(world.grid.pending_moves.count, 2);

    world.apply_pending_moves();
    assert_eq!(world.chunks.particle_counts()[left_chunk], 1);
    assert_eq!(world.chunks.particle_counts()[right_chunk], 1);
}
