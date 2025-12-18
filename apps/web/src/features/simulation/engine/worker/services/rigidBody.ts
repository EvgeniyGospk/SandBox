import { postSpawnRigidBody } from '../bridge'

export function spawnRigidBody(args: {
  worker: Worker | null
  x: number
  y: number
  size: number
  shape: 'box' | 'circle'
  elementId: number
}): void {
  postSpawnRigidBody(args.worker, {
    x: args.x,
    y: args.y,
    size: args.size,
    shape: args.shape,
    elementId: args.elementId,
  })
}
