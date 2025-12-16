/**
 * Element definitions with all properties
 * Phase 1: Data-Oriented Design with numeric IDs
 * 
 * Elements are stored in a flat array indexed by ElementId
 * This allows O(1) access without hash lookups
 */

import { 
  ElementType, 
  ElementProperties,
  ElementCategory,
  CategoryId,
  ElementId,
  ELEMENT_COUNT,
  ELEMENT_ID_TO_NAME,
  // Element IDs
  EL_EMPTY, EL_STONE, EL_SAND, EL_WOOD, EL_METAL, EL_ICE,
  EL_WATER, EL_OIL, EL_LAVA, EL_ACID,
  EL_STEAM, EL_SMOKE,
  EL_FIRE, EL_SPARK, EL_ELECTRICITY,
  EL_GUNPOWDER, EL_CLONE, EL_VOID,
  EL_DIRT, EL_SEED, EL_PLANT,
  // Category IDs
  CAT_SOLID, CAT_POWDER, CAT_LIQUID, CAT_GAS, CAT_ENERGY, CAT_UTILITY, CAT_BIO
 } from './types'

 import { buildElementsRecord } from './elements/elementsRecord'
 import { createColorByIdGetter } from './elements/colorById'
 import { getCategoryIdFromData, getDensityFromData, getDispersionFromData, getElementFromData } from './elements/lookups'
 import { rgba as rgbaImpl } from './elements/rgba'
 import {
   createLegacyColorWithVariationGetter,
   createLegacyElementCategoryGetter,
   createLegacyElementColorGetter,
 } from './elements/legacyLookups'

 // Color helper - convert hex string to packed RGBA
 function rgba(hex: string, alpha = 255): number {
   return rgbaImpl(hex, alpha)
 }

// ============================================
// ELEMENT DATA - Flat array indexed by ElementId
// ============================================
export const ELEMENT_DATA: ElementProperties[] = [
  // 0: Empty
  {
    id: EL_EMPTY,
    name: 'Empty',
    category: CAT_SOLID,
    color: rgba('#0a0a0a'),
    density: 0,
    flammable: false,
    conductive: false,
    lifetime: 0,
    dispersion: 0,
    defaultTemp: 20,
    heatConductivity: 5,
  },
  // 1: Stone
  {
    id: EL_STONE,
    name: 'Stone',
    category: CAT_SOLID,
    color: rgba('#808080'),
    density: 2500,
    flammable: false,
    conductive: false,
    lifetime: 0,
    dispersion: 0,
    defaultTemp: 20,
    heatConductivity: 10,
    phaseChange: { high: { temp: 900, to: EL_LAVA } },
  },
  // 2: Sand
  {
    id: EL_SAND,
    name: 'Sand',
    category: CAT_POWDER,
    color: rgba('#C2B280'),
    density: 1600,
    flammable: false,
    conductive: false,
    lifetime: 0,
    dispersion: 0,
    defaultTemp: 20,
    heatConductivity: 15,
    phaseChange: { high: { temp: 1700, to: EL_LAVA } },
  },
  // 3: Wood
  {
    id: EL_WOOD,
    name: 'Wood',
    category: CAT_SOLID,
    color: rgba('#8B4513'),
    density: 600,
    flammable: true,
    conductive: false,
    lifetime: 0,
    dispersion: 0,
    defaultTemp: 20,
    heatConductivity: 5,
  },
  // 4: Metal
  {
    id: EL_METAL,
    name: 'Metal',
    category: CAT_SOLID,
    color: rgba('#A9A9A9'),
    density: 7800,
    flammable: false,
    conductive: true,
    lifetime: 0,
    dispersion: 0,
    defaultTemp: 20,
    heatConductivity: 90,
    phaseChange: { high: { temp: 1500, to: EL_LAVA } },
  },
  // 5: Ice
  {
    id: EL_ICE,
    name: 'Ice',
    category: CAT_SOLID,
    color: rgba('#A5F2F3'),
    density: 916,
    flammable: false,
    conductive: false,
    lifetime: 0,
    dispersion: 0,
    defaultTemp: -10,
    heatConductivity: 20,
    phaseChange: { high: { temp: 0, to: EL_WATER } },
  },
  // 6: Water
  {
    id: EL_WATER,
    name: 'Water',
    category: CAT_LIQUID,
    color: rgba('#4169E1'),
    density: 1000,
    flammable: false,
    conductive: true,
    lifetime: 0,
    dispersion: 8,
    defaultTemp: 20,
    heatConductivity: 40,
    phaseChange: {
      high: { temp: 100, to: EL_STEAM },
      low: { temp: 0, to: EL_ICE }
    },
  },
  // 7: Oil
  {
    id: EL_OIL,
    name: 'Oil',
    category: CAT_LIQUID,
    color: rgba('#4A4A2A'),
    density: 800,
    flammable: true,
    conductive: false,
    lifetime: 0,
    dispersion: 5,
    defaultTemp: 20,
    heatConductivity: 15,
  },
  // 8: Lava
  {
    id: EL_LAVA,
    name: 'Lava',
    category: CAT_LIQUID,
    color: rgba('#FF4500'),
    density: 2500,
    flammable: false,
    conductive: false,
    lifetime: 0,
    dispersion: 2,
    defaultTemp: 1000,
    heatConductivity: 30,
    phaseChange: { low: { temp: 700, to: EL_STONE } },
  },
  // 9: Acid
  {
    id: EL_ACID,
    name: 'Acid',
    category: CAT_LIQUID,
    color: rgba('#39FF14'),
    density: 1050,
    flammable: false,
    conductive: true,
    lifetime: 0,
    dispersion: 5,
    defaultTemp: 20,
    heatConductivity: 35,
  },
  // 10: Steam
  {
    id: EL_STEAM,
    name: 'Steam',
    category: CAT_GAS,
    color: rgba('#E0E0E0', 180),
    density: 0.6,
    flammable: false,
    conductive: false,
    lifetime: 0,
    dispersion: 6,
    defaultTemp: 100,
    heatConductivity: 10,
    phaseChange: { low: { temp: 90, to: EL_WATER } },
  },
  // 11: Smoke
  {
    id: EL_SMOKE,
    name: 'Smoke',
    category: CAT_GAS,
    color: rgba('#3F3F3F', 200),
    density: 1.1,
    flammable: false,
    conductive: false,
    lifetime: 0,
    dispersion: 4,
    defaultTemp: 50,
    heatConductivity: 5,
  },
  // 12: Fire
  {
    id: EL_FIRE,
    name: 'Fire',
    category: CAT_ENERGY,
    color: rgba('#FF6600'),
    density: 0.3,
    flammable: false,
    conductive: false,
    lifetime: 60,
    dispersion: 0,
    defaultTemp: 800,
    heatConductivity: 50,
  },
  // 13: Spark
  {
    id: EL_SPARK,
    name: 'Spark',
    category: CAT_ENERGY,
    color: rgba('#FFFF00'),
    density: 0.1,
    flammable: false,
    conductive: false,
    lifetime: 10,
    dispersion: 0,
    defaultTemp: 500,
    heatConductivity: 50,
  },
  // 14: Electricity
  {
    id: EL_ELECTRICITY,
    name: 'Electric',
    category: CAT_ENERGY,
    color: rgba('#00FFFF'),
    density: 0,
    flammable: false,
    conductive: false,
    lifetime: 3,
    dispersion: 0,
    defaultTemp: 200,
    heatConductivity: 80,
  },
  // 15: Gunpowder
  {
    id: EL_GUNPOWDER,
    name: 'Gunpowder',
    category: CAT_POWDER,
    color: rgba('#404040'),
    density: 1400,
    flammable: true,
    conductive: false,
    lifetime: 0,
    dispersion: 0,
    defaultTemp: 20,
    heatConductivity: 10,
  },
  // 16: Clone
  {
    id: EL_CLONE,
    name: 'Clone',
    category: CAT_UTILITY,
    color: rgba('#00FF00'),
    density: Infinity,
    flammable: false,
    conductive: false,
    lifetime: 0,
    dispersion: 0,
    defaultTemp: 20,
    heatConductivity: 0,
  },
  // 17: Void
  {
    id: EL_VOID,
    name: 'Void',
    category: CAT_UTILITY,
    color: rgba('#000000'),
    density: Infinity,
    flammable: false,
    conductive: false,
    lifetime: 0,
    dispersion: 0,
    defaultTemp: 20,
    heatConductivity: 0,
  },
  // 18: Dirt
  {
    id: EL_DIRT,
    name: 'Dirt',
    category: CAT_POWDER,
    color: rgba('#5C4033'),
    density: 1200,
    flammable: false,
    conductive: false,
    lifetime: 0,
    dispersion: 0,
    defaultTemp: 20,
    heatConductivity: 10,
  },
  // 19: Seed
  {
    id: EL_SEED,
    name: 'Seed',
    category: CAT_BIO,
    color: rgba('#E2C489'),
    density: 1100,
    flammable: true,
    conductive: false,
    lifetime: 0,
    dispersion: 0,
    defaultTemp: 20,
    heatConductivity: 5,
  },
  // 20: Plant
  {
    id: EL_PLANT,
    name: 'Plant',
    category: CAT_BIO,
    color: rgba('#228B22'),
    density: 900,
    flammable: true,
    conductive: false,
    lifetime: 0,
    dispersion: 0,
    defaultTemp: 20,
    heatConductivity: 10,
  },
]

// ============================================
// LEGACY COMPATIBILITY - Record<ElementType, ElementProperties>
// ============================================
export const ELEMENTS: Record<ElementType, ElementProperties> = buildElementsRecord({
  elementData: ELEMENT_DATA,
  elementCount: ELEMENT_COUNT,
  idToName: ELEMENT_ID_TO_NAME,
})

// ============================================
// FAST LOOKUP FUNCTIONS (use numeric IDs)
// ============================================

 // Get element properties by numeric ID - O(1), no hash lookup!
 export function getElement(id: ElementId): ElementProperties {
   return getElementFromData({ elementData: ELEMENT_DATA, id, emptyId: EL_EMPTY })
 }

 // Get category by element ID
 export function getCategoryById(id: ElementId): CategoryId {
   return getCategoryIdFromData({ elementData: ELEMENT_DATA, id, defaultCategory: CAT_SOLID })
 }

 // Get density by element ID
 export function getDensityById(id: ElementId): number {
   return getDensityFromData({ elementData: ELEMENT_DATA, id })
 }

 // Get dispersion by element ID
 export function getDispersionById(id: ElementId): number {
   return getDispersionFromData({ elementData: ELEMENT_DATA, id })
 }

 // ============================================
 // COLOR VARIATIONS (pre-computed per element)
 // ============================================
 const getColorByIdInternal = createColorByIdGetter({ elementData: ELEMENT_DATA, elementCount: ELEMENT_COUNT })

 // Get color variation by element ID - super fast!
 export function getColorById(id: ElementId, seed: number): number {
   return getColorByIdInternal(id, seed)
 }

 // ============================================
 // LEGACY FUNCTIONS (use string ElementType)
 // ============================================
 const getColorWithVariationInternal = createLegacyColorWithVariationGetter({
   getBaseColor: (element) => ELEMENTS[element].color,
 })
 const getElementCategoryInternal = createLegacyElementCategoryGetter({
   getCategoryId: (element) => ELEMENTS[element].category,
 })
 const getElementColorInternal = createLegacyElementColorGetter({
   getColor: (element) => ELEMENTS[element].color,
 })

 export function getColorWithVariation(element: ElementType, seed: number): number {
   return getColorWithVariationInternal(element, seed)
 }

 export function getElementCategory(element: ElementType): ElementCategory {
   return getElementCategoryInternal(element)
 }

 export function getElementColor(element: ElementType): string {
   return getElementColorInternal(element)
 }
