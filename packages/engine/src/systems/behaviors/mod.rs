//! Behaviors - Particle physics implementations
//! 
//! SOLID: Single Responsibility - each behavior handles one particle category
//! SOLID: Open/Closed - new behaviors can be added without modifying existing code
//! 
//! Port from TypeScript: apps/web/src/lib/engine/behaviors/

mod powder;
mod liquid;
mod gas;
mod energy;
mod utility;
mod plant;

pub use liquid::{reset_liquid_scan_counter, take_liquid_scan_counter};
pub use powder::PowderBehavior;
pub use liquid::LiquidBehavior;
pub use gas::GasBehavior;
pub use energy::EnergyBehavior;
pub use utility::UtilityBehavior;
pub use plant::PlantBehavior;

use crate::grid::Grid;
use crate::chunks::ChunkGrid;
use crate::elements::{CategoryId, ElementId, EL_EMPTY, CAT_POWDER, CAT_LIQUID, CAT_GAS, CAT_ENERGY, CAT_UTILITY, CAT_BIO};

/// Update context passed to behaviors (mirrors TypeScript UpdateContext)
pub struct UpdateContext<'a> {
    pub grid: &'a mut Grid,
    pub chunks: &'a mut ChunkGrid,
    pub world_particle_count: &'a mut u32,
    pub x: u32,
    pub y: u32,
    pub frame: u64,
    pub gravity_x: f32,
    pub gravity_y: f32,
    pub ambient_temp: f32,
    pub rng: &'a mut u32,
}

impl<'a> UpdateContext<'a> {
    #[inline]
    pub fn mark_dirty(&mut self, x: u32, y: u32) {
        self.chunks.mark_dirty(x, y);
    }

    #[inline]
    pub fn set_particle_dirty(&mut self, x: u32, y: u32, element: ElementId, color: u32, life: u16, temp: f32) {
        let prev = self.grid.get_type(x as i32, y as i32);
        self.grid.set_particle(x, y, element, color, life, temp);
        if prev == EL_EMPTY {
            self.chunks.add_particle(x, y);
            *self.world_particle_count = self.world_particle_count.saturating_add(1);
        }
        self.chunks.mark_dirty(x, y);
    }

    #[inline]
    pub fn clear_cell_dirty(&mut self, x: u32, y: u32) {
        let prev = self.grid.get_type(x as i32, y as i32);
        if prev == EL_EMPTY {
            return;
        }
        self.grid.clear_cell(x, y);
        self.chunks.remove_particle(x, y);
        *self.world_particle_count = self.world_particle_count.saturating_sub(1);
        self.chunks.mark_dirty(x, y);
    }
}

/// Behavior trait - each category implements this
pub trait Behavior {
    fn update(&self, ctx: &mut UpdateContext);
}

/// Random direction helper (mirrors TypeScript getRandomDirection EXACTLY)
/// TS: const goLeft = (frame + x) & 1; dx1 = goLeft ? -1 : 1
#[inline]
pub fn get_random_dir(frame: u64, x: u32) -> (i32, i32) {
    // TypeScript: goLeft = (frame + x) & 1 -> if truthy (1) then left first
    let go_left = ((frame as u32 + x) & 1) == 1;
    if go_left { (-1, 1) } else { (1, -1) }
}

/// Discrete gravity direction as a grid step (−1/0/1 per axis).
/// If gravity is (0,0), defaults to down (0,1).
#[inline]
pub fn gravity_dir(gravity_x: f32, gravity_y: f32) -> (i32, i32) {
    let gx = if gravity_x > 0.0 { 1 } else if gravity_x < 0.0 { -1 } else { 0 };
    let gy = if gravity_y > 0.0 { 1 } else if gravity_y < 0.0 { -1 } else { 0 };
    if gx == 0 && gy == 0 {
        (0, 1)
    } else {
        (gx, gy)
    }
}

/// Two perpendicular unit directions for a given direction.
/// Returned as (left, right) relative to `dir`.
#[inline]
pub fn perp_dirs(dx: i32, dy: i32) -> ((i32, i32), (i32, i32)) {
    // 90° rotations: (-dy, dx) and (dy, -dx)
    ((-dy, dx), (dy, -dx))
}

/// Xorshift32 random number generator
#[inline]
pub fn xorshift32(state: &mut u32) -> u32 {
    let mut x = *state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *state = x;
    x
}

/// Behavior registry - dispatch by category
pub struct BehaviorRegistry {
    powder: PowderBehavior,
    liquid: LiquidBehavior,
    gas: GasBehavior,
    energy: EnergyBehavior,
    utility: UtilityBehavior,
    plant: PlantBehavior,
}

impl BehaviorRegistry {
    pub fn new() -> Self {
        Self {
            powder: PowderBehavior::new(),
            liquid: LiquidBehavior::new(),
            gas: GasBehavior::new(),
            energy: EnergyBehavior::new(),
            utility: UtilityBehavior::new(),
            plant: PlantBehavior::new(),
        }
    }
    
    /// Dispatch update to appropriate behavior based on category
    pub fn update(&self, category: CategoryId, ctx: &mut UpdateContext) {
        match category {
            CAT_POWDER => self.powder.update(ctx),
            CAT_LIQUID => self.liquid.update(ctx),
            CAT_GAS => self.gas.update(ctx),
            CAT_ENERGY => self.energy.update(ctx),
            CAT_UTILITY => self.utility.update(ctx),
            CAT_BIO => self.plant.update(ctx),
            _ => {} // Solid - no behavior
        }
    }
}

impl Default for BehaviorRegistry {
    fn default() -> Self {
        Self::new()
    }
}
