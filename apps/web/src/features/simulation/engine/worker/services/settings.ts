import type { RenderMode } from '../../api/types'

import { postRenderMode, postSettings } from '../bridge'

export function setSettings(
  worker: Worker | null,
  settings: { gravity?: { x: number; y: number }; ambientTemperature?: number; speed?: number }
): void {
  postSettings(worker, settings)
}

export function setRenderMode(worker: Worker | null, mode: RenderMode): void {
  postRenderMode(worker, mode)
}
