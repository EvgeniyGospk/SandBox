import { useEffect } from 'react'
import type { MutableRefObject } from 'react'

import type { WorkerBridge } from '@/features/simulation/engine/worker'
import type { WasmParticleEngine } from '@/features/simulation/engine'
import { setLoadContentBundleHandler } from '@/features/simulation/ui/canvas/canvasControls'
import { debugWarn } from '@/platform/logging/log'
import { useSimulationStore } from '@/features/simulation/model/simulationStore'

export function useLoadContentBundleHandler(args: {
  bridgeRef: MutableRefObject<WorkerBridge | null>
  engineRef: MutableRefObject<WasmParticleEngine | null>
}): void {
  const { bridgeRef, engineRef } = args

  useEffect(() => {
    setLoadContentBundleHandler((json) => {
      useSimulationStore.getState().setContentManifestJson(null)
      useSimulationStore.getState().setContentBundleStatus({ phase: 'reload', status: 'loading' })

      if (bridgeRef.current) {
        bridgeRef.current.loadContentBundle(json)
        return
      }

      if (engineRef.current) {
        debugWarn('Load content bundle is not supported in main-thread fallback mode')
        useSimulationStore
          .getState()
          .setContentBundleStatus({ phase: 'reload', status: 'error', message: 'Not supported in fallback mode' })
        return
      }

      debugWarn('Load content bundle requested but simulation backend is not initialized')
      useSimulationStore
        .getState()
        .setContentBundleStatus({ phase: 'reload', status: 'error', message: 'Simulation backend not initialized' })
    })

    return () => setLoadContentBundleHandler(null)
  }, [bridgeRef, engineRef])
}
