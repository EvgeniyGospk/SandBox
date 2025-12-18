type CanvasControlsState = {
  resetCameraHandler: (() => void) | null
  loadContentBundleHandler: ((json: string) => void) | null
  pendingContentBundleJson: string | null
}

function getState(): CanvasControlsState {
  const g = globalThis as unknown as Record<string, unknown>
  const key = '__particula_canvas_controls__'
  const existing = g[key] as CanvasControlsState | undefined
  if (existing) return existing
  const created: CanvasControlsState = {
    resetCameraHandler: null,
    loadContentBundleHandler: null,
    pendingContentBundleJson: null,
  }
  g[key] = created
  return created
}

export function setResetCameraHandler(handler: (() => void) | null): void {
  getState().resetCameraHandler = handler
}

export function resetCamera(): void {
  const h = getState().resetCameraHandler
  if (!h) {
    console.warn('resetCamera called but no handler is registered yet')
    return
  }
  h()
}

export function setLoadContentBundleHandler(handler: ((json: string) => void) | null): void {
  const state = getState()
  state.loadContentBundleHandler = handler
  if (handler && state.pendingContentBundleJson !== null) {
    const pending = state.pendingContentBundleJson
    state.pendingContentBundleJson = null
    handler(pending)
  }
}

export function loadContentBundleJson(json: string): void {
  const state = getState()
  const h = state.loadContentBundleHandler
  if (!h) {
    state.pendingContentBundleJson = json
    console.warn('loadContentBundleJson called but no handler is registered yet; buffering payload')
    return
  }
  h(json)
}

