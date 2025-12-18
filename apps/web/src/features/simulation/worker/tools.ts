import type { ElementId } from '@/features/simulation/engine/api/types'
import { debugWarn, logError } from '@/platform/logging/log'

import type { WorkerContext } from './context'

import { updateMemoryViews, applyCurrentSettingsToEngine } from './memory'

const FILL_LIMIT = 200_000

export function captureSnapshot(ctx: WorkerContext): ArrayBuffer | null {
  const state = ctx.state
  if (state.sim.isCrashed || !state.memory.manager || !state.wasm.engine) return null

  try {
    if (!state.memory.manager.isValid) {
      debugWarn('⚠️ captureSnapshot: Memory not valid, skipping')
      return null
    }
    const types = state.memory.manager.types
    return new Uint8Array(types).buffer
  } catch (e) {
    logError('captureSnapshot failed:', e)
    return null
  }
}

export function loadSnapshotBuffer(ctx: WorkerContext, buffer: ArrayBuffer): void {
  const state = ctx.state
  if (!state.wasm.engine || !state.wasm.module) return

  const types = new Uint8Array(buffer)
  const width = state.wasm.engine.width as number
  const height = state.wasm.engine.height as number
  const expected = width * height
  if (types.length !== expected) {
    debugWarn('Snapshot size mismatch, skipping load')
    return
  }

  state.wasm.engine = new state.wasm.module.World(width, height)
  applyCurrentSettingsToEngine(ctx)
  state.input.lastX = null
  state.input.lastY = null
  updateMemoryViews(ctx)

  for (let i = 0; i < types.length; i++) {
    const elId = types[i]
    if (elId === 0) continue
    const x = i % width
    const y = Math.floor(i / width)
    state.wasm.engine.add_particle(x, y, elId)
  }

  if (state.render.renderer) state.render.renderer.requestFullUpload()
}

export function readElementAt(ctx: WorkerContext, x: number, y: number): ElementId | null {
  const state = ctx.state
  if (!state.memory.manager || !state.wasm.engine) return null

  const width = state.wasm.engine.width as number
  const height = state.wasm.engine.height as number
  if (x < 0 || y < 0 || x >= width || y >= height) return null

  let types: Uint8Array
  try {
    types = state.memory.manager.types
  } catch {
    return null
  }
  const idx = y * width + x
  const elId = types[idx] ?? 0
  return (Math.max(0, Math.min(255, Math.floor(elId))) as ElementId) ?? null
}

export function floodFill(ctx: WorkerContext, startX: number, startY: number, targetElementId: number): void {
  const state = ctx.state
  if (!state.memory.manager || !state.wasm.engine) return

  const width = state.wasm.engine.width as number
  const height = state.wasm.engine.height as number
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return

  let types: Uint8Array
  try {
    types = state.memory.manager.types
  } catch (e) {
    debugWarn('floodFill: memory views unavailable:', e)
    return
  }

  const startIdx = startY * width + startX
  const sourceId = types[startIdx] ?? 0
  if (sourceId === targetElementId) return

  const len = width * height
  if (!state.fill.visited || state.fill.visited.length !== len) {
    state.fill.visited = new Int32Array(len)
    state.fill.stamp = 1
  } else {
    state.fill.stamp += 1
    if (state.fill.stamp >= 0x7fffffff) {
      state.fill.visited.fill(0)
      state.fill.stamp = 1
    }
  }

  const stamp = state.fill.stamp
  const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }]
  let processed = 0

  while (stack.length > 0) {
    const { x, y } = stack.pop() as { x: number; y: number }
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const idx = y * width + x
    if (state.fill.visited[idx] === stamp) continue
    if (types[idx] !== sourceId) continue

    state.fill.visited[idx] = stamp
    processed++
    if (processed > FILL_LIMIT) break

    if (targetElementId === 0) {
      state.wasm.engine.remove_particle(x, y)
    } else {
      state.wasm.engine.remove_particle(x, y)
      state.wasm.engine.add_particle(x, y, targetElementId)
    }

    stack.push({ x: x + 1, y })
    stack.push({ x: x - 1, y })
    stack.push({ x, y: y + 1 })
    stack.push({ x, y: y - 1 })
  }
}

export function spawnRigidBody(
  ctx: WorkerContext,
  x: number,
  y: number,
  size: number,
  shape: 'box' | 'circle',
  elementId: number
): void {
  const state = ctx.state
  if (!state.wasm.engine) return

  if (shape === 'circle') {
    state.wasm.engine.spawn_rigid_circle(x, y, Math.floor(size / 2), elementId)
  } else {
    state.wasm.engine.spawn_rigid_body(x, y, size, size, elementId)
  }
}

export const __internal = {
  FILL_LIMIT,
}
