import { screenToWorld as invertTransform } from '@/features/simulation/engine/transform'
import { state } from '../state'
import { readElementAt } from '../tools'

export function handlePipette(msg: { type: 'PIPETTE'; id: number; x: number; y: number }): void {
  const viewport = { width: state.viewportWidth, height: state.viewportHeight }
  const worldSize = state.engine
    ? { width: state.engine.width as number, height: state.engine.height as number }
    : { width: 0, height: 0 }

  const world = invertTransform(msg.x, msg.y, { zoom: state.zoom, panX: state.panX, panY: state.panY }, viewport, worldSize)
  const worldX = Math.floor(world.x)
  const worldY = Math.floor(world.y)
  const element = readElementAt(worldX, worldY)

  self.postMessage({ type: 'PIPETTE_RESULT', id: msg.id, element })
}
