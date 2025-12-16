import type { SimulationWorkerState } from '../state'

export function renderThermal(state: SimulationWorkerState): void {
  if (!state.pixels || !state.memoryManager) return

  const temperatureView = state.memoryManager.temperature
  const len = Math.min(temperatureView.length, state.pixels.length / 4)

  for (let i = 0; i < len; i++) {
    const temp = temperatureView[i]
    const base = i << 2

    const [r, g, b] = getThermalColor(temp)

    state.pixels[base] = r
    state.pixels[base + 1] = g
    state.pixels[base + 2] = b
    state.pixels[base + 3] = 255
  }
}

function getThermalColor(t: number): [number, number, number] {
  if (t < 0) {
    const intensity = Math.min(1, Math.abs(t) / 30)
    return [0, 0, Math.floor(128 + 127 * intensity)]
  }
  if (t < 20) {
    const ratio = t / 20
    return [0, Math.floor(ratio * 255), 255]
  }
  if (t < 50) {
    const ratio = (t - 20) / 30
    return [0, 255, Math.floor(255 * (1 - ratio))]
  }
  if (t < 100) {
    const ratio = (t - 50) / 50
    return [Math.floor(255 * ratio), 255, 0]
  }
  if (t < 500) {
    const ratio = (t - 100) / 400
    return [255, Math.floor(255 * (1 - ratio)), 0]
  }
  const ratio = Math.min(1, (t - 500) / 500)
  return [255, Math.floor(255 * ratio), Math.floor(255 * ratio)]
}
