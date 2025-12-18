use crate::domain::content::ContentRegistry;
use crate::elements::{ElementId, EL_EMPTY};
use crate::grid::Grid;

use super::perf::PERF_PHASE_CHANGES;

/// Transform particle to new element, preserving temperature
/// Mirrors TypeScript transformParticle exactly
pub(super) fn transform_particle(
    content: &ContentRegistry,
    grid: &mut Grid,
    x: u32,
    y: u32,
    new_element: ElementId,
    temp: f32,
    frame: u64,
) {
    PERF_PHASE_CHANGES.with(|c| {
        let mut v = c.borrow_mut();
        *v = v.saturating_add(1);
    });
    let seed = ((x * 7 + y * 13 + frame as u32) & 31) as u8;

    let Some(props) = content.props(new_element) else {
        grid.clear_cell(x, y);
        return;
    };

    let color = content
        .color_with_variation(new_element, seed)
        .unwrap_or(props.color);

    grid.set_particle(
        x, y,
        new_element,
        color,
        props.lifetime,
        temp  // Keep temperature! Hot stone from lava stays hot
    );

    // Mark as updated so it doesn't process again this frame
    grid.set_updated(x, y, true);
}
