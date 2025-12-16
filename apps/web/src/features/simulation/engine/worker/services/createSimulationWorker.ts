import SimulationWorker from '@/features/simulation/worker/runtime.ts?worker'

export function createSimulationWorker(): Worker {
  return new SimulationWorker()
}
