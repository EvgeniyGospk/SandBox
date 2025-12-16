use crate::elements::{ElementId, EL_EMPTY};

/// Result of a physics step for a single particle
#[derive(Clone, Copy, Debug)]
pub struct PhysicsResult {
    /// New X position (may be same as old if blocked)
    pub new_x: u32,
    /// New Y position
    pub new_y: u32,
    /// Did particle collide with something?
    pub collided: bool,
    /// Element that was hit (if collided)
    pub hit_element: ElementId,
    pub hit_x: i32,
    pub hit_y: i32,
    pub normal_x: i32,
    pub normal_y: i32,
    /// Steps taken in the DDA raycast
    pub steps: u32,
    /// Speed magnitude used for this integration
    pub speed: f32,
}

impl PhysicsResult {
    #[inline]
    pub fn no_move(x: u32, y: u32) -> Self {
        Self {
            new_x: x,
            new_y: y,
            collided: false,
            hit_element: EL_EMPTY,
            hit_x: x as i32,
            hit_y: y as i32,
            normal_x: 0,
            normal_y: 0,
            steps: 0,
            speed: 0.0,
        }
    }
}
