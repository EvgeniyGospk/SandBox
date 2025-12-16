import type { ElementType } from '@/core/engine'
import { Circle, Square } from 'lucide-react'

export const RIGID_BODY_SHAPES = [
  { id: 'box', name: 'Box', icon: Square, description: 'Rectangular rigid body' },
  { id: 'circle', name: 'Ball', icon: Circle, description: 'Circular rigid body' },
] as const

export const RIGID_BODY_MATERIALS = [
  { id: 'stone', name: 'Stone', color: '#808080' },
  { id: 'metal', name: 'Metal', color: '#A9A9A9' },
  { id: 'wood', name: 'Wood', color: '#8B4513' },
  { id: 'ice', name: 'Ice', color: '#A5F2F3' },
] as const satisfies ReadonlyArray<{ id: ElementType; name: string; color: string }>
