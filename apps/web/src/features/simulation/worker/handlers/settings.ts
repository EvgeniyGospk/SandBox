import type { SettingsMessage } from '../types'
import type { WorkerContext } from '../context'
import { applyCurrentSettingsToEngine } from '../memory'

export function handleSettings(ctx: WorkerContext, msg: SettingsMessage): void {
  const state = ctx.state
  if (msg.gravity) {
    const gx = Number.isFinite(msg.gravity.x) ? msg.gravity.x : 0
    const gy = Number.isFinite(msg.gravity.y) ? msg.gravity.y : 0
    state.settings.gravity = {
      x: Math.max(-50, Math.min(50, gx)),
      y: Math.max(-50, Math.min(50, gy)),
    }
  }

  if (msg.ambientTemperature !== undefined) {
    const t = Number.isFinite(msg.ambientTemperature) ? msg.ambientTemperature : 20
    state.settings.ambientTemperature = Math.max(-273, Math.min(5000, t))
  }

  if (msg.speed !== undefined) {
    const next = Number.isFinite(msg.speed) ? msg.speed : 1
    state.settings.speed = Math.max(0.1, Math.min(8, next))
  }

  applyCurrentSettingsToEngine(ctx)
}
