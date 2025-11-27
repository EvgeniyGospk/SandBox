//! Chemical Reactions - Phase 1 Data-Driven System
//! 
//! This module is now a thin re-export layer.
//! All reaction definitions are in definitions/reactions.json
//! and generated into generated_elements.rs
//! 
//! Benefits:
//! - O(1) reaction lookup via LUT (vs O(N) match statements)
//! - No Rust recompilation needed to add reactions
//! - Edit JSON, run codegen, done!

// Re-export from generated code
pub use crate::generated_elements::{Reaction, ReactionSystem, REACTION_LUT_SIZE, REACTION_INIT_DATA};

/// Legacy compatibility: get_reaction function
/// Deprecated: Use ReactionSystem::get() instead for O(1) lookup
/// 
/// This wrapper exists only for gradual migration.
/// New code should use ReactionSystem directly.
#[deprecated(note = "Use ReactionSystem::get() for O(1) lookup")]
pub fn get_reaction(_aggressor: crate::elements::ElementId, _victim: crate::elements::ElementId) -> Option<&'static Reaction> {
    // Legacy function - should not be called
    // All callers should migrate to ReactionSystem
    None
}
