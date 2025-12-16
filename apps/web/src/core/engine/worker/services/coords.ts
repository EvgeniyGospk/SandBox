import { screenToWorldFloored } from '../bridge'

export function screenToWorld(args: {
  screenX: number
  screenY: number
  zoom: number
  panX: number
  panY: number
  viewportWidth: number
  viewportHeight: number
  worldWidth: number
  worldHeight: number
}): { worldX: number; worldY: number } {
  const { x, y } = screenToWorldFloored(
    args.screenX,
    args.screenY,
    args.zoom,
    args.panX,
    args.panY,
    args.viewportWidth,
    args.viewportHeight,
    args.worldWidth,
    args.worldHeight
  )

  return { worldX: x, worldY: y }
}
