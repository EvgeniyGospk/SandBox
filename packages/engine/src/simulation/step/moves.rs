use super::WorldCore;

pub(super) fn apply_pending_moves(world: &mut WorldCore) {
    for (from_x, from_y, to_x, to_y) in world.grid.pending_moves.as_slice().iter().copied() {
        world.chunks.move_particle(from_x, from_y, to_x, to_y);
    }
}
