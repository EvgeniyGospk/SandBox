export interface Dimensions {
  width: number
  height: number
}

export interface CameraTransform {
  zoom: number
  panX: number
  panY: number
}

function screenToClip(
  sx: number,
  sy: number,
  viewport: Dimensions
): { x: number; y: number } {
  return {
    x: (sx / viewport.width) * 2 - 1,
    y: 1 - (sy / viewport.height) * 2
  }
}

function applyAspectCorrection(
  clip: { x: number; y: number },
  world: Dimensions,
  viewport: Dimensions,
  invert: boolean
): { x: number; y: number } {
  const worldAspect = world.width / world.height
  const viewportAspect = viewport.width / viewport.height

  // Shader scales the dominant axis to preserve aspect ratio.
  // When inverting, we need to apply the reciprocal scale.
  if (worldAspect > viewportAspect) {
    const factor = viewportAspect / worldAspect
    return invert ? { x: clip.x, y: clip.y * (worldAspect / viewportAspect) } : { x: clip.x, y: clip.y * factor }
  } else {
    const factor = worldAspect / viewportAspect
    return invert ? { x: clip.x * (viewportAspect / worldAspect), y: clip.y } : { x: clip.x * factor, y: clip.y }
  }
}

export function worldToClip(
  worldX: number,
  worldY: number,
  camera: CameraTransform,
  viewport: Dimensions,
  world?: Dimensions
): { x: number; y: number } {
  const worldSize = world ?? viewport

  let cx = (worldX / worldSize.width) * 2 - 1
  let cy = -((worldY / worldSize.height) * 2 - 1)

  const aspect = applyAspectCorrection({ x: cx, y: cy }, worldSize, viewport, false)
  cx = aspect.x
  cy = aspect.y

  const panClipX = (camera.panX / viewport.width) * 2
  const panClipY = -(camera.panY / viewport.height) * 2

  return {
    x: cx * camera.zoom + panClipX,
    y: cy * camera.zoom + panClipY
  }
}

/**
 * Exact inverse of the shader transform.
 */
export function screenToWorld(
  sx: number,
  sy: number,
  camera: CameraTransform,
  viewport: Dimensions,
  world?: Dimensions
): { x: number; y: number } {
  const worldSize = world ?? viewport

  if (
    viewport.width === 0 ||
    viewport.height === 0 ||
    worldSize.width === 0 ||
    worldSize.height === 0
  ) {
    return { x: 0, y: 0 }
  }

  const clip = screenToClip(sx, sy, viewport)

  const panClipX = (camera.panX / viewport.width) * 2
  const panClipY = -(camera.panY / viewport.height) * 2

  let cx = (clip.x - panClipX) / camera.zoom
  let cy = (clip.y - panClipY) / camera.zoom

  const aspect = applyAspectCorrection({ x: cx, y: cy }, worldSize, viewport, true)
  cx = aspect.x
  cy = aspect.y

  cy = -cy

  return {
    x: ((cx + 1) * 0.5) * worldSize.width,
    y: ((cy + 1) * 0.5) * worldSize.height
  }
}

/**
 * Compute pan needed to keep the world point under the cursor fixed
 * when zooming to `newZoom`.
 */
export function solvePanForZoom(
  pivotScreenX: number,
  pivotScreenY: number,
  newZoom: number,
  camera: CameraTransform,
  viewport: Dimensions,
  world?: Dimensions
): CameraTransform {
  const worldSize = world ?? viewport

  const targetClip = screenToClip(pivotScreenX, pivotScreenY, viewport)
  const worldPoint = screenToWorld(pivotScreenX, pivotScreenY, camera, viewport, worldSize)

  const baseClip = worldToClip(worldPoint.x, worldPoint.y, { zoom: newZoom, panX: 0, panY: 0 }, viewport, worldSize)

  const panClipX = targetClip.x - baseClip.x
  const panClipY = targetClip.y - baseClip.y

  return {
    zoom: newZoom,
    panX: (panClipX / 2) * viewport.width,
    panY: -(panClipY / 2) * viewport.height
  }
}
