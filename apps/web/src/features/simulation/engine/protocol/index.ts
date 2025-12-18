export const SIMULATION_PROTOCOL_VERSION = 2 as const

export type WorkerCapabilities = {
  webgl: boolean
  sharedInput: boolean
}

export type ContentBundlePhase = 'init' | 'reload'
export type ContentBundleStatus = 'loading' | 'loaded' | 'error'

export type WorkerToMainMessage =
  | { type: 'READY'; protocolVersion: number; width: number; height: number; capabilities?: WorkerCapabilities }
  | { type: 'CONTENT_MANIFEST'; json: string }
  | { type: 'CONTENT_BUNDLE_STATUS'; phase: ContentBundlePhase; status: ContentBundleStatus; message?: string }
  | {
      type: 'STATS'
      fps: number
      particleCount: number
      stepsPerFrame?: number
      inputOverflowCount?: number
      wasmMemoryBytes?: number
    }
  | { type: 'ERROR'; message: string }
  | { type: 'CRASH'; message: string; canRecover?: boolean }
  | { type: 'PIPETTE_RESULT'; id: number; elementId: number | null }
  | { type: 'SNAPSHOT_RESULT'; id: number; buffer: ArrayBuffer | null }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNumber(value)
}

function isWorkerCapabilities(value: unknown): value is WorkerCapabilities {
  if (!isRecord(value)) return false
  return typeof value.webgl === 'boolean' && typeof value.sharedInput === 'boolean'
}

function isContentBundlePhase(value: unknown): value is ContentBundlePhase {
  return value === 'init' || value === 'reload'
}

function isContentBundleStatus(value: unknown): value is ContentBundleStatus {
  return value === 'loading' || value === 'loaded' || value === 'error'
}

export function parseWorkerToMainMessage(data: unknown): WorkerToMainMessage | null {
  if (!isRecord(data)) return null
  if (typeof data.type !== 'string') return null

  switch (data.type) {
    case 'CONTENT_MANIFEST': {
      if (typeof data.json !== 'string') return null
      return { type: 'CONTENT_MANIFEST', json: data.json }
    }
    case 'CONTENT_BUNDLE_STATUS': {
      if (!isContentBundlePhase(data.phase)) return null
      if (!isContentBundleStatus(data.status)) return null
      if (data.message !== undefined && typeof data.message !== 'string') return null
      return {
        type: 'CONTENT_BUNDLE_STATUS',
        phase: data.phase,
        status: data.status,
        ...(data.message !== undefined ? { message: data.message } : {}),
      }
    }
    case 'READY': {
      if (!isFiniteNumber(data.protocolVersion)) return null
      if (!isFiniteNumber(data.width) || !isFiniteNumber(data.height)) return null
      if (data.capabilities !== undefined && !isWorkerCapabilities(data.capabilities)) return null
      return {
        type: 'READY',
        protocolVersion: data.protocolVersion,
        width: data.width,
        height: data.height,
        capabilities: data.capabilities as WorkerCapabilities | undefined,
      }
    }
    case 'STATS': {
      if (!isFiniteNumber(data.fps) || !isFiniteNumber(data.particleCount)) return null

      if (!isOptionalFiniteNumber(data.stepsPerFrame)) return null
      if (!isOptionalFiniteNumber(data.inputOverflowCount)) return null
      if (!isOptionalFiniteNumber(data.wasmMemoryBytes)) return null

      return {
        type: 'STATS',
        fps: data.fps,
        particleCount: data.particleCount,
        ...(data.stepsPerFrame !== undefined ? { stepsPerFrame: data.stepsPerFrame } : {}),
        ...(data.inputOverflowCount !== undefined ? { inputOverflowCount: data.inputOverflowCount } : {}),
        ...(data.wasmMemoryBytes !== undefined ? { wasmMemoryBytes: data.wasmMemoryBytes } : {}),
      }
    }
    case 'ERROR': {
      if (typeof data.message !== 'string') return null
      return { type: 'ERROR', message: data.message }
    }
    case 'CRASH': {
      if (typeof data.message !== 'string') return null
      const canRecover = data.canRecover
      if (canRecover !== undefined && typeof canRecover !== 'boolean') return null
      return { type: 'CRASH', message: data.message, canRecover }
    }
    case 'PIPETTE_RESULT': {
      if (!isFiniteNumber(data.id)) return null
      const elementId = data.elementId
      if (elementId !== null && !isFiniteNumber(elementId)) return null
      return { type: 'PIPETTE_RESULT', id: data.id, elementId: (elementId ?? null) as number | null }
    }
    case 'SNAPSHOT_RESULT': {
      if (!isFiniteNumber(data.id)) return null
      const buffer = data.buffer
      if (buffer !== null && !(buffer instanceof ArrayBuffer)) return null
      return { type: 'SNAPSHOT_RESULT', id: data.id, buffer: (buffer ?? null) as ArrayBuffer | null }
    }
    default:
      return null
  }
}
