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

// Color helper - convert hex string to packed RGBA
function rgba(hex: string, alpha = 255): number {
  const num = parseInt(hex.replace('#', ''), 16)
  return (alpha << 24) | num
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
export const ELEMENTS: Record<ElementType, ElementProperties> = {} as Record<ElementType, ElementProperties>

// Build ELEMENTS from ELEMENT_DATA
for (let i = 0; i < ELEMENT_COUNT; i++) {
  const name = ELEMENT_ID_TO_NAME[i]
  if (name) {
    ELEMENTS[name] = ELEMENT_DATA[i]
  }
}

// ============================================
// FAST LOOKUP FUNCTIONS (use numeric IDs)
// ============================================

// Get element properties by numeric ID - O(1), no hash lookup!
export function getElement(id: ElementId): ElementProperties {
  return ELEMENT_DATA[id] || ELEMENT_DATA[EL_EMPTY]
}

// Get category by element ID
export function getCategoryById(id: ElementId): CategoryId {
  return ELEMENT_DATA[id]?.category ?? CAT_SOLID
}

// Get density by element ID
export function getDensityById(id: ElementId): number {
  return ELEMENT_DATA[id]?.density ?? 0
}

// Get dispersion by element ID
export function getDispersionById(id: ElementId): number {
  return ELEMENT_DATA[id]?.dispersion ?? 0
}

// ============================================
// COLOR VARIATIONS (pre-computed per element)
// ============================================
const COLOR_VARIATIONS_BY_ID: Uint32Array[] = new Array(ELEMENT_COUNT)

// Pre-compute all color variations at load time!
for (let elId = 0; elId < ELEMENT_COUNT; elId++) {
  const base = ELEMENT_DATA[elId].color
  const variations = new Uint32Array(32)
  
  for (let i = 0; i < 32; i++) {
    const variation = (i - 16) * 2
    const a = (base >> 24) & 0xFF
    const r = Math.max(0, Math.min(255, ((base >> 16) & 0xFF) + variation))
    const g = Math.max(0, Math.min(255, ((base >> 8) & 0xFF) + variation))
    const b = Math.max(0, Math.min(255, (base & 0xFF) + variation))
    variations[i] = (a << 24) | (r << 16) | (g << 8) | b
  }
  
  COLOR_VARIATIONS_BY_ID[elId] = variations
}

// Get color variation by element ID - super fast!
export function getColorById(id: ElementId, seed: number): number {
  return COLOR_VARIATIONS_BY_ID[id][seed & 31]
}

// ============================================
// LEGACY FUNCTIONS (use string ElementType)
// ============================================
const COLOR_VARIATIONS = new Map<ElementType, Uint32Array>()

export function getColorWithVariation(element: ElementType, seed: number): number {
  let variations = COLOR_VARIATIONS.get(element)
  
  if (!variations) {
    const base = ELEMENTS[element].color
    variations = new Uint32Array(32)
    
    for (let i = 0; i < 32; i++) {
      const variation = (i - 16) * 2
      const a = (base >> 24) & 0xFF
      const r = Math.max(0, Math.min(255, ((base >> 16) & 0xFF) + variation))
      const g = Math.max(0, Math.min(255, ((base >> 8) & 0xFF) + variation))
      const b = Math.max(0, Math.min(255, (base & 0xFF) + variation))
      variations[i] = (a << 24) | (r << 16) | (g << 8) | b
    }
    
    COLOR_VARIATIONS.set(element, variations)
  }
  
  return variations[seed & 31]
}

export function getElementCategory(element: ElementType): ElementCategory {
  const cat = ELEMENTS[element].category
  // Convert numeric category back to string for legacy code
  const names: ElementCategory[] = ['solid', 'powder', 'liquid', 'gas', 'energy', 'utility', 'bio']
  return names[cat] || 'solid'
}

export function getElementColor(element: ElementType): string {
  const color = ELEMENTS[element].color
  const r = (color >> 16) & 0xFF
  const g = (color >> 8) & 0xFF
  const b = color & 0xFF
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
