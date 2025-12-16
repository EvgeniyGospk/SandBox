use crate::elements::ElementId;

/// 2D Vector for physics calculations
#[derive(Clone, Copy, Debug, Default)]
pub struct Vec2 {
    pub x: f32,
    pub y: f32,
}

impl Vec2 {
    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }
    
    pub fn zero() -> Self {
        Self { x: 0.0, y: 0.0 }
    }
    
    pub fn length(&self) -> f32 {
        (self.x * self.x + self.y * self.y).sqrt()
    }
    
    pub fn length_squared(&self) -> f32 {
        self.x * self.x + self.y * self.y
    }
    
    pub fn dot(&self, other: Vec2) -> f32 {
        self.x * other.x + self.y * other.y
    }
    
    pub fn normalize(&self) -> Self {
        let len = self.length();
        if len > 0.0001 {
            Self { x: self.x / len, y: self.y / len }
        } else {
            Self::zero()
        }
    }
}

impl std::ops::Add for Vec2 {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Self { x: self.x + rhs.x, y: self.y + rhs.y }
    }
}

impl std::ops::Sub for Vec2 {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        Self { x: self.x - rhs.x, y: self.y - rhs.y }
    }
}

impl std::ops::Mul<f32> for Vec2 {
    type Output = Self;
    fn mul(self, rhs: f32) -> Self {
        Self { x: self.x * rhs, y: self.y * rhs }
    }
}

/// A single pixel in the rigid body's local space
#[derive(Clone, Copy)]
pub struct BodyPixel {
    /// Offset from center (local coords)
    pub dx: i8,
    pub dy: i8,
    /// Element type for this pixel
    pub element: ElementId,
    /// Color variation seed
    pub color_seed: u8,
}
