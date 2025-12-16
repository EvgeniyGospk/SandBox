import type { ElementCategory } from '../types'

export function categoryIdToName(cat: number): ElementCategory {
  const names: ElementCategory[] = ['solid', 'powder', 'liquid', 'gas', 'energy', 'utility', 'bio']
  return names[cat] || 'solid'
}

export function colorNumberToHex(color: number): string {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
