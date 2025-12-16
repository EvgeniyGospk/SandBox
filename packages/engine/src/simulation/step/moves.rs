use super::WorldCore;

pub(super) fn apply_pending_moves(world: &mut WorldCore) {
    let count = world.grid.pending_moves.count;
    let moves_ptr = world.grid.pending_moves.as_ptr();

    unsafe {
        for i in 0..count {
            let (from_x, from_y, to_x, to_y) = *moves_ptr.add(i);
            world.chunks.move_particle(from_x, from_y, to_x, to_y);
        }
    }
}
