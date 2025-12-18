import { debugLog } from '@/platform/logging/log'
import type { SimulationWorkerState } from '../state'

export function maybeLogDirtyDebug(state: SimulationWorkerState): void {
  if (!state.debug.dirty) return
  if (!state.wasm.engine) return

  state.debug.logInterval++
  if (state.debug.logInterval < state.debug.logEvery) return
  state.debug.logInterval = 0

  const dirtyCount = 0
  const totalChunks = 0

  let waterCount = 0
  let iceCount = 0
  let sampleTemp = 0
  let sampleCount = 0

  if (state.memory.manager) {
    const types = state.memory.manager.types
    const temps = state.memory.manager.temperature
    const len = types.length
    for (let i = 0; i < len; i++) {
      const type = types[i]
      if (type === 6) {
        waterCount++
        sampleTemp += temps[i]
        sampleCount++
      } else if (type === 5) {
        iceCount++
        sampleTemp += temps[i]
        sampleCount++
      }
    }
  }

  const avgTemp = sampleCount > 0 ? (sampleTemp / sampleCount).toFixed(1) : 'N/A'
  const ambientTemp = state.wasm.engine.get_ambient_temperature ? state.wasm.engine.get_ambient_temperature() : 'N/A'

  debugLog(
    `🔍 DEBUG [Frame]: dirty=${dirtyCount}/${totalChunks}, water=${waterCount}, ice=${iceCount}, avgTemp=${avgTemp}°C, ambient=${ambientTemp}°C`
  )
}
