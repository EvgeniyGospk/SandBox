import { screenToWorld as invertTransform } from '@/features/simulation/engine/transform'
import { readElementAt } from '../tools'
import type { WorkerContext } from '../context'

export function handlePipette(ctx: WorkerContext, msg: { type: 'PIPETTE'; id: number; x: number; y: number }): void {
  const state = ctx.state
  const viewport = { width: state.view.viewportWidth, height: state.view.viewportHeight }
  const worldSize = state.wasm.engine
    ? { width: state.wasm.engine.width as number, height: state.wasm.engine.height as number }
    : { width: 0, height: 0 }

  const world = invertTransform(msg.x, msg.y, state.view.transform, viewport, worldSize)
  const worldX = Math.floor(world.x)
  const worldY = Math.floor(world.y)
  const elementId = readElementAt(ctx, worldX, worldY)

  self.postMessage({ type: 'PIPETTE_RESULT', id: msg.id, elementId })
}
