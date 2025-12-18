import type { ToolType } from '@/features/simulation/engine/api/types'

import { screenToWorld as invertTransform } from '@/features/simulation/engine/transform'
import { debugWarn } from '@/platform/logging/log'

import type { WorkerContext } from './context'

import { decodeSharedInputEvent, shouldResetTrackingOnDecodedEvent, shouldResetTrackingOnOverflow } from './sharedInputDecoding'

function drawLine(
  ctx: WorkerContext,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  elementType: number,
  isErase: boolean
): void {
  const state = ctx.state
  if (!state.wasm.engine) return
  const width = state.wasm.engine.width as number
  const height = state.wasm.engine.height as number

  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  while (true) {
    if (x0 >= 0 && y0 >= 0 && x0 < width && y0 < height) {
      if (isErase) {
        state.wasm.engine.remove_particles_in_radius(x0, y0, radius)
      } else {
        state.wasm.engine.add_particles_in_radius(x0, y0, radius, elementType)
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
  ctx: WorkerContext,
  x: number,
  y: number,
  radius: number,
  elementId: number,
  tool: ToolType,
  brushShape: 'circle' | 'square' | 'line' = 'circle'
): void {
  const state = ctx.state
  const wasmWorld = state.wasm.engine
  if (!wasmWorld) return

  const worldWidth = wasmWorld.width as number
  const worldHeight = wasmWorld.height as number
  const safeRadius = Math.max(0, Math.min(256, Math.floor(radius)))

  const viewport = { width: state.view.viewportWidth, height: state.view.viewportHeight }
  const worldSize = { width: wasmWorld.width, height: wasmWorld.height }
  const transform = state.view.transform
  const world = invertTransform(x, y, transform, viewport, worldSize)
  const worldX = Math.floor(world.x)
  const worldY = Math.floor(world.y)

  const wasmElement = Math.max(0, Math.min(255, Math.floor(elementId)))

  const shouldErase = tool === 'eraser'
  const shouldAdd = tool === 'brush' && wasmElement !== 0

  if (brushShape === 'square') {
    const half = safeRadius
    if (half === 0) {
      if (worldX < 0 || worldY < 0 || worldX >= worldWidth || worldY >= worldHeight) return
      if (shouldErase) {
        wasmWorld.remove_particles_in_radius(worldX, worldY, safeRadius)
      } else if (shouldAdd) {
        wasmWorld.add_particles_in_radius(worldX, worldY, safeRadius, wasmElement)
      }
      return
    }

    const startX = Math.max(0, worldX - half)
    const endX = Math.min(worldWidth - 1, worldX + half)
    const startY = Math.max(0, worldY - half)
    const endY = Math.min(worldHeight - 1, worldY + half)
    if (startX > endX || startY > endY) return

    if (shouldErase) {
      for (let wy = startY; wy <= endY; wy++) {
        for (let wx = startX; wx <= endX; wx++) {
          wasmWorld.remove_particles_in_radius(wx, wy, safeRadius)
        }
      }
      return
    }

    if (shouldAdd) {
      for (let wy = startY; wy <= endY; wy++) {
        for (let wx = startX; wx <= endX; wx++) {
          wasmWorld.add_particles_in_radius(wx, wy, safeRadius, wasmElement)
        }
      }
    }
  } else if (brushShape === 'line') {
    drawLine(ctx, worldX - safeRadius, worldY, worldX + safeRadius, worldY, safeRadius, wasmElement, tool === 'eraser')
  } else {
    if (worldX < 0 || worldY < 0 || worldX >= worldWidth || worldY >= worldHeight) return
    if (shouldErase) {
      wasmWorld.remove_particles_in_radius(worldX, worldY, safeRadius)
    } else if (shouldAdd) {
      wasmWorld.add_particles_in_radius(worldX, worldY, safeRadius, wasmElement)
    }
  }
}

export function processSharedInput(ctx: WorkerContext): void {
  const state = ctx.state
  const input = state.input.sharedBuffer
  const world = state.wasm.engine
  if (!input || !world) return

  const width = world.width as number
  const height = world.height as number
  const maxElementId = 255

  const overflowed = input.checkAndClearOverflow()
  if (shouldResetTrackingOnOverflow(overflowed)) {
    if (overflowed) {
      ctx.metrics.inputOverflowCountTotal += 1
      ctx.metrics.inputOverflowCountSinceLastStats += 1
      debugWarn('🔒 Input buffer overflow detected - resetting Bresenham state')
    }
    state.input.lastX = null
    state.input.lastY = null
  }

  input.processAll((x: number, y: number, type: number, val: number) => {
    const ev = decodeSharedInputEvent({ x, y, type, val, maxElementId })
    if (shouldResetTrackingOnDecodedEvent(ev)) {
      state.input.lastX = null
      state.input.lastY = null
      return
    }
    if (ev.kind !== 'stroke') return

    const currentX = ev.x
    const currentY = ev.y
    const safeRadius = ev.radius

    const isErase = ev.isErase
    const elementType = isErase ? 0 : ev.elementType

    if (state.input.lastX === null || state.input.lastY === null) {
      state.input.lastX = currentX
      state.input.lastY = currentY
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
      drawLine(ctx, state.input.lastX, state.input.lastY, currentX, currentY, safeRadius, elementType, isErase)
    }

    state.input.lastX = currentX
    state.input.lastY = currentY
  })
}

export function resetInputTracking(ctx: WorkerContext): void {
  const state = ctx.state
  state.input.lastX = null
  state.input.lastY = null
}
