import type { ElementType } from '../../types'

import { postSpawnRigidBody } from '../bridge'

export function spawnRigidBody(args: {
  worker: Worker | null
  x: number
  y: number
  size: number
  shape: 'box' | 'circle'
  element: ElementType
}): void {
  postSpawnRigidBody(args.worker, {
    x: args.x,
    y: args.y,
    size: args.size,
    shape: args.shape,
    element: args.element,
  })
}
