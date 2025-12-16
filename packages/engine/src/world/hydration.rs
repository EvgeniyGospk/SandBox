use super::WorldCore;

pub(super) fn hydrate_waking_chunks(world: &mut WorldCore) {
    let (chunks_x, _) = world.chunks.dimensions();

    for (idx, &woke) in world.chunks.just_woke_up.iter().enumerate() {
        if woke {
            let cx = (idx as u32) % chunks_x;
            let cy = (idx as u32) / chunks_x;
            let v_temp = world.chunks.virtual_temp[idx];

            world.grid.hydrate_chunk(cx, cy, v_temp);
        }
    }

    world.chunks.clear_wake_flags();
}
