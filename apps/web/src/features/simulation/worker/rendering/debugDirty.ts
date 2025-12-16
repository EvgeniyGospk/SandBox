import { debugLog } from '@/platform/logging/log'
import type { SimulationWorkerState } from '../state'

export function maybeLogDirtyDebug(state: SimulationWorkerState): void {
  if (!state.debugDirty) return
  if (!state.engine) return

  state.debugLogInterval++
  if (state.debugLogInterval < state.debugLogEvery) return
  state.debugLogInterval = 0

  const dirtyCount = state.engine.count_dirty_chunks ? state.engine.count_dirty_chunks() : 0
  const chunksX = state.engine.chunks_x()
  const chunksY = state.engine.chunks_y()
  const totalChunks = chunksX * chunksY

  let waterCount = 0
  let iceCount = 0
  let sampleTemp = 0
  let sampleCount = 0

  if (state.memoryManager) {
    const types = state.memoryManager.types
    const temps = state.memoryManager.temperature
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
  const ambientTemp = state.engine.get_ambient_temperature ? state.engine.get_ambient_temperature() : 'N/A'

  debugLog(
    `🔍 DEBUG [Frame]: dirty=${dirtyCount}/${totalChunks}, water=${waterCount}, ice=${iceCount}, avgTemp=${avgTemp}°C, ambient=${ambientTemp}°C`
  )
}
