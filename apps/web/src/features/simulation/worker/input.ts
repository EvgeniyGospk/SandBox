import type { ElementType, ToolType } from '@/features/simulation/engine/api/types'

import {
  INPUT_TYPE_BRUSH_OFFSET,
  INPUT_TYPE_END_STROKE,
  INPUT_TYPE_ERASE,
} from '@/core/canvas/input/InputBuffer'
import { screenToWorld as invertTransform } from '@/features/simulation/engine/transform'
import { debugWarn } from '@/platform/logging/log'
import { ELEMENT_ID_TO_NAME } from '@/features/simulation/engine/api/types'

import { state, ELEMENT_MAP } from './state'

function drawLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  elementType: number,
  isErase: boolean
): void {
  if (!state.engine) return
  const width = state.engine.width as number
  const height = state.engine.height as number

  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  while (true) {
    if (x0 >= 0 && y0 >= 0 && x0 < width && y0 < height) {
      if (isErase) {
        state.engine.remove_particles_in_radius(x0, y0, radius)
      } else {
        state.engine.add_particles_in_radius(x0, y0, radius, elementType)
      }
    }

    if (x0 === x1 && y0 === y1) break

    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }
    if (e2 < dx) {
      err += dx
      y0 += sy
    }
  }
}

export function handleInput(
  x: number,
  y: number,
  radius: number,
  element: ElementType,
  tool: ToolType,
  brushShape: 'circle' | 'square' | 'line' = 'circle'
): void {
  const wasmWorld = state.engine
  if (!wasmWorld) return

  const worldWidth = wasmWorld.width as number
  const worldHeight = wasmWorld.height as number
  const safeRadius = Math.max(0, Math.min(256, Math.floor(radius)))

  const viewport = { width: state.viewportWidth, height: state.viewportHeight }
  const worldSize = { width: wasmWorld.width, height: wasmWorld.height }
  const world = invertTransform(x, y, { zoom: state.zoom, panX: state.panX, panY: state.panY }, viewport, worldSize)
  const worldX = Math.floor(world.x)
  const worldY = Math.floor(world.y)

  const wasmElement = (ELEMENT_MAP[element as unknown as string] ?? 0) as number

  const applyBrush = (wx: number, wy: number) => {
    if (wx < 0 || wy < 0 || wx >= worldWidth || wy >= worldHeight) return
    if (tool === 'eraser') {
      wasmWorld.remove_particles_in_radius(wx, wy, safeRadius)
    } else if (tool === 'brush') {
      if (wasmElement !== 0) {
        wasmWorld.add_particles_in_radius(wx, wy, safeRadius, wasmElement)
      }
    }
  }

  if (brushShape === 'square') {
    const half = safeRadius
    if (half === 0) {
      applyBrush(worldX, worldY)
      return
    }
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        applyBrush(worldX + dx, worldY + dy)
      }
    }
  } else if (brushShape === 'line') {
    drawLine(worldX - safeRadius, worldY, worldX + safeRadius, worldY, safeRadius, wasmElement, tool === 'eraser')
  } else {
    applyBrush(worldX, worldY)
  }
}

export function processSharedInput(): void {
  const input = state.sharedInputBuffer
  const world = state.engine
  if (!input || !world) return

  const width = world.width as number
  const height = world.height as number
  const maxElementId = ELEMENT_ID_TO_NAME.length - 1

  if (input.checkAndClearOverflow()) {
    debugWarn('🔒 Input buffer overflow detected - resetting Bresenham state')
    state.lastInputX = null
    state.lastInputY = null
  }

  input.processAll((x: number, y: number, type: number, val: number) => {
    if (type === INPUT_TYPE_END_STROKE) {
      state.lastInputX = null
      state.lastInputY = null
      return
    }

    const currentX = Math.floor(x)
    const currentY = Math.floor(y)
    const safeRadius = Math.max(0, Math.min(256, Math.floor(val)))

    const isErase = type === INPUT_TYPE_ERASE
    const elementType = isErase ? 0 : type - INPUT_TYPE_BRUSH_OFFSET

    if (!isErase && (elementType <= 0 || elementType > maxElementId)) {
      return
    }

    if (state.lastInputX === null || state.lastInputY === null) {
      state.lastInputX = currentX
      state.lastInputY = currentY
      if (currentX >= 0 && currentY >= 0 && currentX < width && currentY < height) {
        if (isErase) {
          world.remove_particles_in_radius(currentX, currentY, safeRadius)
        } else if (elementType !== 0) {
          world.add_particles_in_radius(currentX, currentY, safeRadius, elementType)
        }
      }
      return
    }

    if (elementType !== 0 || isErase) {
      drawLine(state.lastInputX, state.lastInputY, currentX, currentY, safeRadius, elementType, isErase)
    }

    state.lastInputX = currentX
    state.lastInputY = currentY
  })
}

export function resetInputTracking(): void {
  state.lastInputX = null
  state.lastInputY = null
}
