import type { ElementType } from '../../api/types'
import { ELEMENT_NAME_TO_ID } from '../../api/types'
import type { WasmWorld } from '../types'

export function spawnRigidBody(args: {
  world: WasmWorld
  x: number
  y: number
  w: number
  h: number
  element: ElementType
}): number {
  const { world, x, y, w, h, element } = args
  const wasmId = ELEMENT_NAME_TO_ID[element] || ELEMENT_NAME_TO_ID.stone
  return world.spawn_rigid_body(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h), wasmId)
}

export function spawnRigidCircle(args: {
  world: WasmWorld
  x: number
  y: number
  radius: number
  element: ElementType
}): number {
  const { world, x, y, radius, element } = args
  const wasmId = ELEMENT_NAME_TO_ID[element] || ELEMENT_NAME_TO_ID.stone
  return world.spawn_rigid_circle(Math.floor(x), Math.floor(y), Math.floor(radius), wasmId)
}

export function removeRigidBody(world: WasmWorld, id: number): void {
  world.remove_rigid_body(id)
}

export function rigidBodyCount(world: WasmWorld): number {
  return world.rigid_body_count()
}
