use super::super::UpdateContext;
use crate::elements::{ELEMENT_DATA, EL_PLANT, get_color_with_variation};

/// Transform cell to plant (mirrors TypeScript transformToPlant)
pub(super) fn transform_to_plant(ctx: &mut UpdateContext, x: i32, y: i32) {
    let seed = ((x as u32 * 11 + y as u32 * 17 + ctx.frame as u32) & 31) as u8;
    let props = &ELEMENT_DATA[EL_PLANT as usize];

    ctx.set_particle_dirty(
        x as u32, y as u32,
        EL_PLANT,
        get_color_with_variation(EL_PLANT, seed),
        props.lifetime,
        20.0  // Room temperature
    );
}
