import type { WasmWorld } from '../types'

export function applySettings(
  world: WasmWorld,
  settings: { gravity?: { x: number; y: number }; ambientTemperature?: number }
): void {
  if (settings.gravity) {
    world.set_gravity(settings.gravity.x, settings.gravity.y)
  }
  if (settings.ambientTemperature !== undefined) {
    world.set_ambient_temperature(settings.ambientTemperature)
  }
}
