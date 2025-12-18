/**
 * UI-facing element definitions for LeftPanel
 */

import { ELEMENT_DATA, UI_CATEGORIES } from '@/core/engine/generated_elements'
import type { ElementId } from '@/features/simulation/engine/api/types'

export interface Element {
  id: ElementId
  name: string
  category: string
  color: string
  description: string
}

export const ELEMENT_CATEGORIES: Record<string, string> = Object.fromEntries(
  [...UI_CATEGORIES]
    .sort((a, b) => a.sort - b.sort)
    .map((c) => [c.key, c.label]),
)

const UI_CATEGORY_SORT: Record<string, number> = Object.fromEntries(
  [...UI_CATEGORIES].map((c) => [c.key, c.sort]),
)

function colorNumberToHex(color: number): string {
  // colors are stored as 0xAARRGGBB
  const rrggbb = (color & 0xffffff).toString(16).padStart(6, '0')
  return `#${rrggbb.toUpperCase()}`
}

export const ELEMENTS: Element[] = [...ELEMENT_DATA]
  .filter((e) => !e.hidden && !e.ui?.hidden)
  .filter((e) => e.ui)
  .map((e) => {
    const ui = e.ui!
    return {
      id: e.id,
      name: ui.displayName,
      category: ui.category,
      color: colorNumberToHex(e.color),
      description: ui.description,
    }
  })
  .sort((a, b) => {
    const aSort = ELEMENT_DATA.find((e) => e.id === a.id)?.ui?.sort ?? 0
    const bSort = ELEMENT_DATA.find((e) => e.id === b.id)?.ui?.sort ?? 0
    const aCatSort = UI_CATEGORY_SORT[a.category] ?? 0
    const bCatSort = UI_CATEGORY_SORT[b.category] ?? 0
    if (aCatSort !== bCatSort) return aCatSort - bCatSort
    return aSort - bSort
  })

export function getElementById(id: ElementId): Element | undefined {
  return ELEMENTS.find(el => el.id === id)
}

export function getElementColor(id: ElementId): string {
  return getElementById(id)?.color ?? '#FFFFFF'
}
