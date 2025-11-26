//! Chemical Reactions - Data-Driven Bilateral Reaction System
//! 
//! Port from: apps/web/src/lib/engine/reactions.ts
//! EXACT 1:1 port of the TypeScript reaction rules
//! 
//! Philosophy:
//! - Rules are data, not code (OCP: Open for extension, Closed for modification)
//! - BILATERAL: Both aggressor AND victim can transform
//! - Solves "infinite lava" problem (conservation of energy)
//! - Simple lookup: Aggressor -> Victim -> Result

use crate::elements::ElementId;
use crate::elements::{
    EL_EMPTY, EL_STONE, EL_WOOD, EL_METAL, EL_ICE,
    EL_WATER, EL_OIL, EL_LAVA, EL_ACID,
    EL_STEAM, EL_SMOKE, EL_FIRE,
    EL_GUNPOWDER, EL_DIRT, EL_SEED, EL_PLANT
};

/// Reaction result
#[derive(Clone, Copy)]
pub struct Reaction {
    /// What victim becomes (EL_EMPTY = destroyed, same = unchanged)
    pub target_becomes: ElementId,
    /// What aggressor becomes (255 = unchanged, EL_EMPTY = destroyed)
    pub source_becomes: u8,  // 255 = no change
    /// Probability 0-100 (100 = 100%)
    pub chance: u8,
    /// Spawn byproduct (EL_EMPTY = none)
    pub spawn: ElementId,
}

impl Reaction {
    /// No change marker for source
    pub const NO_CHANGE: u8 = 255;
}

/// Get reaction between aggressor and victim
/// Uses match instead of 2D array for simpler initialization
pub fn get_reaction(aggressor: ElementId, victim: ElementId) -> Option<&'static Reaction> {
    // FIRE reactions
    static FIRE_WOOD: Reaction = Reaction { target_becomes: EL_FIRE, source_becomes: EL_SMOKE, chance: 10, spawn: EL_SMOKE };
    static FIRE_OIL: Reaction = Reaction { target_becomes: EL_FIRE, source_becomes: EL_SMOKE, chance: 20, spawn: EL_SMOKE };
    static FIRE_WATER: Reaction = Reaction { target_becomes: EL_STEAM, source_becomes: EL_EMPTY, chance: 50, spawn: EL_EMPTY };
    static FIRE_ICE: Reaction = Reaction { target_becomes: EL_WATER, source_becomes: EL_EMPTY, chance: 30, spawn: EL_STEAM };
    static FIRE_GUNPOWDER: Reaction = Reaction { target_becomes: EL_FIRE, source_becomes: EL_FIRE, chance: 100, spawn: EL_SMOKE };
    static FIRE_PLANT: Reaction = Reaction { target_becomes: EL_FIRE, source_becomes: EL_SMOKE, chance: 10, spawn: EL_SMOKE };
    static FIRE_SEED: Reaction = Reaction { target_becomes: EL_FIRE, source_becomes: EL_SMOKE, chance: 20, spawn: EL_EMPTY };
    
    // LAVA reactions
    static LAVA_WATER: Reaction = Reaction { target_becomes: EL_STEAM, source_becomes: EL_STONE, chance: 15, spawn: EL_STEAM };
    static LAVA_WOOD: Reaction = Reaction { target_becomes: EL_FIRE, source_becomes: Reaction::NO_CHANGE, chance: 30, spawn: EL_SMOKE };
    static LAVA_OIL: Reaction = Reaction { target_becomes: EL_FIRE, source_becomes: Reaction::NO_CHANGE, chance: 40, spawn: EL_SMOKE };
    static LAVA_ICE: Reaction = Reaction { target_becomes: EL_STEAM, source_becomes: EL_STONE, chance: 30, spawn: EL_EMPTY };
    static LAVA_GUNPOWDER: Reaction = Reaction { target_becomes: EL_FIRE, source_becomes: Reaction::NO_CHANGE, chance: 100, spawn: EL_SMOKE };
    static LAVA_PLANT: Reaction = Reaction { target_becomes: EL_FIRE, source_becomes: Reaction::NO_CHANGE, chance: 50, spawn: EL_SMOKE };
    static LAVA_DIRT: Reaction = Reaction { target_becomes: EL_STONE, source_becomes: Reaction::NO_CHANGE, chance: 5, spawn: EL_EMPTY };
    
    // ACID reactions
    static ACID_STONE: Reaction = Reaction { target_becomes: EL_EMPTY, source_becomes: EL_EMPTY, chance: 10, spawn: EL_SMOKE };
    static ACID_METAL: Reaction = Reaction { target_becomes: EL_EMPTY, source_becomes: EL_EMPTY, chance: 5, spawn: EL_EMPTY };
    static ACID_WOOD: Reaction = Reaction { target_becomes: EL_EMPTY, source_becomes: EL_EMPTY, chance: 20, spawn: EL_EMPTY };
    static ACID_ICE: Reaction = Reaction { target_becomes: EL_WATER, source_becomes: EL_EMPTY, chance: 20, spawn: EL_EMPTY };
    static ACID_PLANT: Reaction = Reaction { target_becomes: EL_EMPTY, source_becomes: EL_EMPTY, chance: 15, spawn: EL_EMPTY };
    static ACID_DIRT: Reaction = Reaction { target_becomes: EL_EMPTY, source_becomes: EL_EMPTY, chance: 5, spawn: EL_EMPTY };
    
    // WATER reactions (reverse)
    static WATER_LAVA: Reaction = Reaction { target_becomes: EL_STONE, source_becomes: EL_STEAM, chance: 15, spawn: EL_STEAM };
    static WATER_FIRE: Reaction = Reaction { target_becomes: EL_EMPTY, source_becomes: EL_STEAM, chance: 30, spawn: EL_EMPTY };
    
    match (aggressor, victim) {
        // Fire
        (EL_FIRE, EL_WOOD) => Some(&FIRE_WOOD),
        (EL_FIRE, EL_OIL) => Some(&FIRE_OIL),
        (EL_FIRE, EL_WATER) => Some(&FIRE_WATER),
        (EL_FIRE, EL_ICE) => Some(&FIRE_ICE),
        (EL_FIRE, EL_GUNPOWDER) => Some(&FIRE_GUNPOWDER),
        (EL_FIRE, EL_PLANT) => Some(&FIRE_PLANT),
        (EL_FIRE, EL_SEED) => Some(&FIRE_SEED),
        
        // Lava
        (EL_LAVA, EL_WATER) => Some(&LAVA_WATER),
        (EL_LAVA, EL_WOOD) => Some(&LAVA_WOOD),
        (EL_LAVA, EL_OIL) => Some(&LAVA_OIL),
        (EL_LAVA, EL_ICE) => Some(&LAVA_ICE),
        (EL_LAVA, EL_GUNPOWDER) => Some(&LAVA_GUNPOWDER),
        (EL_LAVA, EL_PLANT) => Some(&LAVA_PLANT),
        (EL_LAVA, EL_DIRT) => Some(&LAVA_DIRT),
        
        // Acid
        (EL_ACID, EL_STONE) => Some(&ACID_STONE),
        (EL_ACID, EL_METAL) => Some(&ACID_METAL),
        (EL_ACID, EL_WOOD) => Some(&ACID_WOOD),
        (EL_ACID, EL_ICE) => Some(&ACID_ICE),
        (EL_ACID, EL_PLANT) => Some(&ACID_PLANT),
        (EL_ACID, EL_DIRT) => Some(&ACID_DIRT),
        
        // Water (reverse reactions)
        (EL_WATER, EL_LAVA) => Some(&WATER_LAVA),
        (EL_WATER, EL_FIRE) => Some(&WATER_FIRE),
        
        _ => None
    }
}
