use crate::elements::{
    ElementId, EL_ICE, EL_LAVA, EL_METAL, EL_SAND, EL_STEAM, EL_STONE, EL_WATER,
};

/// Phase change definitions: (element, high_temp, high_to, low_temp, low_to)
/// EXACT match to TypeScript apps/web/src/lib/engine/elements.ts
const PHASE_CHANGES: [(ElementId, Option<(f32, ElementId)>, Option<(f32, ElementId)>); 7] = [
    // Stone: melts at 900°C -> Lava
    (EL_STONE, Some((900.0, EL_LAVA)), None),
    // Sand: melts at 1700°C -> Lava (glass)
    (EL_SAND, Some((1700.0, EL_LAVA)), None),
    // Metal: melts at 1500°C -> Lava
    (EL_METAL, Some((1500.0, EL_LAVA)), None),
    // Ice: melts at 0°C -> Water
    (EL_ICE, Some((0.0, EL_WATER)), None),
    // Water: boils at 100°C -> Steam, freezes at 0°C -> Ice
    (EL_WATER, Some((100.0, EL_STEAM)), Some((0.0, EL_ICE))),
    // Lava: solidifies at 700°C -> Stone
    (EL_LAVA, None, Some((700.0, EL_STONE))),
    // Steam: condenses at 90°C -> Water (EXACT TypeScript value!)
    (EL_STEAM, None, Some((90.0, EL_WATER))),
];

/// Get phase change for element at given temperature
/// Returns new element if phase change occurs, None otherwise
pub fn check_phase_change(element: ElementId, temp: f32) -> Option<ElementId> {
    for (el, high, low) in PHASE_CHANGES.iter() {
        if *el == element {
            // Check high temp (melting/boiling)
            if let Some((threshold, new_el)) = high {
                if temp > *threshold {
                    return Some(*new_el);
                }
            }
            // Check low temp (freezing/condensing)
            if let Some((threshold, new_el)) = low {
                if temp < *threshold {
                    return Some(*new_el);
                }
            }
            return None;
        }
    }
    None
}
