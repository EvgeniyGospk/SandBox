export interface SimulationStats {
  fps: number
  particleCount: number
  stepsPerFrame?: number
  inputOverflowCount?: number
  wasmMemoryBytes?: number
}

export type StatsCallback = (stats: SimulationStats) => void
export type ReadyCallback = (width: number, height: number) => void
export type ErrorCallback = (message: string) => void
export type CrashCallback = (message: string, canRecover: boolean) => void
export type ContentManifestCallback = (json: string) => void

export type ContentBundleStatusCallback = (args: {
  phase: 'init' | 'reload'
  status: 'loading' | 'loaded' | 'error'
  message?: string
}) => void
