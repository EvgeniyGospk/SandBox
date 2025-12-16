import type { SettingsMessage } from '../types'
import { state } from '../state'
import { applyCurrentSettingsToEngine } from '../memory'

export function handleSettings(msg: SettingsMessage): void {
  if (msg.gravity) {
    const gx = Number.isFinite(msg.gravity.x) ? msg.gravity.x : 0
    const gy = Number.isFinite(msg.gravity.y) ? msg.gravity.y : 0
    state.currentGravity = {
      x: Math.max(-50, Math.min(50, gx)),
      y: Math.max(-50, Math.min(50, gy)),
    }
  }

  if (msg.ambientTemperature !== undefined) {
    const t = Number.isFinite(msg.ambientTemperature) ? msg.ambientTemperature : 20
    state.currentAmbientTemperature = Math.max(-273, Math.min(5000, t))
  }

  if (msg.speed !== undefined) {
    const next = Number.isFinite(msg.speed) ? msg.speed : 1
    state.speed = Math.max(0.1, Math.min(8, next))
  }

  applyCurrentSettingsToEngine()
}
