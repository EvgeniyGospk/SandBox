import { postClear, postPause, postPlay, postStep } from '../bridge'

export function play(worker: Worker | null): void {
  postPlay(worker)
}

export function pause(worker: Worker | null): void {
  postPause(worker)
}

export function step(worker: Worker | null): void {
  postStep(worker)
}

export function clear(worker: Worker | null): void {
  postClear(worker)
}
