import type { ElementType, RenderMode } from '../api/types'

export function postInit(
  worker: Worker,
  args: {
    protocolVersion: number
    canvas: OffscreenCanvas
    width: number
    height: number
    viewportWidth: number
    viewportHeight: number
    inputBuffer: SharedArrayBuffer | null
  }
): void {
  worker.postMessage(
    {
      type: 'INIT',
      protocolVersion: args.protocolVersion,
      canvas: args.canvas,
      width: args.width,
      height: args.height,
      viewportWidth: args.viewportWidth,
      viewportHeight: args.viewportHeight,
      inputBuffer: args.inputBuffer,
    },
    [args.canvas]
  )
}

export function postPlay(worker: Worker | null): void {
  worker?.postMessage({ type: 'PLAY' })
}

export function postPause(worker: Worker | null): void {
  worker?.postMessage({ type: 'PAUSE' })
}

export function postStep(worker: Worker | null): void {
  worker?.postMessage({ type: 'STEP' })
}

export function postClear(worker: Worker | null): void {
  worker?.postMessage({ type: 'CLEAR' })
}

export function postEndStroke(worker: Worker | null): void {
  worker?.postMessage({ type: 'INPUT_END' })
}

export function postTransform(worker: Worker | null, zoom: number, panX: number, panY: number): void {
  worker?.postMessage({
    type: 'TRANSFORM',
    zoom,
    panX,
    panY,
  })
}

export function postSettings(
  worker: Worker | null,
  settings: {
    gravity?: { x: number; y: number }
    ambientTemperature?: number
    speed?: number
  }
): void {
  worker?.postMessage({
    type: 'SETTINGS',
    ...settings,
  })
}

export function postRenderMode(worker: Worker | null, mode: RenderMode): void {
  worker?.postMessage({
    type: 'SET_RENDER_MODE',
    mode,
  })
}

export function postSetViewport(worker: Worker | null, width: number, height: number): void {
  worker?.postMessage({ type: 'SET_VIEWPORT', width, height })
}

export function postResize(worker: Worker | null, width: number, height: number): void {
  worker?.postMessage({
    type: 'RESIZE',
    width,
    height,
  })
}

export function postLoadSnapshot(worker: Worker | null, buffer: ArrayBuffer): void {
  worker?.postMessage({ type: 'LOAD_SNAPSHOT', buffer }, [buffer])
}

export function postSpawnRigidBody(
  worker: Worker | null,
  args: {
    x: number
    y: number
    size: number
    shape: 'box' | 'circle'
    element: ElementType
  }
): void {
  worker?.postMessage({
    type: 'SPAWN_RIGID_BODY',
    x: args.x,
    y: args.y,
    size: args.size,
    shape: args.shape,
    element: args.element,
  })
}
