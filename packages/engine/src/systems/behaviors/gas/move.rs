use crate::elements::{ELEMENT_DATA, EL_EMPTY, CAT_SOLID};

use super::super::UpdateContext;

/// Try to rise to target cell (mirrors TypeScript tryRise)
/// PHASE 1: Uses unsafe after bounds check
#[inline]
pub(super) fn try_rise(
    ctx: &mut UpdateContext,
    from_x: u32,
    from_y: u32,
    to_x: i32,
    to_y: i32,
    my_density: f32,
) -> bool {
    if !ctx.grid.in_bounds(to_x, to_y) { return false; }

    // SAFETY: We just checked in_bounds above
    let target_type = unsafe { ctx.grid.get_type_unchecked(to_x as u32, to_y as u32) };

    // Empty cell - just rise
    if target_type == EL_EMPTY {
        unsafe { ctx.grid.swap_unchecked(from_x, from_y, to_x as u32, to_y as u32); }
        return true;
    }

    // Bounds check
    if (target_type as usize) >= ELEMENT_DATA.len() { return false; }

    // Can we bubble through? (target must be heavier and not solid)
    let t_cat = ELEMENT_DATA[target_type as usize].category;

    if t_cat != CAT_SOLID {
        let t_density = ELEMENT_DATA[target_type as usize].density;
        if t_density > my_density {
            unsafe { ctx.grid.swap_unchecked(from_x, from_y, to_x as u32, to_y as u32); }
            return true;
        }
    }

    false
}
