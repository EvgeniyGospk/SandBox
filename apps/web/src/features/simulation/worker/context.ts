import type { SimulationWorkerState } from './state'

import { createInitialWorkerState } from './state'

export type WorkerMetrics = {
  inputOverflowCountTotal: number
  inputOverflowCountSinceLastStats: number
  lastFrameSteps: number
  stepsSinceLastStats: number
  framesSinceLastStats: number
}

export type WorkerContext = {
  state: SimulationWorkerState
  metrics: WorkerMetrics
  loopToken: number
}

function createInitialMetrics(): WorkerMetrics {
  return {
    inputOverflowCountTotal: 0,
    inputOverflowCountSinceLastStats: 0,
    lastFrameSteps: 0,
    stepsSinceLastStats: 0,
    framesSinceLastStats: 0,
  }
}

export function createWorkerContext(): WorkerContext {
  return {
    state: createInitialWorkerState(),
    metrics: createInitialMetrics(),
    loopToken: 0,
  }
}

export function resetWorkerContext(ctx: WorkerContext): void {
  ctx.state = createInitialWorkerState()
  ctx.metrics = createInitialMetrics()
}
