use super::{WorldCore, CHUNK_SIZE};
use crate::grid::BG_COLOR;

pub(super) fn collect_dirty_chunks(world: &mut WorldCore) -> usize {
    world.render.dirty_list.clear();
    let total = world.chunks.total_chunks();

    for i in 0..total {
        if world.chunks.visual_dirty[i] {
            world.render.dirty_list.push(i as u32);
            world.chunks.clear_visual_dirty(i);
        }
    }

    world.render.dirty_list.len()
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
    let buf_stride = CHUNK_SIZE as usize;
    debug_assert_eq!(
        world.render.chunk_transfer_buffer.len(),
        buf_stride.saturating_mul(buf_stride)
    );

    let colors = &world.grid.colors;
    let buffer = &mut world.render.chunk_transfer_buffer;
    buffer.fill(BG_COLOR);

    let row_len = (end_x - start_x) as usize;
    if row_len == 0 {
        return buffer.as_ptr();
    }

    for (row_i, y) in (start_y..end_y).enumerate() {
        let row_offset = (y as usize) * grid_width;
        let src_start = row_offset + (start_x as usize);
        let src_end = src_start + row_len;

        let dst_start = row_i * buf_stride;
        let dst_end = dst_start + row_len;

        buffer[dst_start..dst_end].copy_from_slice(&colors[src_start..src_end]);
    }

    world.render.chunk_transfer_buffer.as_ptr()
}

pub(super) fn collect_merged_rects(world: &mut WorldCore) -> usize {
    let _count = world
        .chunks
        .collect_merged_dirty_rects(&mut world.render.merged_rects);

    world.chunks.merge_vertical(&mut world.render.merged_rects);

    let total = world.chunks.total_chunks();
    for i in 0..total {
        if world.chunks.visual_dirty[i] {
            world.chunks.clear_visual_dirty(i);
        }
    }

    world.render.merged_rects.count()
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
        .render
        .merged_rects
        .get(idx)
        .map(|r| r.cx * CHUNK_SIZE)
        .unwrap_or(0)
}

pub(super) fn get_merged_rect_y(world: &WorldCore, idx: usize) -> u32 {
    world
        .render
        .merged_rects
        .get(idx)
        .map(|r| r.cy * CHUNK_SIZE)
        .unwrap_or(0)
}

pub(super) fn get_merged_rect_w(world: &WorldCore, idx: usize) -> u32 {
    world
        .render
        .merged_rects
        .get(idx)
        .map(|r| r.cw * CHUNK_SIZE)
        .unwrap_or(0)
}

pub(super) fn get_merged_rect_h(world: &WorldCore, idx: usize) -> u32 {
    world
        .render
        .merged_rects
        .get(idx)
        .map(|r| r.ch * CHUNK_SIZE)
        .unwrap_or(0)
}

pub(super) fn extract_rect_pixels(world: &mut WorldCore, idx: usize) -> *const u32 {
    let rect = match world.render.merged_rects.get(idx) {
        Some(r) => r.clone(),
        None => return world.render.rect_transfer_buffer.as_ptr(),
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
        return world.render.rect_transfer_buffer.as_ptr();
    }

    let needed = (actual_w as usize).saturating_mul(actual_h as usize);
    if world.render.rect_transfer_buffer.len() < needed {
        world.render.rect_transfer_buffer.resize(needed, 0);
    }

    let grid_width = world.grid.width() as usize;
    let colors = &world.grid.colors;
    let buffer = &mut world.render.rect_transfer_buffer;

    let row_len = actual_w as usize;
    let mut dst = 0usize;
    for y in py..end_y {
        let row_offset = (y as usize) * grid_width;
        let src_start = row_offset + (px as usize);
        let src_end = src_start + row_len;

        let dst_end = dst + row_len;
        buffer[dst..dst_end].copy_from_slice(&colors[src_start..src_end]);
        dst = dst_end;
    }

    world.render.rect_transfer_buffer.as_ptr()
}

pub(super) fn rect_buffer_size(world: &WorldCore) -> usize {
    world.render.rect_transfer_buffer.len() * 4
}
