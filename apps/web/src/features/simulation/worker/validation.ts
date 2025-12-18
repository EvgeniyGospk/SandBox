import type { WorkerMessage } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getType(value: unknown): unknown {
  if (!isRecord(value)) return undefined
  return value.type
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function toClampedInt(value: unknown, min: number, max: number): number | null {
  const n = toFiniteNumber(value)
  if (n === null) return null
  return clamp(Math.floor(n), min, max)
}

function toClampedNumber(value: unknown, min: number, max: number): number | null {
  const n = toFiniteNumber(value)
  if (n === null) return null
  return clamp(n, min, max)
}

function toOptionalClampedNumber(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined) return undefined
  const n = toClampedNumber(value, min, max)
  return n === null ? undefined : n
}

function toOptionalClampedInt(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined) return undefined
  const n = toClampedInt(value, min, max)
  return n === null ? undefined : n
}

export type ParseWorkerMessageResult =
  | { ok: true; msg: WorkerMessage }
  | { ok: false; error: string; receivedType?: unknown }

const MAX_WORLD_SIZE = 4096
const MAX_VIEWPORT_SIZE = 8192
const MAX_PAN = 1_000_000
const MAX_RIGID_SIZE = 127

export function parseWorkerMessage(data: unknown): ParseWorkerMessageResult {
  const type = getType(data)
  if (type === undefined) return { ok: false, error: 'Message missing type field' }

  if (type === 'INIT') {
    if (!isRecord(data)) return { ok: false, error: 'INIT payload invalid', receivedType: type }

    const protocolVersion = toFiniteNumber(data.protocolVersion)
    const canvas = data.canvas

    const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'

    const width = toClampedInt(data.width, 1, MAX_WORLD_SIZE)
    const height = toClampedInt(data.height, 1, MAX_WORLD_SIZE)

    if (protocolVersion === null) return { ok: false, error: 'INIT.protocolVersion invalid', receivedType: type }
    if (!hasOffscreenCanvas) return { ok: false, error: 'OffscreenCanvas not available', receivedType: type }
    if (!(canvas instanceof OffscreenCanvas)) return { ok: false, error: 'INIT.canvas invalid', receivedType: type }
    if (width === null || height === null) return { ok: false, error: 'INIT.width/height invalid', receivedType: type }

    const viewportWidth = toOptionalClampedInt(data.viewportWidth, 1, MAX_VIEWPORT_SIZE)
    const viewportHeight = toOptionalClampedInt(data.viewportHeight, 1, MAX_VIEWPORT_SIZE)

    const inputBuffer = data.inputBuffer
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined'
    if (inputBuffer !== undefined && inputBuffer !== null) {
      if (!hasSharedArrayBuffer) return { ok: false, error: 'SharedArrayBuffer not available', receivedType: type }
      if (!(inputBuffer instanceof SharedArrayBuffer)) return { ok: false, error: 'INIT.inputBuffer invalid', receivedType: type }
    }

    return {
      ok: true,
      msg: {
        type: 'INIT',
        protocolVersion,
        canvas,
        width,
        height,
        viewportWidth,
        viewportHeight,
        inputBuffer: inputBuffer ?? undefined,
      },
    }
  }

  if (type === 'RESIZE') {
    if (!isRecord(data)) return { ok: false, error: 'RESIZE payload invalid', receivedType: type }
    const width = toClampedInt(data.width, 1, MAX_WORLD_SIZE)
    const height = toClampedInt(data.height, 1, MAX_WORLD_SIZE)
    if (width === null || height === null) return { ok: false, error: 'RESIZE.width/height invalid', receivedType: type }
    return { ok: true, msg: { type: 'RESIZE', width, height } }
  }

  if (type === 'SET_VIEWPORT') {
    if (!isRecord(data)) return { ok: false, error: 'SET_VIEWPORT payload invalid', receivedType: type }
    const width = toClampedInt(data.width, 1, MAX_VIEWPORT_SIZE)
    const height = toClampedInt(data.height, 1, MAX_VIEWPORT_SIZE)
    if (width === null || height === null) return { ok: false, error: 'SET_VIEWPORT.width/height invalid', receivedType: type }
    return { ok: true, msg: { type: 'SET_VIEWPORT', width, height } }
  }

  if (type === 'TRANSFORM') {
    if (!isRecord(data)) return { ok: false, error: 'TRANSFORM payload invalid', receivedType: type }

    const zoom = toClampedNumber(data.zoom, 0.05, 50)
    const panX = toClampedNumber(data.panX, -MAX_PAN, MAX_PAN)
    const panY = toClampedNumber(data.panY, -MAX_PAN, MAX_PAN)

    if (zoom === null || panX === null || panY === null) {
      return { ok: false, error: 'TRANSFORM.zoom/panX/panY invalid', receivedType: type }
    }

    return { ok: true, msg: { type: 'TRANSFORM', zoom, panX, panY } }
  }

  if (type === 'SETTINGS') {
    if (!isRecord(data)) return { ok: false, error: 'SETTINGS payload invalid', receivedType: type }

    const gravity = data.gravity
    let nextGravity: { x: number; y: number } | undefined
    if (gravity !== undefined) {
      if (!isRecord(gravity)) return { ok: false, error: 'SETTINGS.gravity invalid', receivedType: type }
      const gx = toClampedNumber(gravity.x, -50, 50)
      const gy = toClampedNumber(gravity.y, -50, 50)
      nextGravity = {
        x: gx ?? 0,
        y: gy ?? 0,
      }
    }

    const ambientTemperature = toOptionalClampedNumber(data.ambientTemperature, -273, 5000)
    const speed = toOptionalClampedNumber(data.speed, 0.1, 8)

    return {
      ok: true,
      msg: {
        type: 'SETTINGS',
        gravity: nextGravity,
        ambientTemperature,
        speed,
      },
    }
  }

  if (type === 'INPUT') {
    if (!isRecord(data)) return { ok: false, error: 'INPUT payload invalid', receivedType: type }
    const x = toFiniteNumber(data.x)
    const y = toFiniteNumber(data.y)
    const radius = toFiniteNumber(data.radius)
    const elementId = toClampedInt(data.elementId, 0, 255)
    const tool = data.tool
    const brushShape = data.brushShape

    if (x === null || y === null || radius === null) return { ok: false, error: 'INPUT.x/y/radius invalid', receivedType: type }
    if (elementId === null) return { ok: false, error: 'INPUT.elementId invalid', receivedType: type }
    if (typeof tool !== 'string') return { ok: false, error: 'INPUT.tool invalid', receivedType: type }
    if (brushShape !== undefined && brushShape !== 'circle' && brushShape !== 'square' && brushShape !== 'line') {
      return { ok: false, error: 'INPUT.brushShape invalid', receivedType: type }
    }

    return {
      ok: true,
      msg: {
        type: 'INPUT',
        x,
        y,
        radius,
        elementId,
        tool: tool as never,
        brushShape,
      },
    }
  }

  if (type === 'INPUT_END') {
    return { ok: true, msg: { type: 'INPUT_END' } }
  }

  if (type === 'SET_RENDER_MODE') {
    if (!isRecord(data)) return { ok: false, error: 'SET_RENDER_MODE payload invalid', receivedType: type }
    const mode = data.mode
    if (mode !== 'normal' && mode !== 'thermal') return { ok: false, error: 'SET_RENDER_MODE.mode invalid', receivedType: type }
    return { ok: true, msg: { type: 'SET_RENDER_MODE', mode } }
  }

  if (type === 'PLAY' || type === 'PAUSE' || type === 'STEP' || type === 'CLEAR') {
    return { ok: true, msg: { type } as WorkerMessage }
  }

  if (type === 'LOAD_CONTENT_BUNDLE') {
    if (!isRecord(data)) return { ok: false, error: 'LOAD_CONTENT_BUNDLE payload invalid', receivedType: type }
    const json = data.json
    if (typeof json !== 'string') return { ok: false, error: 'LOAD_CONTENT_BUNDLE.json invalid', receivedType: type }
    return { ok: true, msg: { type: 'LOAD_CONTENT_BUNDLE', json } }
  }

  if (type === 'FILL') {
    if (!isRecord(data)) return { ok: false, error: 'FILL payload invalid', receivedType: type }
    const x = toClampedInt(data.x, 0, MAX_WORLD_SIZE)
    const y = toClampedInt(data.y, 0, MAX_WORLD_SIZE)
    const elementId = toClampedInt(data.elementId, 0, 255)
    if (x === null || y === null) return { ok: false, error: 'FILL.x/y invalid', receivedType: type }
    if (elementId === null) return { ok: false, error: 'FILL.elementId invalid', receivedType: type }
    return { ok: true, msg: { type: 'FILL', x, y, elementId } }
  }

  if (type === 'PIPETTE') {
    if (!isRecord(data)) return { ok: false, error: 'PIPETTE payload invalid', receivedType: type }
    const id = toFiniteNumber(data.id)
    const x = toFiniteNumber(data.x)
    const y = toFiniteNumber(data.y)
    if (id === null || x === null || y === null) return { ok: false, error: 'PIPETTE.id/x/y invalid', receivedType: type }
    return { ok: true, msg: { type: 'PIPETTE', id, x, y } }
  }

  if (type === 'SNAPSHOT') {
    if (!isRecord(data)) return { ok: false, error: 'SNAPSHOT payload invalid', receivedType: type }
    const id = toFiniteNumber(data.id)
    if (id === null) return { ok: false, error: 'SNAPSHOT.id invalid', receivedType: type }
    return { ok: true, msg: { type: 'SNAPSHOT', id } }
  }

  if (type === 'LOAD_SNAPSHOT') {
    if (!isRecord(data)) return { ok: false, error: 'LOAD_SNAPSHOT payload invalid', receivedType: type }
    const buffer = data.buffer
    if (!(buffer instanceof ArrayBuffer)) return { ok: false, error: 'LOAD_SNAPSHOT.buffer invalid', receivedType: type }
    return { ok: true, msg: { type: 'LOAD_SNAPSHOT', buffer } }
  }

  if (type === 'SPAWN_RIGID_BODY') {
    if (!isRecord(data)) return { ok: false, error: 'SPAWN_RIGID_BODY payload invalid', receivedType: type }
    const x = toFiniteNumber(data.x)
    const y = toFiniteNumber(data.y)
    const size = toFiniteNumber(data.size)
    const shape = data.shape
    const elementId = toClampedInt(data.elementId, 0, 255)
    if (x === null || y === null || size === null) return { ok: false, error: 'SPAWN_RIGID_BODY.x/y/size invalid', receivedType: type }
    if (shape !== 'box' && shape !== 'circle') return { ok: false, error: 'SPAWN_RIGID_BODY.shape invalid', receivedType: type }
    if (elementId === null) return { ok: false, error: 'SPAWN_RIGID_BODY.elementId invalid', receivedType: type }
    return {
      ok: true,
      msg: {
        type: 'SPAWN_RIGID_BODY',
        x,
        y,
        size: clamp(size, 1, MAX_RIGID_SIZE),
        shape,
        elementId,
      },
    }
  }

  return { ok: false, error: `Unknown message type: ${String(type)}`, receivedType: type }
}
