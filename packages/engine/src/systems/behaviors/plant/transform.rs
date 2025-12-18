use super::super::UpdateContext;
use crate::elements::EL_PLANT;

/// Transform cell to plant (mirrors TypeScript transformToPlant)
pub(super) fn transform_to_plant(ctx: &mut UpdateContext, x: i32, y: i32) {
    let seed = ((x as u32 * 11 + y as u32 * 17 + ctx.frame as u32) & 31) as u8;

    let Some(props) = ctx.content.props(EL_PLANT) else {
        return;
    };

    let color = ctx
        .content
        .color_with_variation(EL_PLANT, seed)
        .unwrap_or(props.color);

    ctx.set_particle(
        x as u32, y as u32,
        EL_PLANT,
        color,
        props.lifetime,
        20.0  // Room temperature
    );
}
