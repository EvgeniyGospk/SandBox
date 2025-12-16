use super::{WorldCore, CHUNK_SIZE};

pub(super) fn collect_dirty_chunks(world: &mut WorldCore) -> usize {
    world.dirty_list.clear();
    let total = world.chunks.total_chunks();

    for i in 0..total {
        if world.chunks.visual_dirty[i] {
            world.dirty_list.push(i as u32);
            world.chunks.clear_visual_dirty(i);
        }
    }

    world.dirty_list.len()
}

pub(super) fn extract_chunk_pixels(world: &mut WorldCore, chunk_idx: u32) -> *const u32 {
    let (cx_count, _) = world.chunks.dimensions();
    let cx = chunk_idx % cx_count;
    let cy = chunk_idx / cx_count;

    let start_x = cx * CHUNK_SIZE;
    let start_y = cy * CHUNK_SIZE;
    let end_x = (start_x + CHUNK_SIZE).min(world.grid.width());
    let end_y = (start_y + CHUNK_SIZE).min(world.grid.height());

    let grid_width = world.grid.width() as usize;
    let colors_ptr = world.grid.colors.as_ptr();
    let buffer_ptr = world.chunk_transfer_buffer.as_mut_ptr();

    let mut buf_idx = 0usize;

    unsafe {
        for y in start_y..end_y {
            let row_offset = (y as usize) * grid_width;
            let src_start = row_offset + (start_x as usize);
            let row_len = (end_x - start_x) as usize;

            std::ptr::copy_nonoverlapping(colors_ptr.add(src_start), buffer_ptr.add(buf_idx), row_len);

            buf_idx += CHUNK_SIZE as usize;
        }
    }

    world.chunk_transfer_buffer.as_ptr()
}

pub(super) fn collect_merged_rects(world: &mut WorldCore) -> usize {
    let _count = world
        .chunks
        .collect_merged_dirty_rects(&mut world.merged_rects);

    world.chunks.merge_vertical(&mut world.merged_rects);

    let total = world.chunks.total_chunks();
    for i in 0..total {
        if world.chunks.visual_dirty[i] {
            world.chunks.clear_visual_dirty(i);
        }
    }

    world.merged_rects.count()
}

pub(super) fn count_dirty_chunks(world: &WorldCore) -> usize {
    let mut count = 0;
    for i in 0..world.chunks.total_chunks() {
        if world.chunks.visual_dirty[i] {
            count += 1;
        }
    }
    count
}

pub(super) fn get_merged_rect_x(world: &WorldCore, idx: usize) -> u32 {
    world
        .merged_rects
        .get(idx)
        .map(|r| r.cx * CHUNK_SIZE)
        .unwrap_or(0)
}

pub(super) fn get_merged_rect_y(world: &WorldCore, idx: usize) -> u32 {
    world
        .merged_rects
        .get(idx)
        .map(|r| r.cy * CHUNK_SIZE)
        .unwrap_or(0)
}

pub(super) fn get_merged_rect_w(world: &WorldCore, idx: usize) -> u32 {
    world
        .merged_rects
        .get(idx)
        .map(|r| r.cw * CHUNK_SIZE)
        .unwrap_or(0)
}

pub(super) fn get_merged_rect_h(world: &WorldCore, idx: usize) -> u32 {
    world
        .merged_rects
        .get(idx)
        .map(|r| r.ch * CHUNK_SIZE)
        .unwrap_or(0)
}

pub(super) fn extract_rect_pixels(world: &mut WorldCore, idx: usize) -> *const u32 {
    let rect = match world.merged_rects.get(idx) {
        Some(r) => r.clone(),
        None => return world.rect_transfer_buffer.as_ptr(),
    };

    let px = rect.cx * CHUNK_SIZE;
    let py = rect.cy * CHUNK_SIZE;
    let pw = rect.cw * CHUNK_SIZE;
    let ph = rect.ch * CHUNK_SIZE;

    let end_x = (px + pw).min(world.grid.width());
    let end_y = (py + ph).min(world.grid.height());
    let actual_w = end_x - px;
    let actual_h = end_y - py;

    if actual_w == 0 || actual_h == 0 {
        return world.rect_transfer_buffer.as_ptr();
    }

    let needed = (actual_w as usize).saturating_mul(actual_h as usize);
    if world.rect_transfer_buffer.len() < needed {
        world.rect_transfer_buffer.resize(needed, 0);
    }

    let grid_width = world.grid.width() as usize;
    let colors_ptr = world.grid.colors.as_ptr();
    let buffer_ptr = world.rect_transfer_buffer.as_mut_ptr();

    let mut buf_idx = 0usize;

    unsafe {
        for y in py..end_y {
            let row_offset = (y as usize) * grid_width;
            let src_start = row_offset + (px as usize);
            let row_len = actual_w as usize;

            std::ptr::copy_nonoverlapping(colors_ptr.add(src_start), buffer_ptr.add(buf_idx), row_len);

            buf_idx += row_len;
        }
    }

    world.rect_transfer_buffer.as_ptr()
}

pub(super) fn rect_buffer_size(world: &WorldCore) -> usize {
    world.rect_transfer_buffer.len() * 4
}
