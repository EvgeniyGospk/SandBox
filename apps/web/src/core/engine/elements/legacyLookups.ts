import type { ElementCategory, ElementType } from '../types'
import { computeColorVariations } from './colorVariations'
import { categoryIdToName, colorNumberToHex } from './legacy'

export function createLegacyColorWithVariationGetter(args: {
  getBaseColor: (element: ElementType) => number
}): (element: ElementType, seed: number) => number {
  const { getBaseColor } = args

  const cache = new Map<ElementType, Uint32Array>()

  return (element: ElementType, seed: number): number => {
    let variations = cache.get(element)

    if (!variations) {
      const base = getBaseColor(element)
      variations = computeColorVariations(base)
      cache.set(element, variations)
    }

    return variations[seed & 31]
  }
}

export function createLegacyElementCategoryGetter(args: {
  getCategoryId: (element: ElementType) => number
}): (element: ElementType) => ElementCategory {
  const { getCategoryId } = args

  return (element: ElementType): ElementCategory => {
    const cat = getCategoryId(element)
    return categoryIdToName(cat)
  }
}

export function createLegacyElementColorGetter(args: {
  getColor: (element: ElementType) => number
}): (element: ElementType) => string {
  const { getColor } = args

  return (element: ElementType): string => {
    const color = getColor(element)
    return colorNumberToHex(color)
  }
}
