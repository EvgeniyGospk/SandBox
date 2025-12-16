/**
 * Core types for the particle simulation engine
 *
 * Single source of truth for element IDs/mappings is `generated_elements.ts`
 * (generated from `definitions/*.json` via `npm run codegen`).
 */

import type { CategoryId, ElementId, ElementType } from './data/generated_elements'

// =============================================================================
// CODEGEN RE-EXPORTS (single source of truth)
// =============================================================================

export {
  // Element IDs
  EL_EMPTY,
  EL_STONE,
  EL_SAND,
  EL_WOOD,
  EL_METAL,
  EL_ICE,
  EL_WATER,
  EL_OIL,
  EL_LAVA,
  EL_ACID,
  EL_STEAM,
  EL_SMOKE,
  EL_FIRE,
  EL_SPARK,
  EL_ELECTRICITY,
  EL_GUNPOWDER,
  EL_CLONE,
  EL_VOID,
  EL_DIRT,
  EL_SEED,
  EL_PLANT,
  ELEMENT_COUNT,

  // Category IDs
  CAT_SOLID,
  CAT_POWDER,
  CAT_LIQUID,
  CAT_GAS,
  CAT_ENERGY,
  CAT_UTILITY,
  CAT_BIO,

  // Mappings
  ELEMENT_NAME_TO_ID,
  ELEMENT_ID_TO_NAME,
  CATEGORY_NAME_TO_ID,
} from './data/generated_elements'

export type {
  ElementId,
  ElementType,
  CategoryId,
  CategoryType as ElementCategory,
} from './data/generated_elements'

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
