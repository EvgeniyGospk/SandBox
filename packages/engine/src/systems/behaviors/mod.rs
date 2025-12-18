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
mod common;

pub use liquid::{reset_liquid_scan_counter, take_liquid_scan_counter};
pub use powder::PowderBehavior;
pub use liquid::LiquidBehavior;
pub use gas::GasBehavior;
pub use energy::EnergyBehavior;
pub use utility::UtilityBehavior;
pub use plant::PlantBehavior;

pub use common::{get_random_dir, gravity_dir, perp_dirs, xorshift32};

use crate::grid::Grid;
use crate::domain::content::ContentRegistry;
use crate::elements::{CategoryId, ElementId, EL_EMPTY, CAT_POWDER, CAT_LIQUID, CAT_GAS, CAT_ENERGY, CAT_UTILITY, CAT_BIO};

/// Update context passed to behaviors (mirrors TypeScript UpdateContext)
pub struct UpdateContext<'a> {
    pub content: &'a ContentRegistry,
    pub grid: &'a mut Grid,
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
    pub fn set_particle(&mut self, x: u32, y: u32, element: ElementId, color: u32, life: u16, temp: f32) {
        let prev = self.grid.get_type(x as i32, y as i32);
        self.grid.set_particle(x, y, element, color, life, temp);
        if prev == EL_EMPTY {
            *self.world_particle_count = self.world_particle_count.saturating_add(1);
        }
    }

    #[inline]
    pub fn clear_cell(&mut self, x: u32, y: u32) {
        let prev = self.grid.get_type(x as i32, y as i32);
        if prev == EL_EMPTY {
            return;
        }
        self.grid.clear_cell(x, y);
        *self.world_particle_count = self.world_particle_count.saturating_sub(1);
    }
}

/// Behavior trait - each category implements this
pub trait Behavior {
    fn update(&self, ctx: &mut UpdateContext);
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
