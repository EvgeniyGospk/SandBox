/**
 * UI-facing element definitions for LeftPanel
 */

import type { ElementType } from '@/features/simulation/engine'

export type { ElementType }

export interface Element {
  id: ElementType
  name: string
  category: string
  color: string
  description: string
}

export const ELEMENT_CATEGORIES: Record<string, string> = {
  solids: 'Solids',
  liquids: 'Liquids',
  gases: 'Gases',
  energy: 'Energy',
  utility: 'Utility',
  bio: 'Nature',
}

export const ELEMENTS: Element[] = [
  // Solids
  {
    id: 'stone',
    name: 'Stone',
    category: 'solids',
    color: '#808080',
    description: 'Heavy solid, melts at high temperature',
  },
  {
    id: 'sand',
    name: 'Sand',
    category: 'solids',
    color: '#C2B280',
    description: 'Falls and piles up, melts into glass',
  },
  {
    id: 'wood',
    name: 'Wood',
    category: 'solids',
    color: '#8B4513',
    description: 'Flammable solid',
  },
  {
    id: 'metal',
    name: 'Metal',
    category: 'solids',
    color: '#A9A9A9',
    description: 'Conducts heat and electricity',
  },
  {
    id: 'ice',
    name: 'Ice',
    category: 'solids',
    color: '#A5F2F3',
    description: 'Melts from fire/lava, floats on water',
  },
  {
    id: 'gunpowder',
    name: 'Gunpowder',
    category: 'solids',
    color: '#404040',
    description: 'Explosive! Ignites instantly from fire',
  },
  
  // Liquids
  {
    id: 'water',
    name: 'Water',
    category: 'liquids',
    color: '#4169E1',
    description: 'Flows, evaporates, extinguishes fire',
  },
  {
    id: 'oil',
    name: 'Oil',
    category: 'liquids',
    color: '#4A4A2A',
    description: 'Flammable liquid, floats on water',
  },
  {
    id: 'lava',
    name: 'Lava',
    category: 'liquids',
    color: '#FF4500',
    description: 'Hot liquid, ignites flammables',
  },
  {
    id: 'acid',
    name: 'Acid',
    category: 'liquids',
    color: '#39FF14',
    description: 'Dissolves stone, metal, wood (1:1)',
  },
  
  // Gases
  {
    id: 'steam',
    name: 'Steam',
    category: 'gases',
    color: '#E0E0E0',
    description: 'Rises up, condenses into water',
  },
  {
    id: 'smoke',
    name: 'Smoke',
    category: 'gases',
    color: '#2F2F2F',
    description: 'Rises and dissipates',
  },
  
  // Energy
  {
    id: 'fire',
    name: 'Fire',
    category: 'energy',
    color: '#FF6600',
    description: 'Burns flammables, extinguished by water',
  },
  {
    id: 'spark',
    name: 'Spark',
    category: 'energy',
    color: '#FFFF00',
    description: 'Brief ignition source',
  },
  {
    id: 'electricity',
    name: 'Electric',
    category: 'energy',
    color: '#00FFFF',
    description: 'Flows through conductors',
  },
  
  // Utility
  {
    id: 'clone',
    name: 'Clone',
    category: 'utility',
    color: '#00FF00',
    description: 'Duplicates touching particles',
  },
  {
    id: 'void',
    name: 'Void',
    category: 'utility',
    color: '#000000',
    description: 'Destroys all particles',
  },
  
  // Nature/Bio
  {
    id: 'dirt',
    name: 'Dirt',
    category: 'bio',
    color: '#5C4033',
    description: 'Fertile soil for plants',
  },
  {
    id: 'seed',
    name: 'Seed',
    category: 'bio',
    color: '#E2C489',
    description: 'Plant on wet dirt to grow!',
  },
  {
    id: 'plant',
    name: 'Plant',
    category: 'bio',
    color: '#228B22',
    description: 'Grows with water, burns easily',
  },
]

export function getElementById(id: ElementType): Element | undefined {
  return ELEMENTS.find(el => el.id === id)
}

export function getElementColor(id: ElementType): string {
  return getElementById(id)?.color ?? '#FFFFFF'
}
