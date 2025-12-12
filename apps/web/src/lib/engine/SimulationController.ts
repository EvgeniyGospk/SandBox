/**
 * SimulationController
 *
 * Unified façade that routes simulation commands to the active runtime:
 * - WorkerBridge (preferred)
 * - WasmParticleEngine fallback (main thread)
 *
 * UI/store should call these helpers instead of touching engine/worker directly.
 */
import { getBridge, getEngine } from './runtime'
import type { RenderMode } from './types'

function getTarget() {
  return getBridge() ?? getEngine()
}

export function play(): void {
  const bridge = getBridge()
  bridge?.play()
}

export function pause(): void {
  const bridge = getBridge()
  bridge?.pause()
}

export function step(): void {
  const bridge = getBridge()
  if (bridge) {
    // Worker single-step
    bridge.step()
  } else {
    // Fallback engine single-step
    getEngine()?.step()
  }
}

export function reset(): void {
  const target = getTarget()
  target?.clear?.()
}

export function setRenderMode(mode: RenderMode): void {
  const bridge = getBridge()
  if (bridge) {
    bridge.setRenderMode(mode)
  } else {
    getEngine()?.setRenderMode(mode)
  }
}

export function setGravity(gravity: { x: number; y: number }): void {
  const bridge = getBridge()
  if (bridge) {
    bridge.setSettings({ gravity })
  } else {
    getEngine()?.setSettings?.({ gravity })
  }
}

export function setAmbientTemperature(ambientTemperature: number): void {
  const bridge = getBridge()
  if (bridge) {
    bridge.setSettings({ ambientTemperature })
  } else {
    getEngine()?.setSettings?.({ ambientTemperature })
  }
}

export function setSpeed(speed: number): void {
  const bridge = getBridge()
  if (bridge) {
    bridge.setSettings({ speed })
  }
}

// === Snapshots ===
let lastSnapshot: ArrayBuffer | null = null
const history: ArrayBuffer[] = []
let historyIndex = -1
const HISTORY_LIMIT = 20

async function getCurrentSnapshot(): Promise<ArrayBuffer | null> {
  const bridge = getBridge()
  if (bridge) {
    const buffer = await bridge.saveSnapshot() as ArrayBuffer | null
    if (!buffer) return null
    let out: ArrayBuffer
    if (buffer instanceof ArrayBuffer) {
      out = buffer.slice(0)
    } else {
      const view = new Uint8Array(buffer as ArrayBuffer)
      const copy = new Uint8Array(view)
      out = copy.buffer
    } 
    return out
  }
  const engine = getEngine()
  if (engine) {
    const snap = engine.saveSnapshot()
    if (!snap) return null
    const copy = new Uint8Array(snap)
    return copy.buffer
  }
  return null
}

export async function saveSnapshot(): Promise<void> {
  const buffer = await getCurrentSnapshot()
  lastSnapshot = buffer ?? null
  if (buffer) {
    // push into history
    if (historyIndex < history.length - 1) history.splice(historyIndex + 1)
    history.push(buffer.slice(0))
    if (history.length > HISTORY_LIMIT) {
      history.shift()
    }
    historyIndex = history.length - 1
  }
}

export function loadSnapshot(): void {
  if (!lastSnapshot) return
  const bridge = getBridge()
  if (bridge) {
    bridge.loadSnapshot(lastSnapshot.slice(0))
    return
  }
  const engine = getEngine()
  if (engine) {
    engine.loadSnapshot(new Uint8Array(lastSnapshot))
  }
}

export async function captureSnapshotForUndo(): Promise<void> {
  const buffer = await getCurrentSnapshot()
  if (!buffer) return
  if (historyIndex < history.length - 1) {
    history.splice(historyIndex + 1)
  }
  history.push(buffer.slice(0))
  if (history.length > HISTORY_LIMIT) {
    history.shift()
  }
  historyIndex = history.length - 1
}

export function undo(): void {
  if (historyIndex <= 0) return
  historyIndex -= 1
  const buffer = history[historyIndex]
  lastSnapshot = buffer
  loadSnapshot()
}

export function redo(): void {
  if (historyIndex >= history.length - 1) return
  historyIndex += 1
  const buffer = history[historyIndex]
  lastSnapshot = buffer
  loadSnapshot()
}
