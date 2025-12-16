import { SIMULATION_PROTOCOL_VERSION } from '@/features/simulation/engine/protocol/index'
import type { InitMessage } from '../types'
import { initEngine } from '../init'

export function handleInit(msg: InitMessage): void {
  if (msg.protocolVersion !== SIMULATION_PROTOCOL_VERSION) {
    self.postMessage({
      type: 'ERROR',
      message: `Protocol mismatch (expected ${SIMULATION_PROTOCOL_VERSION}, got ${String(msg.protocolVersion)})`,
    })
    return
  }

  void initEngine(msg.canvas, msg.width, msg.height, msg.viewportWidth, msg.viewportHeight, msg.inputBuffer)
}
