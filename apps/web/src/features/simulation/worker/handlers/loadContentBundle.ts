import type { WorkerContext } from '../context'

function postContentBundleStatus(args: {
  phase: 'init' | 'reload'
  status: 'loading' | 'loaded' | 'error'
  message?: string
}): void {
  self.postMessage({ type: 'CONTENT_BUNDLE_STATUS', ...args })
}

export function handleLoadContentBundle(ctx: WorkerContext, msg: { type: 'LOAD_CONTENT_BUNDLE'; json: string }): void {
  const state = ctx.state
  const engine = state.wasm.engine as unknown as {
    load_content_bundle?: (json: string) => void
    get_content_manifest_json?: () => string
  }

  if (!engine?.load_content_bundle) {
    postContentBundleStatus({
      phase: 'reload',
      status: 'error',
      message: 'WASM build does not expose load_content_bundle',
    })
    return
  }

  try {
    postContentBundleStatus({ phase: 'reload', status: 'loading' })
    engine.load_content_bundle(msg.json)

    // After bundle reload we pause simulation and clear accumulators
    state.sim.isPlaying = false
    state.sim.stepAccumulator = 0

    // Renderer should upload full frame after content changes (colors/ids may change)
    state.render.renderer?.requestFullUpload()

    postContentBundleStatus({ phase: 'reload', status: 'loaded' })

    if (engine.get_content_manifest_json) {
      const manifestJson = engine.get_content_manifest_json()
      self.postMessage({ type: 'CONTENT_MANIFEST', json: manifestJson })
    }
  } catch (e) {
    postContentBundleStatus({
      phase: 'reload',
      status: 'error',
      message: e instanceof Error ? e.message : 'Failed to load content bundle',
    })
  }
}
