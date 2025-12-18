import type { WorkerContext } from '../context'
import { spawnRigidBody } from '../tools'

export function handleSpawnRigidBody(ctx: WorkerContext, msg: {
  type: 'SPAWN_RIGID_BODY'
  x: number
  y: number
  size: number
  shape: 'box' | 'circle'
  elementId: number
}): void {
  if (!ctx.state.wasm.engine) return
  spawnRigidBody(ctx, msg.x, msg.y, msg.size, msg.shape, Math.max(0, Math.min(255, Math.floor(msg.elementId))))
}
