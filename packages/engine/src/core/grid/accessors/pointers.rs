use super::super::*;

impl Grid {
    // === Get raw pointers for JS interop ===
    pub fn types_ptr(&self) -> *const ElementId {
        self.types.as_ptr()
    }

    pub fn colors_ptr(&self) -> *const u32 {
        self.colors.as_ptr()
    }
}
