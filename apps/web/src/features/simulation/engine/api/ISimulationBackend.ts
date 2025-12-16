import type { RenderMode } from './types'

export type SimulationSettings = {
  gravity?: { x: number; y: number }
  ambientTemperature?: number
  speed?: number
}

export interface ISimulationBackend {
  play(): void
  pause(): void
  step(): void
  clear(): void
  setSettings(settings: SimulationSettings): void
  setRenderMode(mode: RenderMode): void
  saveSnapshot(): Promise<ArrayBuffer | null>
  loadSnapshot(buffer: ArrayBuffer): void
}

