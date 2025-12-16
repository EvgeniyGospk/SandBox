import { postTransform } from '../bridge'

export function setTransform(worker: Worker | null, zoom: number, panX: number, panY: number): void {
  postTransform(worker, zoom, panX, panY)
}
