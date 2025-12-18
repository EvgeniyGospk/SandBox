import type { SimulationWorkerState } from '../state'

export function renderThermal(state: SimulationWorkerState): void {
  if (!state.render.pixels || !state.memory.manager) return

  const ambient = state.settings.ambientTemperature ?? 20
  const temperatureView = state.memory.manager.temperature
  const typesView = state.memory.manager.types
  const len = Math.min(temperatureView.length, state.render.pixels.length / 4)

  for (let i = 0; i < len; i++) {
    let temp = temperatureView[i]

    // "Sleeping chunks" don't update per-cell air temperature in the simulation for performance.
    // For thermal visualization (and for a sane UX when changing ambient temp), keep air cells
    // smoothly tracking the ambient temperature here.
    if (typesView[i] === 0) {
      const diff = ambient - temp
      if (Math.abs(diff) > 0.5) {
        temp = temp + diff * 0.02
        temperatureView[i] = temp
      }
    }
    const base = i << 2

    const [r, g, b] = getThermalColor(temp)

    state.render.pixels[base] = r
    state.render.pixels[base + 1] = g
    state.render.pixels[base + 2] = b
    state.render.pixels[base + 3] = 255
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
