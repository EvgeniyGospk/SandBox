use crate::elements::{ELEMENT_DATA, EL_EMPTY, CAT_SOLID};

use super::super::UpdateContext;

/// Result of scanning ceiling for chimneys
pub(super) struct ScanResult {
    pub(super) found: bool,
    pub(super) x: i32,
    pub(super) y: i32,
    pub(super) has_chimney: bool,
}

/// Scan along the "ceiling" axis (perpendicular to rise) for chimneys.
/// PHASE 1: Uses unsafe after bounds check
#[inline]
pub(super) fn scan_ceiling(
    ctx: &UpdateContext,
    start_x: i32,
    start_y: i32,
    dir_x: i32,
    dir_y: i32,
    range: i32,
    my_density: f32,
    rise_x: i32,
    rise_y: i32,
) -> ScanResult {
    let mut best_x = start_x;
    let mut best_y = start_y;
    let mut found = false;
    let mut has_chimney = false;

    for i in 1..=range {
        let tx = start_x + (dir_x * i);
        let ty = start_y + (dir_y * i);

        if !ctx.grid.in_bounds(tx, ty) { break; }

        // SAFETY: We just checked in_bounds above
        let target_type = unsafe { ctx.grid.get_type_unchecked(tx as u32, ty as u32) };

        // CASE 1: Empty cell
        if target_type == EL_EMPTY {
            best_x = tx;
            best_y = ty;
            found = true;

            // Check for chimney in rise direction
            let ahead_x = tx + rise_x;
            let ahead_y = ty + rise_y;
            if ctx.grid.in_bounds(ahead_x, ahead_y) {
                let ahead_type = unsafe { ctx.grid.get_type_unchecked(ahead_x as u32, ahead_y as u32) };
                if ahead_type == EL_EMPTY {
                    has_chimney = true;
                    break;
                }
                if (ahead_type as usize) < ELEMENT_DATA.len() {
                    if ELEMENT_DATA[ahead_type as usize].density > my_density {
                        has_chimney = true;
                        break;
                    }
                }
            }
            continue;
        }

        // Bounds check
        if (target_type as usize) >= ELEMENT_DATA.len() { break; }

        // CASE 2: Occupied - can we displace it?
        let t_cat = ELEMENT_DATA[target_type as usize].category;

        if t_cat != CAT_SOLID {
            let t_density = ELEMENT_DATA[target_type as usize].density;
            if t_density > my_density {
                best_x = tx;
                best_y = ty;
                found = true;
                break;
            }
        }

        // CASE 3: Wall or lighter/same gas - stop
        break;
    }

    ScanResult { found, x: best_x, y: best_y, has_chimney }
}
