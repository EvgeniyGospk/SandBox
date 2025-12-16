use crate::generated_elements::{
    CategoryId, ElementId, CAT_BIO, CAT_ENERGY, CAT_GAS, CAT_LIQUID, CAT_POWDER, CAT_SOLID, CAT_UTILITY,
    ELEMENT_COUNT, ELEMENT_DATA, EL_EMPTY,
};

#[inline]
pub fn is_valid_element_id(id: ElementId) -> bool {
    (id as usize) < ELEMENT_COUNT
}

#[inline]
pub fn is_particle(id: ElementId) -> bool {
    id != EL_EMPTY && is_valid_element_id(id)
}

#[inline]
pub fn category_of(id: ElementId) -> Option<CategoryId> {
    if is_valid_element_id(id) {
        Some(ELEMENT_DATA[id as usize].category)
    } else {
        None
    }
}

#[inline]
pub fn is_solid(id: ElementId) -> bool {
    category_of(id) == Some(CAT_SOLID)
}

#[inline]
pub fn is_powder(id: ElementId) -> bool {
    category_of(id) == Some(CAT_POWDER)
}

#[inline]
pub fn is_liquid(id: ElementId) -> bool {
    category_of(id) == Some(CAT_LIQUID)
}

#[inline]
pub fn is_gas(id: ElementId) -> bool {
    category_of(id) == Some(CAT_GAS)
}

#[inline]
pub fn is_energy(id: ElementId) -> bool {
    category_of(id) == Some(CAT_ENERGY)
}

#[inline]
pub fn is_utility(id: ElementId) -> bool {
    category_of(id) == Some(CAT_UTILITY)
}

#[inline]
pub fn is_bio(id: ElementId) -> bool {
    category_of(id) == Some(CAT_BIO)
}
