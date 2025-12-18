use std::fs;

use particula_engine::domain::content::ContentRegistry;
use particula_engine::elements::{EL_EMPTY, EL_WATER};

#[test]
fn content_bundle_smoke_parses_and_has_core_invariants() {
    let json = fs::read_to_string("../../apps/web/public/content/bundle.json")
        .expect("bundle.json should exist (run content compiler first)");

    let registry = ContentRegistry::from_bundle_json(&json).expect("bundle.json should parse");

    assert!(registry.element_count() > 0);
    assert!(registry.is_valid_element_id(EL_EMPTY));
    assert!(registry.props(EL_EMPTY).is_some());

    // Ensure we have at least one real element besides empty.
    assert!(registry.is_valid_element_id(EL_WATER));
    assert!(registry.props(EL_WATER).is_some());

    // Basic key lookup should work for the base pack.
    assert_eq!(registry.id_by_key("base:empty"), Some(EL_EMPTY));

    // Reaction table should be addressable (may be None depending on pair).
    let _ = registry.reaction(EL_WATER, EL_WATER);
}
