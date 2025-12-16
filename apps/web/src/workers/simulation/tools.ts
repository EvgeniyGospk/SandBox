import type { ElementType } from '../../core/engine/types'

import { ELEMENT_ID_TO_NAME } from '../../core/engine/data/generated_elements'
import { debugWarn, logError } from '../../core/logging/log'

import { state } from './state'
import { updateMemoryViews, applyCurrentSettingsToEngine } from './memory'

const FILL_LIMIT = 200_000

export function captureSnapshot(): ArrayBuffer | null {
  if (state.isCrashed || !state.memoryManager || !state.engine) return null

  try {
    if (!state.memoryManager.isValid) {
      debugWarn('⚠️ captureSnapshot: Memory not valid, skipping')
      return null
    }
    const types = state.memoryManager.types
    return new Uint8Array(types).buffer
  } catch (e) {
    logError('captureSnapshot failed:', e)
    return null
  }
}

export function loadSnapshotBuffer(buffer: ArrayBuffer): void {
  if (!state.engine || !state.wasmModule) return

  const types = new Uint8Array(buffer)
  const width = state.engine.width as number
  const height = state.engine.height as number
  const expected = width * height
  if (types.length !== expected) {
    debugWarn('Snapshot size mismatch, skipping load')
    return
  }

  state.engine = new state.wasmModule.World(width, height)
  applyCurrentSettingsToEngine()
  state.lastInputX = null
  state.lastInputY = null
  updateMemoryViews()

  for (let i = 0; i < types.length; i++) {
    const elId = types[i]
    if (elId === 0) continue
    const x = i % width
    const y = Math.floor(i / width)
    state.engine.add_particle(x, y, elId)
  }

  if (state.renderer) state.renderer.requestFullUpload()
}

export function readElementAt(x: number, y: number): ElementType | null {
  if (!state.memoryManager || !state.engine) return null

  const width = state.engine.width as number
  const height = state.engine.height as number
  if (x < 0 || y < 0 || x >= width || y >= height) return null

  let types: Uint8Array
  try {
    types = state.memoryManager.types
  } catch {
    return null
  }
  const idx = y * width + x
  const elId = types[idx] ?? 0
  return (ELEMENT_ID_TO_NAME[elId] ?? null) as ElementType | null
}

export function floodFill(startX: number, startY: number, targetElementId: number): void {
  if (!state.memoryManager || !state.engine) return

  const width = state.engine.width as number
  const height = state.engine.height as number
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return

  let types: Uint8Array
  try {
    types = state.memoryManager.types
  } catch (e) {
    debugWarn('floodFill: memory views unavailable:', e)
    return
  }

  const startIdx = startY * width + startX
  const sourceId = types[startIdx] ?? 0
  if (sourceId === targetElementId) return

  const len = width * height
  if (!state.fillVisited || state.fillVisited.length !== len) {
    state.fillVisited = new Int32Array(len)
    state.fillStamp = 1
  } else {
    state.fillStamp += 1
    if (state.fillStamp >= 0x7fffffff) {
      state.fillVisited.fill(0)
      state.fillStamp = 1
    }
  }

  const stamp = state.fillStamp
  const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }]
  let processed = 0

  while (stack.length > 0) {
    const { x, y } = stack.pop() as { x: number; y: number }
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const idx = y * width + x
    if (state.fillVisited[idx] === stamp) continue
    if (types[idx] !== sourceId) continue

    state.fillVisited[idx] = stamp
    processed++
    if (processed > FILL_LIMIT) break

    if (targetElementId === 0) {
      state.engine.remove_particle(x, y)
    } else {
      state.engine.remove_particle(x, y)
      state.engine.add_particle(x, y, targetElementId)
    }

    stack.push({ x: x + 1, y })
    stack.push({ x: x - 1, y })
    stack.push({ x, y: y + 1 })
    stack.push({ x, y: y - 1 })
  }
}

export function spawnRigidBody(
  x: number,
  y: number,
  size: number,
  shape: 'box' | 'circle',
  elementId: number
): void {
  if (!state.engine) return

  if (shape === 'circle') {
    state.engine.spawn_rigid_circle(x, y, Math.floor(size / 2), elementId)
  } else {
    state.engine.spawn_rigid_body(x, y, size, size, elementId)
  }
}

export const __internal = {
  FILL_LIMIT,
}
