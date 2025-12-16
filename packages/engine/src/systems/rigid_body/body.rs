use crate::elements::ElementId;

use super::vec2::{BodyPixel, Vec2};

/// Rigid Body - moves as a single unit
pub struct RigidBody {
    // === Physics State ===
    /// World position (center of mass)
    pub pos: Vec2,
    /// Velocity vector (pixels per frame)
    pub velocity: Vec2,
    /// Rotation angle (radians)
    pub angle: f32,
    /// Angular velocity (radians per frame)
    pub angular_vel: f32,
    /// Total mass (sum of pixel masses)
    pub mass: f32,
    /// Moment of inertia for rotation (I = Σ m*r²)
    pub moment_of_inertia: f32,
    /// Is body active (simulated)?
    pub active: bool,
    /// Unique ID for this body
    pub id: u32,
    
    // === Shape Definition ===
    /// Pixels relative to center (0,0)
    pub pixels: Vec<BodyPixel>,
    
    // === Bounding Box (AABB) ===
    pub half_width: f32,
    pub half_height: f32,
    
    // === Previous frame position (for clearing) ===
    pub prev_pos: Vec2,
    pub prev_angle: f32,
    
    /// Cached world coordinates from last rasterization (for accurate clearing)
    pub prev_world_coords: Vec<(i32, i32)>,
    
    // === Material properties ===
    /// Bounciness (0.0 = no bounce, 1.0 = full elastic)
    pub restitution: f32,
}

impl RigidBody {
    /// Create a rectangular rigid body
    pub fn new_rect(x: f32, y: f32, w: i32, h: i32, element: ElementId, id: u32) -> Self {
        let mut pixels = Vec::new();
        let half_w = w / 2;
        let half_h = h / 2;
        
        // Generate rectangle of pixels centered at (0,0)
        for dy in -half_h..=half_h {
            for dx in -half_w..=half_w {
                // Generate color variation seed based on position
                let color_seed = ((dx.abs() as u32 * 7 + dy.abs() as u32 * 13) & 31) as u8;
                
                pixels.push(BodyPixel {
                    dx: dx as i8,
                    dy: dy as i8,
                    element,
                    color_seed,
                });
            }
        }
        
        let mass = pixels.len() as f32;
        
        // Calculate moment of inertia: I = Σ m*r² (assuming unit mass per pixel)
        let mut moment_of_inertia = 0.0f32;
        for pixel in &pixels {
            let r2 = (pixel.dx as f32).powi(2) + (pixel.dy as f32).powi(2);
            moment_of_inertia += r2; // m = 1 per pixel
        }
        // Ensure minimum moment to avoid division issues
        moment_of_inertia = moment_of_inertia.max(1.0);
        
        let pixel_count = pixels.len();
        
        Self {
            pos: Vec2::new(x, y),
            velocity: Vec2::zero(),
            angle: 0.0,
            angular_vel: 0.0,
            mass,
            moment_of_inertia,
            active: true,
            id,
            pixels,
            half_width: half_w as f32,
            half_height: half_h as f32,
            prev_pos: Vec2::new(x, y),
            prev_angle: 0.0,
            prev_world_coords: Vec::with_capacity(pixel_count),
            restitution: 0.3, // Default: slight bounce like stone
        }
    }
    
    /// Create a circular rigid body
    pub fn new_circle(x: f32, y: f32, radius: i32, element: ElementId, id: u32) -> Self {
        let mut pixels = Vec::new();
        // Use (r + 0.5)^2 for smoother circle edges (Midpoint circle algorithm style)
        let r_adj = radius as f32 + 0.5;
        let r2 = r_adj * r_adj;
        
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                // Use floating point distance for smoother circle
                let dist2 = (dx as f32 * dx as f32) + (dy as f32 * dy as f32);
                if dist2 < r2 {
                    let color_seed = ((dx.abs() as u32 * 7 + dy.abs() as u32 * 13) & 31) as u8;
                    
                    pixels.push(BodyPixel {
                        dx: dx as i8,
                        dy: dy as i8,
                        element,
                        color_seed,
                    });
                }
            }
        }
        
        let mass = pixels.len() as f32;
        
        // Calculate moment of inertia for circle: I = 0.5 * m * r²
        // But we compute exactly: I = Σ m*r² for all pixels
        let mut moment_of_inertia = 0.0f32;
        for pixel in &pixels {
            let r2 = (pixel.dx as f32).powi(2) + (pixel.dy as f32).powi(2);
            moment_of_inertia += r2;
        }
        moment_of_inertia = moment_of_inertia.max(1.0);
        
        let pixel_count = pixels.len();
        
        Self {
            pos: Vec2::new(x, y),
            velocity: Vec2::zero(),
            angle: 0.0,
            angular_vel: 0.0,
            mass,
            moment_of_inertia,
            active: true,
            id,
            pixels,
            half_width: radius as f32,
            half_height: radius as f32,
            prev_pos: Vec2::new(x, y),
            prev_angle: 0.0,
            prev_world_coords: Vec::with_capacity(pixel_count),
            restitution: 0.3,
        }
    }
    
    /// Transform local pixel coordinates to world coordinates
    #[inline]
    pub fn local_to_world(&self, dx: f32, dy: f32) -> (i32, i32) {
        let (sin, cos) = self.angle.sin_cos();
        let rx = dx * cos - dy * sin;
        let ry = dx * sin + dy * cos;
        
        ((self.pos.x + rx).round() as i32, (self.pos.y + ry).round() as i32)
    }
    
    /// Transform local pixel coordinates to world using previous frame's transform
    #[inline]
    pub fn local_to_world_prev(&self, dx: f32, dy: f32) -> (i32, i32) {
        let (sin, cos) = self.prev_angle.sin_cos();
        let rx = dx * cos - dy * sin;
        let ry = dx * sin + dy * cos;
        
        ((self.prev_pos.x + rx).round() as i32, (self.prev_pos.y + ry).round() as i32)
    }
    
    /// Save current position as previous (call before physics update)
    pub fn save_prev_state(&mut self) {
        self.prev_pos = self.pos;
        self.prev_angle = self.angle;
    }
    
    /// Apply impulse at center of mass
    pub fn apply_impulse(&mut self, impulse: Vec2) {
        self.velocity = self.velocity + impulse * (1.0 / self.mass);
    }
    
    /// Apply force for one frame
    pub fn apply_force(&mut self, force: Vec2) {
        self.velocity = self.velocity + force * (1.0 / self.mass);
    }
    
    /// Apply torque (rotational force)
    pub fn apply_torque(&mut self, torque: f32) {
        self.angular_vel += torque / self.moment_of_inertia;
    }
    
    /// Set restitution (bounciness)
    pub fn set_restitution(&mut self, r: f32) {
        self.restitution = r.clamp(0.0, 1.0);
    }
}
