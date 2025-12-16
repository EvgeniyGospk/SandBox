import type { MutableRefObject } from 'react'
import type { ISimulationBackend } from '@/features/simulation/engine/api/ISimulationBackend'
import type { WorkerBridge } from '@/features/simulation/engine/worker'
import type { WasmParticleEngine } from '@/features/simulation/engine'

export function cleanupSimulationBackend(args: {
  bridgeRef: MutableRefObject<WorkerBridge | null>
  engineRef: MutableRefObject<WasmParticleEngine | null>
  setBackend: (backend: ISimulationBackend | null) => void
  canvasTransferredRef: MutableRefObject<boolean>
}): void {
  const { bridgeRef, engineRef, setBackend, canvasTransferredRef } = args

  if (bridgeRef.current) {
    bridgeRef.current.destroy()
    bridgeRef.current = null
  }

  if (engineRef.current) {
    engineRef.current.destroy()
    engineRef.current = null
  }

  setBackend(null)
  canvasTransferredRef.current = false
}
