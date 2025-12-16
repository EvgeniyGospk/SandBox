import { screenToWorld as invertTransform } from '../../lib/engine/transform'
import { debugLog } from '../../lib/log'
import { SIMULATION_PROTOCOL_VERSION } from '../../lib/engine/protocol'

import type { WorkerMessage } from './types'
import { initEngine } from './init'
import { state, ELEMENT_MAP } from './state'
import { applyCurrentSettingsToEngine, updateMemoryViews } from './memory'
import { handleInput, resetInputTracking } from './input'
import { captureSnapshot, floodFill, loadSnapshotBuffer, readElementAt, spawnRigidBody } from './tools'

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data

  switch (msg.type) {
    case 'INIT':
      if (msg.protocolVersion !== SIMULATION_PROTOCOL_VERSION) {
        self.postMessage({
          type: 'ERROR',
          message: `Protocol mismatch (expected ${SIMULATION_PROTOCOL_VERSION}, got ${String(msg.protocolVersion)})`,
        })
        break
      }
      initEngine(msg.canvas, msg.width, msg.height, msg.viewportWidth, msg.viewportHeight, msg.inputBuffer)
      break

    case 'PLAY':
      state.isPlaying = true
      break

    case 'PAUSE':
      state.isPlaying = false
      state.stepAccumulator = 0
      break

    case 'STEP':
      if (state.engine) {
        state.engine.step()
        updateMemoryViews()
      }
      break

    case 'FILL': {
      if (!state.engine || !state.memoryManager) break
      const elementId = (ELEMENT_MAP[msg.element as unknown as string] ?? 0) as number
      floodFill(msg.x, msg.y, elementId)
      break
    }

    case 'SPAWN_RIGID_BODY': {
      if (!state.engine) break
      const elementId = ((ELEMENT_MAP[msg.element as unknown as string] ?? 1) as number) || 1
      spawnRigidBody(msg.x, msg.y, msg.size, msg.shape, elementId)
      break
    }

    case 'PIPETTE': {
      const viewport = { width: state.viewportWidth, height: state.viewportHeight }
      const worldSize = state.engine ? { width: state.engine.width, height: state.engine.height } : { width: 0, height: 0 }
      const world = invertTransform(msg.x, msg.y, { zoom: state.zoom, panX: state.panX, panY: state.panY }, viewport, worldSize)
      const worldX = Math.floor(world.x)
      const worldY = Math.floor(world.y)
      const element = readElementAt(worldX, worldY)
      self.postMessage({ type: 'PIPETTE_RESULT', id: msg.id, element })
      break
    }

    case 'SNAPSHOT': {
      const buffer = captureSnapshot()
      if (buffer) {
        self.postMessage({ type: 'SNAPSHOT_RESULT', id: msg.id, buffer }, { transfer: [buffer] })
      } else {
        self.postMessage({ type: 'SNAPSHOT_RESULT', id: msg.id, buffer: null })
      }
      break
    }

    case 'LOAD_SNAPSHOT': {
      loadSnapshotBuffer(msg.buffer)
      break
    }

    case 'INPUT':
      handleInput(msg.x, msg.y, msg.radius, msg.element, msg.tool, msg.brushShape ?? 'circle')
      break

    case 'INPUT_END':
      resetInputTracking()
      break

    case 'TRANSFORM':
      state.zoom = Number.isFinite(msg.zoom) ? Math.max(0.05, Math.min(50, msg.zoom)) : state.zoom
      state.panX = Number.isFinite(msg.panX) ? msg.panX : state.panX
      state.panY = Number.isFinite(msg.panY) ? msg.panY : state.panY
      break

    case 'SETTINGS':
      if (msg.gravity) {
        const gx = Number.isFinite(msg.gravity.x) ? msg.gravity.x : 0
        const gy = Number.isFinite(msg.gravity.y) ? msg.gravity.y : 0
        state.currentGravity = {
          x: Math.max(-50, Math.min(50, gx)),
          y: Math.max(-50, Math.min(50, gy)),
        }
      }
      if (msg.ambientTemperature !== undefined) {
        const t = Number.isFinite(msg.ambientTemperature) ? msg.ambientTemperature : 20
        state.currentAmbientTemperature = Math.max(-273, Math.min(5000, t))
      }
      if (msg.speed !== undefined) {
        const next = Number.isFinite(msg.speed) ? msg.speed : 1
        state.speed = Math.max(0.1, Math.min(8, next))
      }
      applyCurrentSettingsToEngine()
      break

    case 'SET_RENDER_MODE':
      state.renderMode = msg.mode
      if (state.renderMode === 'normal' && state.useWebGL && state.renderer) {
        state.renderer.requestFullUpload()
      }
      break

    case 'CLEAR':
      if (state.engine) {
        state.engine.clear()
        state.isPlaying = false
        state.stepAccumulator = 0
      }
      break

    case 'RESIZE': {
      if (!state.engine || !state.wasmModule) break

      const w = Math.max(1, Math.floor(msg.width))
      const h = Math.max(1, Math.floor(msg.height))

      const currentW = state.engine.width as number
      const currentH = state.engine.height as number
      if (w === currentW && h === currentH) break

      state.engine = new state.wasmModule.World(w, h)
      applyCurrentSettingsToEngine()
      state.lastInputX = null
      state.lastInputY = null

      state.thermalCanvas = new OffscreenCanvas(w, h)
      state.ctx = state.thermalCanvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      }) as OffscreenCanvasRenderingContext2D | null
      if (state.ctx) {
        state.ctx.imageSmoothingEnabled = false
        state.imageData = new ImageData(w, h)
        state.pixels = state.imageData.data
        state.pixels32 = new Uint32Array(state.pixels.buffer)
      }

      if (state.useWebGL && state.renderer) {
        state.renderer.resizeWorld(w, h)
      }

      state.fillVisited = null

      updateMemoryViews()
      debugLog(`⚡ Resized World to: ${w}x${h}`)
      break
    }

    case 'SET_VIEWPORT': {
      if (!state.canvas) break

      const w = Math.max(1, Math.floor(msg.width))
      const h = Math.max(1, Math.floor(msg.height))
      if (w === state.viewportWidth && h === state.viewportHeight) break

      state.viewportWidth = w
      state.viewportHeight = h

      state.canvas.width = w
      state.canvas.height = h

      if (state.useWebGL && state.renderer) {
        state.renderer.setViewportSize(w, h)
      } else if (state.screenCtx) {
        state.screenCtx.imageSmoothingEnabled = false
      }

      break
    }
  }
}

export {}
