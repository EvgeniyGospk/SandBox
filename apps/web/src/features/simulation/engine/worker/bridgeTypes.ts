export interface SimulationStats {
  fps: number
  particleCount: number
}

export type StatsCallback = (stats: { fps: number; particleCount: number }) => void
export type ReadyCallback = (width: number, height: number) => void
export type ErrorCallback = (message: string) => void
export type CrashCallback = (message: string, canRecover: boolean) => void
