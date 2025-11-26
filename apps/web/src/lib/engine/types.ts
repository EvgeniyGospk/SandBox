/**
 * Core types for the particle simulation engine
 * Phase 1: Data-Oriented Design with TypedArrays
 * 
 * Key changes:
 * - ElementId is now a number (Uint8) for TypedArray storage
 * - No more Particle objects - data stored in SoA (Structure of Arrays)
 * - Zero GC pressure during simulation
 */

// ============================================
// ELEMENT IDS - Numeric constants for TypedArrays
// ============================================
export const EL_EMPTY       = 0
export const EL_STONE       = 1
export const EL_SAND        = 2
export const EL_WOOD        = 3
export const EL_METAL       = 4
export const EL_ICE         = 5
export const EL_WATER       = 6
export const EL_OIL         = 7
export const EL_LAVA        = 8
export const EL_ACID        = 9
export const EL_STEAM       = 10
export const EL_SMOKE       = 11
export const EL_FIRE        = 12
export const EL_SPARK       = 13
export const EL_ELECTRICITY = 14
export const EL_GUNPOWDER   = 15
export const EL_CLONE       = 16
export const EL_VOID        = 17
export const EL_DIRT        = 18
export const EL_SEED        = 19
export const EL_PLANT       = 20

export const ELEMENT_COUNT  = 21

// ElementId type - the numeric ID
export type ElementId = number

// Legacy string type for backwards compatibility during transition
export type ElementType = 
  | 'empty'
  | 'stone' | 'sand' | 'wood' | 'metal' | 'ice'
  | 'water' | 'oil' | 'lava' | 'acid'
  | 'steam' | 'smoke'
  | 'fire' | 'spark' | 'electricity'
  | 'gunpowder'
  | 'clone' | 'void'
  | 'dirt' | 'seed' | 'plant'

// String to ID mapping
export const ELEMENT_NAME_TO_ID: Record<ElementType, ElementId> = {
  empty: EL_EMPTY,
  stone: EL_STONE,
  sand: EL_SAND,
  wood: EL_WOOD,
  metal: EL_METAL,
  ice: EL_ICE,
  water: EL_WATER,
  oil: EL_OIL,
  lava: EL_LAVA,
  acid: EL_ACID,
  steam: EL_STEAM,
  smoke: EL_SMOKE,
  fire: EL_FIRE,
  spark: EL_SPARK,
  electricity: EL_ELECTRICITY,
  gunpowder: EL_GUNPOWDER,
  clone: EL_CLONE,
  void: EL_VOID,
  dirt: EL_DIRT,
  seed: EL_SEED,
  plant: EL_PLANT,
}

// ID to string mapping (for debugging/UI)
export const ELEMENT_ID_TO_NAME: ElementType[] = [
  'empty', 'stone', 'sand', 'wood', 'metal', 'ice',
  'water', 'oil', 'lava', 'acid',
  'steam', 'smoke',
  'fire', 'spark', 'electricity',
  'gunpowder',
  'clone', 'void',
  'dirt', 'seed', 'plant'
]

// ============================================
// CATEGORY IDS - Numeric for fast comparison
// ============================================
export const CAT_SOLID   = 0
export const CAT_POWDER  = 1
export const CAT_LIQUID  = 2
export const CAT_GAS     = 3
export const CAT_ENERGY  = 4
export const CAT_UTILITY = 5
export const CAT_BIO     = 6

export type CategoryId = number
export type ElementCategory = 'solid' | 'powder' | 'liquid' | 'gas' | 'energy' | 'utility' | 'bio'

export const CATEGORY_NAME_TO_ID: Record<ElementCategory, CategoryId> = {
  solid: CAT_SOLID,
  powder: CAT_POWDER,
  liquid: CAT_LIQUID,
  gas: CAT_GAS,
  energy: CAT_ENERGY,
  utility: CAT_UTILITY,
  bio: CAT_BIO,
}

// ============================================
// ELEMENT PROPERTIES - Flat arrays for cache efficiency
// ============================================
export interface PhaseChange {
  high?: { temp: number; to: ElementId }
  low?: { temp: number; to: ElementId }
}

export interface ElementProperties {
  id: ElementId
  name: string
  category: CategoryId
  color: number
  density: number
  flammable: boolean
  conductive: boolean
  lifetime: number
  dispersion: number
  defaultTemp: number
  heatConductivity: number
  phaseChange?: PhaseChange
}

// ============================================
// WORLD SETTINGS
// ============================================
export interface WorldSettings {
  gravity: { x: number; y: number }
  ambientTemperature: number
  speed: number
}

// ============================================
// LEGACY INTERFACES (for gradual migration)
// ============================================
export interface Particle {
  element: ElementType
  color: number
  updated: boolean
  lifetime: number
}

export interface IRenderer {
  render(types: Uint8Array, colors: Uint32Array): void
  resize(width: number, height: number): void
}

export interface ISimulation {
  step(): void
  addParticle(x: number, y: number, element: ElementType): boolean
  removeParticle(x: number, y: number): boolean
  clear(): void
  resize(width: number, height: number): void
  readonly particleCount: number
  readonly width: number
  readonly height: number
}

// ============================================
// RENDER & TOOL TYPES
// ============================================
export type RenderMode = 'normal' | 'thermal'
export type ToolType = 'brush' | 'eraser' | 'pipette' | 'fill' | 'move'
