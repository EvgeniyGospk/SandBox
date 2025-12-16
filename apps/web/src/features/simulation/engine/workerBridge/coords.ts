import { screenToWorld as invertTransform } from '../transform'

export function screenToWorldFloored(
  screenX: number,
  screenY: number,
  zoom: number,
  panX: number,
  panY: number,
  viewportWidth: number,
  viewportHeight: number,
  worldWidth: number,
  worldHeight: number
): { x: number; y: number } {
  const viewport = { width: viewportWidth, height: viewportHeight }
  const worldSize = { width: worldWidth, height: worldHeight }
  const world = invertTransform(screenX, screenY, { zoom, panX, panY }, viewport, worldSize)
  return {
    x: Math.floor(world.x),
    y: Math.floor(world.y),
  }
}
