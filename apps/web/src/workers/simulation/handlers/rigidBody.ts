import type { ElementType } from '../../../core/engine/types'
import { state, ELEMENT_MAP } from '../state'
import { spawnRigidBody } from '../tools'

export function handleSpawnRigidBody(msg: {
  type: 'SPAWN_RIGID_BODY'
  x: number
  y: number
  size: number
  shape: 'box' | 'circle'
  element: ElementType
}): void {
  if (!state.engine) return
  const elementId = ELEMENT_MAP[msg.element] ?? 1
  spawnRigidBody(msg.x, msg.y, msg.size, msg.shape, elementId)
}
