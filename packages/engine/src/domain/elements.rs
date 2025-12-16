//! Element Definitions - Re-exports from generated code
//! 
//! Phase 4: Single Source of Truth
//! 
//! All element definitions are now generated from definitions/elements.json
//! To add a new element:
//!   1. Edit definitions/elements.json
//!   2. Run: npm run codegen
//!   3. Done!

// Re-export everything from generated_elements
pub use crate::generated_elements::*;

// Re-export handwritten helpers layered on top of generated elements
pub use crate::domain::elements_ext::*;
