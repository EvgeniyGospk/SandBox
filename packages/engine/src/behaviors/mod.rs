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

pub use powder::PowderBehavior;
pub use liquid::LiquidBehavior;
pub use gas::GasBehavior;
pub use energy::EnergyBehavior;
pub use utility::UtilityBehavior;
pub use plant::PlantBehavior;

use crate::grid::Grid;
use crate::elements::{CategoryId, CAT_POWDER, CAT_LIQUID, CAT_GAS, CAT_ENERGY, CAT_UTILITY, CAT_BIO};

/// Update context passed to behaviors (mirrors TypeScript UpdateContext)
pub struct UpdateContext<'a> {
    pub grid: &'a mut Grid,
    pub x: u32,
    pub y: u32,
    pub frame: u64,
    pub gravity_x: f32,
    pub gravity_y: f32,
    pub ambient_temp: f32,
    pub rng: &'a mut u32,
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
