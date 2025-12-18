import { SIMULATION_PROTOCOL_VERSION } from '@/features/simulation/engine/protocol/index'
import type { InitMessage } from '../types'
import { initEngine } from '../init'
import type { WorkerContext } from '../context'
import { postWorkerError } from '../errors'

export function handleInit(ctx: WorkerContext, msg: InitMessage): void {
  if (msg.protocolVersion !== SIMULATION_PROTOCOL_VERSION) {
    postWorkerError({
      message: `Protocol mismatch (expected ${SIMULATION_PROTOCOL_VERSION}, got ${String(msg.protocolVersion)})`,
      extra: { phase: 'init' },
    })
    return
  }

  void initEngine(ctx, msg.canvas, msg.width, msg.height, msg.viewportWidth, msg.viewportHeight, msg.inputBuffer)
}
