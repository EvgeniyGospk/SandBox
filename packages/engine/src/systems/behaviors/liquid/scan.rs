use crate::elements::{ELEMENT_DATA, EL_EMPTY, CAT_GAS, CAT_LIQUID};

use super::perf::inc_liquid_scans;
use super::super::UpdateContext;

/// Result of scanning a horizontal line
pub(super) struct ScanResult {
    pub(super) found: bool,
    pub(super) x: i32,
    pub(super) y: i32,
    pub(super) has_cliff: bool,
}

/// Scan along a "horizontal" axis (perpendicular to gravity) for empty cells or cliffs.
/// PHASE 1: Uses unsafe after bounds check
#[inline]
pub(super) fn scan_line(
    ctx: &UpdateContext,
    start_x: i32,
    start_y: i32,
    dir_x: i32,
    dir_y: i32,
    range: i32,
    my_density: f32,
    gx: i32,
    gy: i32,
) -> ScanResult {
    let mut best_x = start_x;
    let mut best_y = start_y;
    let mut found = false;
    let mut has_cliff = false;

    inc_liquid_scans();

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

            // Check for cliff below (waterfall effect)
            let below_x = tx + gx;
            let below_y = ty + gy;
            if ctx.grid.in_bounds(below_x, below_y) {
                // SAFETY: We just checked in_bounds above
                let below_type = unsafe { ctx.grid.get_type_unchecked(below_x as u32, below_y as u32) };
                if below_type == EL_EMPTY {
                    has_cliff = true;
                    break;
                }
            }
            continue;
        }

        // Bounds check
        if (target_type as usize) >= ELEMENT_DATA.len() { break; }

        // CASE 2: Occupied cell - check if we can displace
        let t_cat = ELEMENT_DATA[target_type as usize].category;

        if t_cat == CAT_LIQUID || t_cat == CAT_GAS {
            let t_density = ELEMENT_DATA[target_type as usize].density;

            if my_density > t_density {
                best_x = tx;
                best_y = ty;
                found = true;
                break;
            }
        }

        // CASE 3: Wall or same/heavier liquid - stop scanning
        break;
    }

    ScanResult { found, x: best_x, y: best_y, has_cliff }
}
