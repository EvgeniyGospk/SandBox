import type { ElementType } from '../api/types'

export const SIMULATION_PROTOCOL_VERSION = 1 as const

export type WorkerCapabilities = {
  webgl: boolean
  sharedInput: boolean
}

export type WorkerToMainMessage =
  | { type: 'READY'; protocolVersion: number; width: number; height: number; capabilities?: WorkerCapabilities }
  | { type: 'STATS'; fps: number; particleCount: number }
  | { type: 'ERROR'; message: string }
  | { type: 'CRASH'; message: string; canRecover?: boolean }
  | { type: 'PIPETTE_RESULT'; id: number; element: ElementType | null }
  | { type: 'SNAPSHOT_RESULT'; id: number; buffer: ArrayBuffer | null }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isWorkerCapabilities(value: unknown): value is WorkerCapabilities {
  if (!isRecord(value)) return false
  return typeof value.webgl === 'boolean' && typeof value.sharedInput === 'boolean'
}

export function parseWorkerToMainMessage(data: unknown): WorkerToMainMessage | null {
  if (!isRecord(data)) return null
  if (typeof data.type !== 'string') return null

  switch (data.type) {
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
      return { type: 'STATS', fps: data.fps, particleCount: data.particleCount }
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
      const element = data.element
      if (element !== null && typeof element !== 'string') return null
      return { type: 'PIPETTE_RESULT', id: data.id, element: (element ?? null) as ElementType | null }
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
