/**
 * Chemical Reactions - Data-Driven Bilateral Reaction System
 * 
 * Philosophy:
 * - Rules are data, not code (OCP: Open for extension, Closed for modification)
 * - BILATERAL: Both aggressor AND victim can transform
 * - Solves "infinite lava" problem (conservation of energy)
 * - Simple lookup: Aggressor -> Victim -> Result
 */

import { ElementType } from './types'

export interface Reaction {
  targetBecomes: ElementType | null   // What victim becomes (null = destroyed)
  sourceBecomes?: ElementType | null  // What aggressor becomes (undefined = unchanged, null = destroyed)
  chance: number                      // Probability 0.0 - 1.0
  spawn?: ElementType                 // Spawn additional particle (smoke, steam)
}

// Structure: Aggressor -> Victim -> Reaction Result
export const REACTIONS: Partial<Record<ElementType, Partial<Record<ElementType, Reaction>>>> = {
  
  // === FIRE ===
  fire: {
    wood: { 
      targetBecomes: 'fire',   // Wood catches fire
      sourceBecomes: 'smoke',  // Fire "burns out" into smoke
      chance: 0.1,             // 10% per frame
      spawn: 'smoke'
    },
    oil: {
      targetBecomes: 'fire',
      sourceBecomes: 'smoke',
      chance: 0.2,             // Oil burns fast
      spawn: 'smoke'
    },
    water: {
      targetBecomes: 'steam',
      sourceBecomes: null,     // Fire is EXTINGUISHED!
      chance: 0.5
    },
    ice: {
      targetBecomes: 'water',  // Ice melts
      sourceBecomes: null,     // Fire dies
      chance: 0.3,
      spawn: 'steam'
    },
    gunpowder: {
      targetBecomes: 'fire',   // EXPLODES!
      sourceBecomes: 'fire',   // Chain reaction - both become fire
      chance: 1.0,             // 100% instant ignition
      spawn: 'smoke'
    },
    // Огонь сжигает растения и семена
    plant: {
      targetBecomes: 'fire',
      sourceBecomes: 'smoke',
      chance: 0.1,
      spawn: 'smoke'
    },
    seed: {
      targetBecomes: 'fire',
      sourceBecomes: 'smoke',
      chance: 0.2
    }
  },
  
  // === LAVA ===
  lava: {
    water: {
      targetBecomes: 'steam',
      sourceBecomes: 'stone',  // Lava COOLS into stone!
      chance: 0.15,
      spawn: 'steam'
    },
    wood: {
      targetBecomes: 'fire',
      chance: 0.3,
      spawn: 'smoke'
    },
    oil: {
      targetBecomes: 'fire',
      chance: 0.4,
      spawn: 'smoke'
    },
    ice: {
      targetBecomes: 'steam',  // Ice instantly vaporizes
      sourceBecomes: 'stone',  // Lava cools
      chance: 0.3
    },
    gunpowder: {
      targetBecomes: 'fire',   // Lava ignites gunpowder
      chance: 1.0,
      spawn: 'smoke'
    },
    // Лава сжигает растения
    plant: {
      targetBecomes: 'fire',
      chance: 0.5,
      spawn: 'smoke'
    },
    dirt: {
      targetBecomes: 'stone',  // Земля спекается в камень
      chance: 0.05
    }
  },
  
  // === ACID ===
  acid: {
    stone: { 
      targetBecomes: null,     // Dissolves stone
      sourceBecomes: null,     // Acid consumed
      chance: 0.1, 
      spawn: 'smoke' 
    },
    metal: { 
      targetBecomes: null, 
      sourceBecomes: null, 
      chance: 0.05             // Metal resists better
    },
    wood: { 
      targetBecomes: null, 
      sourceBecomes: null, 
      chance: 0.2 
    },
    ice: {
      targetBecomes: 'water',  // Acid melts ice
      sourceBecomes: null,     // Acid consumed
      chance: 0.2
    },
    // Кислота растворяет органику
    plant: {
      targetBecomes: null,
      sourceBecomes: null,
      chance: 0.15
    },
    dirt: {
      targetBecomes: null,
      sourceBecomes: null,
      chance: 0.05
    }
  },
  
  // === WATER (reverse reactions) ===
  water: {
    lava: {
      targetBecomes: 'stone',  // Lava cools when water falls on it
      sourceBecomes: 'steam',  // Water evaporates
      chance: 0.15,
      spawn: 'steam'
    },
    fire: {
      targetBecomes: null,     // Fire is extinguished
      sourceBecomes: 'steam',  // Some water evaporates
      chance: 0.3
    }
  }
  
  // Future: acid, ice, etc.
}

/**
 * Quick lookup - does this element have any reactions?
 * Used for optimization (skip passive elements like stone)
 */
export function hasReactions(element: ElementType): boolean {
  return element in REACTIONS
}
