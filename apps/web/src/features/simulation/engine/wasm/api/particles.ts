import type { ElementType } from '../../api/types'
import { ELEMENT_NAME_TO_ID } from '../../api/types'
import type { WasmWorld } from '../types'

export function addParticle(args: { world: WasmWorld; x: number; y: number; element: ElementType }): boolean {
  const { world, x, y, element } = args
  const wasmId = ELEMENT_NAME_TO_ID[element]
  if (wasmId === 0) return false
  return world.add_particle(Math.floor(x), Math.floor(y), wasmId)
}

export function addParticlesInRadius(args: {
  world: WasmWorld
  cx: number
  cy: number
  radius: number
  element: ElementType
}): void {
  const { world, cx, cy, radius, element } = args
  const wasmId = ELEMENT_NAME_TO_ID[element]
  if (wasmId === 0) return
  world.add_particles_in_radius(Math.floor(cx), Math.floor(cy), Math.floor(radius), wasmId)
}

export function removeParticle(args: { world: WasmWorld; x: number; y: number }): boolean {
  const { world, x, y } = args
  return world.remove_particle(Math.floor(x), Math.floor(y))
}

export function removeParticlesInRadius(args: { world: WasmWorld; cx: number; cy: number; radius: number }): void {
  const { world, cx, cy, radius } = args
  world.remove_particles_in_radius(Math.floor(cx), Math.floor(cy), Math.floor(radius))
}
