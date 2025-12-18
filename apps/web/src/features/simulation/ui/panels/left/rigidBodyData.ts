import type { ElementId } from '@/features/simulation/engine/api/types'
import { EL_ICE, EL_METAL, EL_STONE, EL_WOOD } from '@/features/simulation/engine/api/types'
import { Circle, Square } from 'lucide-react'

export const RIGID_BODY_SHAPES = [
  { id: 'box', name: 'Box', icon: Square, description: 'Rectangular rigid body' },
  { id: 'circle', name: 'Ball', icon: Circle, description: 'Circular rigid body' },
] as const

export const RIGID_BODY_MATERIALS = [
  { id: EL_STONE, name: 'Stone', color: '#808080' },
  { id: EL_METAL, name: 'Metal', color: '#A9A9A9' },
  { id: EL_WOOD, name: 'Wood', color: '#8B4513' },
  { id: EL_ICE, name: 'Ice', color: '#A5F2F3' },
] as const satisfies ReadonlyArray<{ id: ElementId; name: string; color: string }>
