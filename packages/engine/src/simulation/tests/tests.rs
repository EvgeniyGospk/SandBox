use super::*;
use crate::chunks::DirtyRect;
use crate::elements::{
    BehaviorKind,
    EL_CLONE,
    EL_EMPTY,
    EL_FIRE,
    EL_ICE,
    EL_LAVA,
    EL_SAND,
    EL_STEAM,
    EL_STONE,
    EL_VOID,
    EL_WATER,
};
use crate::grid::BG_COLOR;
use crate::physics::raycast_move;

#[test]
fn extract_rect_pixels_clamps_and_is_tightly_packed() {
    let mut world = WorldCore::new(100, 100);

    for (i, c) in world.grid.colors.iter_mut().enumerate() {
        *c = i as u32;
    }

    // Rect starting at x=64 with width=64 (clamps to x..100 => 36px wide)
    world.render.merged_rects.clear();
    world.render.merged_rects.push(DirtyRect {
        cx: 2,
        cy: 0,
        cw: 2,
        ch: 1,
    });

    world.extract_rect_pixels(0);

    let actual_w = 100 - (2 * CHUNK_SIZE);
    let actual_h = CHUNK_SIZE;
    let expected_len = (actual_w as usize) * (actual_h as usize);
    assert!(world.render.rect_transfer_buffer.len() >= expected_len);

    let buf = &world.render.rect_transfer_buffer[..expected_len];

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

    world.render.merged_rects.clear();
    world.render.merged_rects.push(DirtyRect {
        cx: 0,
        cy: 0,
        cw: 5,
        ch: 5,
    });

    world.extract_rect_pixels(0);

    let expected = (size as usize) * (size as usize);
    assert!(world.render.rect_transfer_buffer.len() >= expected);
}

#[test]
fn extract_chunk_pixels_is_32x32_strided_and_padded_with_bg_color_on_edges() {
    let width = CHUNK_SIZE + 5;
    let height = CHUNK_SIZE + 3;
    let mut world = WorldCore::new(width, height);

    for (i, c) in world.grid.colors.iter_mut().enumerate() {
        *c = i as u32;
    }

    // Bottom-right chunk: only 5x3 pixels exist; rest must be BG_COLOR.
    let chunk_idx = world.chunks.chunk_index(width - 1, height - 1) as u32;
    world.extract_chunk_pixels(chunk_idx);

    let buf = &world.render.chunk_transfer_buffer;
    assert_eq!(buf.len(), (CHUNK_SIZE * CHUNK_SIZE) as usize);

    let grid_width = width as usize;
    let start_x = CHUNK_SIZE as usize;
    let start_y = CHUNK_SIZE as usize;
    let row_len = 5usize;
    let row_count = 3usize;
    let stride = CHUNK_SIZE as usize;

    // In-bounds pixels.
    for row in 0..row_count {
        for col in 0..row_len {
            let gx = start_x + col;
            let gy = start_y + row;
            let expected = (gy * grid_width + gx) as u32;
            assert_eq!(buf[row * stride + col], expected);
        }
    }

    // Row padding (right side) must be BG_COLOR.
    for row in 0..row_count {
        for col in row_len..stride {
            assert_eq!(buf[row * stride + col], BG_COLOR);
        }
    }

    // Remaining rows (bottom padding) must be BG_COLOR.
    for row in row_count..stride {
        for col in 0..stride {
            assert_eq!(buf[row * stride + col], BG_COLOR);
        }
    }

    // Stride contract: second row starts at index 32, not tightly packed.
    let expected_row1_col0 = ((start_y + 1) * grid_width + start_x) as u32;
    assert_eq!(buf[stride], expected_row1_col0);
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
fn powder_does_not_corner_cut_through_solid_corners() {
    let mut world = WorldCore::new(64, 64);

    // Build a diagonal "pinch" around the sand:
    //   [stone][sand][stone]
    //         [stone]
    // Diagonal targets (x±1,y+1) are empty, but both are blocked by 2 solid side-cells.
    assert!(world.add_particle(10, 11, EL_STONE)); // below
    assert!(world.add_particle(9, 10, EL_STONE)); // left
    assert!(world.add_particle(11, 10, EL_STONE)); // right
    assert!(world.add_particle(10, 10, EL_SAND));

    world.step();

    assert_eq!(world.grid.get_type(10, 10), EL_SAND);
    assert_eq!(world.grid.get_type(9, 11), EL_EMPTY);
    assert_eq!(world.grid.get_type(11, 11), EL_EMPTY);
}

#[test]
fn raycast_move_blocks_corner_cutting_on_exact_grid_corners() {
    let mut world = WorldCore::new(16, 16);

    // Start at (1,1) and move diagonally by (1,1).
    // A solid at (2,1) forms a corner that a naive DDA can "cut" through when t_max_x == t_max_y.
    assert!(world.add_particle(1, 1, EL_SAND));
    assert!(world.add_particle(2, 1, EL_STONE));

    let res = raycast_move(&world.grid, 1, 1, 1.0, 1.0);
    assert!(res.collided);
    assert_eq!(res.new_x, 1);
    assert_eq!(res.new_y, 1);
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

#[test]
fn phase_changes_are_generated_from_definitions() {
    let world = WorldCore::new(1, 1);

    // Water boils/freezes
    assert_eq!(world.content.check_phase_change(EL_WATER, 101.0), Some(EL_STEAM));
    assert_eq!(world.content.check_phase_change(EL_WATER, -1.0), Some(EL_ICE));
    assert_eq!(world.content.check_phase_change(EL_WATER, 20.0), None);

    // Steam condenses
    assert_eq!(world.content.check_phase_change(EL_STEAM, 89.0), Some(EL_WATER));
    assert_eq!(world.content.check_phase_change(EL_STEAM, 95.0), None);

    // Lava solidifies
    assert_eq!(world.content.check_phase_change(EL_LAVA, 699.0), Some(EL_STONE));
    assert_eq!(world.content.check_phase_change(EL_LAVA, 800.0), None);

    // Stone melts
    assert_eq!(world.content.check_phase_change(EL_STONE, 901.0), Some(EL_LAVA));
    assert_eq!(world.content.check_phase_change(EL_STONE, 800.0), None);
}

#[test]
fn behavior_kind_mapping_is_generated_and_stable() {
    let world = WorldCore::new(1, 1);
    assert_eq!(world.content.behavior_kind(EL_FIRE), BehaviorKind::EnergyFire);
    assert_eq!(world.content.behavior_kind(EL_CLONE), BehaviorKind::UtilityClone);
    assert_eq!(world.content.behavior_kind(EL_VOID), BehaviorKind::UtilityVoid);
}

#[test]
fn abi_layout_data_lengths_are_consistent() {
    let world = WorldCore::new(10, 11);
    let data = world.abi_layout_data();

    assert_eq!(data.types_len_bytes, data.types_len_elements * std::mem::size_of::<u8>());
    assert_eq!(data.colors_len_bytes, data.colors_len_elements * std::mem::size_of::<u32>());
    assert_eq!(
        data.temperature_len_bytes,
        data.temperature_len_elements * std::mem::size_of::<f32>()
    );

    assert_eq!(
        data.chunk_transfer_len_bytes,
        data.chunk_transfer_len_elements * std::mem::size_of::<u32>()
    );
    assert_eq!(data.dirty_list_len_bytes, data.dirty_list_len_elements * std::mem::size_of::<u32>());
    assert_eq!(
        data.rect_transfer_len_bytes,
        data.rect_transfer_len_elements * std::mem::size_of::<u32>()
    );
}

#[test]
fn move_buffer_default_capacity_is_clamped_to_min() {
    let world = WorldCore::new(10, 10);
    assert_eq!(world.grid.size(), 100);
    assert_eq!(world.grid.pending_moves.capacity(), 1024);
}

#[test]
fn move_buffer_try_push_reports_overflow() {
    let mut buf = crate::grid::MoveBuffer::new(1);
    assert!(buf.try_push((0, 0, 1, 1)));
    assert!(buf.try_push((0, 0, 1, 1)));
    assert_eq!(buf.count, 2);
    assert_eq!(buf.overflow_count(), 1);
}
