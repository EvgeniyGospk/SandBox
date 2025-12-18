# Perf harnesses

This repo includes Node-based perf harnesses for the WASM engine. They load `packages/engine-wasm/*` directly (no browser needed).

## Prereq: build the standard WASM bundle

From repo root:

- `npm run build:wasm`

This generates/updates:

- `packages/engine-wasm/particula_engine.js`
- `packages/engine-wasm/particula_engine_bg.wasm`

## 1) Optimization ablation (recommended)

Runs a small scenario suite against a baseline config and then disables one optimization at a time to show impact.

- `npm run perf:engine`

Useful env vars:

- `WORLD_WIDTH`, `WORLD_HEIGHT` (default `1024x768`)
- `RUNS` (default `1`)
- `MODE=ablation|matrix` (default `ablation`)
- `SCENARIO_FILTER` (substring match on scenario id/label)
- `WARMUP_STEPS`, `MEASURE_STEPS` (global overrides)
- `ENGINE_PERF=1` (also collects `PerfStats.step_ms`; adds overhead)
- `OUT=./perf-report.json` (writes JSON report)

## 2) Legacy sand benchmark

More engine-focused scenarios with detailed engine counters (older harness):

- `npm run perf:sand`
