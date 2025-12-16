import SimulationWorker from '@/workers/simulation/runtime.ts?worker'

export function createSimulationWorker(): Worker {
  return new SimulationWorker()
}
