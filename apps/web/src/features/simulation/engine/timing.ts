// Shared simulation loop constants (worker + main-thread fallback).
// Keep these in one place to avoid subtle behavior drift over time.

export const BASE_STEP_MS = 1000 / 60
export const MAX_DT_MS = 100
export const MAX_STEPS_PER_FRAME = 8

export const FPS_SAMPLES = 20
export const STATS_INTERVAL_MS = 200

