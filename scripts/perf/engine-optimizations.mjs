// Engine optimization benchmark harness (ablation-style).
//
// Goals:
// - Run repeatable scenarios against the WASM engine from Node (no browser needed).
// - Toggle individual engine optimizations on/off to measure impact (speedups/slowdowns).
// - Produce a machine-readable JSON report for tracking over time.
//
// Usage examples:
//   node scripts/perf/engine-optimizations.mjs
//   RUNS=3 WORLD_WIDTH=2048 WORLD_HEIGHT=1024 node scripts/perf/engine-optimizations.mjs
//   SCENARIO_FILTER=empty node scripts/perf/engine-optimizations.mjs
//   OUT=./perf-report.json node scripts/perf/engine-optimizations.mjs

import { performance } from 'node:perf_hooks'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const wasmPath = resolve(__dirname, '../../packages/engine-wasm/particula_engine.js')
const wasmBytesPath = resolve(__dirname, '../../packages/engine-wasm/particula_engine_bg.wasm')

const WORLD_WIDTH = Number.parseInt(process.env.WORLD_WIDTH ?? '1024', 10)
const WORLD_HEIGHT = Number.parseInt(process.env.WORLD_HEIGHT ?? '768', 10)

const RUNS = Math.max(1, Number.parseInt(process.env.RUNS ?? '1', 10))
const SEED = Number.parseInt(process.env.SEED ?? '1337', 10) >>> 0

const ENGINE_PERF = (process.env.ENGINE_PERF ?? '0').toLowerCase().trim() === '1'
const OUT = (process.env.OUT ?? '').trim()
const SCENARIO_FILTER = (process.env.SCENARIO_FILTER ?? '').trim()
const MODE = (process.env.MODE ?? 'ablation').toLowerCase().trim()

const OVERRIDE_WARMUP_STEPS = process.env.WARMUP_STEPS ? Number.parseInt(process.env.WARMUP_STEPS, 10) : null
const OVERRIDE_MEASURE_STEPS = process.env.MEASURE_STEPS ? Number.parseInt(process.env.MEASURE_STEPS, 10) : null

function nowIso() {
  return new Date().toISOString()
}

function hashStringToU32(s) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function makeXorshift32(seed) {
  let state = seed >>> 0
  return () => {
    // xorshift32
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state >>>= 0
    state ^= state << 5
    state >>>= 0
    return state >>> 0
  }
}

function randInt(rngU32, max) {
  if (max <= 0) return 0
  return rngU32() % max
}

function quantiles(nums) {
  if (!nums.length) return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0, n: 0 }
  const sorted = [...nums].sort((a, b) => a - b)
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
  const sum = nums.reduce((a, b) => a + b, 0)
  return {
    n: nums.length,
    avg: sum / nums.length,
    p50: pick(0.5),
    p95: pick(0.95),
    p99: pick(0.99),
    max: sorted[sorted.length - 1],
  }
}

async function loadWasm() {
  const wasmModule = await import(wasmPath)
  const wasmBytes = await readFile(wasmBytesPath)
  await wasmModule.default({ module_or_path: wasmBytes })
  return wasmModule
}

function getElementIds(wasm) {
  return {
    EMPTY: wasm.el_empty(),
    STONE: wasm.el_stone(),
    SAND: wasm.el_sand(),
    WATER: wasm.el_water(),
    LAVA: wasm.el_lava(),
    ICE: wasm.el_ice(),
  }
}

function safeCall(world, name, arg) {
  const fn = world?.[name]
  if (typeof fn === 'function') fn.call(world, arg)
}

function applyConfig(world, config) {
  // Most toggles are intended for perf experiments; older WASM builds may not expose them.
  safeCall(world, 'set_chunk_sleeping_enabled', config.chunkSleeping)
  safeCall(world, 'set_chunk_gating_enabled', config.chunkGating)
  safeCall(world, 'set_sparse_row_skip_enabled', config.sparseRowSkip)
  safeCall(world, 'set_temperature_every_frame', config.temperatureEveryFrame)
  world.enable_perf_metrics(ENGINE_PERF)
}

function fillRect(world, x0, y0, w, h, element) {
  let placed = 0
  const t0 = performance.now()
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (world.add_particle(x, y, element)) placed++
    }
  }
  return { placed, elapsedMs: performance.now() - t0 }
}

function spawnRandom(world, rngU32, element, targetCount, yMax = WORLD_HEIGHT) {
  const t0 = performance.now()
  let placed = 0
  const maxAttempts = targetCount * 3
  for (let i = 0; i < maxAttempts && placed < targetCount; i++) {
    const x = randInt(rngU32, WORLD_WIDTH)
    const y = randInt(rngU32, Math.max(1, yMax))
    if (world.add_particle(x, y, element)) placed++
  }
  return { placed, elapsedMs: performance.now() - t0 }
}

const OPTS = [
  {
    id: 'chunk_sleeping',
    label: 'Empty-chunk sleeping',
    baseline: true,
    variant: false,
    key: 'chunkSleeping',
  },
  {
    id: 'chunk_gating',
    label: 'Chunk gating (skip inactive chunks)',
    baseline: true,
    variant: false,
    key: 'chunkGating',
  },
  {
    id: 'sparse_row_skip',
    label: 'Sparse row skip (row_has_data)',
    baseline: true,
    variant: false,
    key: 'sparseRowSkip',
  },
  {
    id: 'temperature_every_frame',
    label: 'Temperature every frame (disables 1/4 rate)',
    baseline: false,
    variant: true,
    key: 'temperatureEveryFrame',
  },
]

const BASELINE_CONFIG = {
  chunkSleeping: true,
  chunkGating: true,
  sparseRowSkip: true,
  temperatureEveryFrame: false,
}

function makeVariantConfig(opt) {
  return { ...BASELINE_CONFIG, [opt.key]: opt.variant }
}

function configId(cfg) {
  const b = (v) => (v ? '1' : '0')
  return `sleep=${b(cfg.chunkSleeping)} gate=${b(cfg.chunkGating)} row=${b(cfg.sparseRowSkip)} tempEvery=${b(cfg.temperatureEveryFrame)}`
}

function formatMs(q) {
  return `avg/p50/p95/p99/max=${q.avg.toFixed(2)}/${q.p50.toFixed(2)}/${q.p95.toFixed(2)}/${q.p99.toFixed(
    2
  )}/${q.max.toFixed(2)} ms (n=${q.n})`
}

function ratio(a, b) {
  // a / b, handling zero-ish baselines
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null
  return a / b
}

async function runScenarioOnce(wasm, EL, scenario, config, runIndex) {
  const world = new wasm.World(WORLD_WIDTH, WORLD_HEIGHT)
  applyConfig(world, config)

  const rngSeed = (SEED ^ hashStringToU32(scenario.id) ^ (runIndex * 0x9e3779b9)) >>> 0
  const rngU32 = makeXorshift32(rngSeed)

  const spawnResults = []
  for (const spawn of scenario.spawns) {
    spawnResults.push(spawn(world, rngU32, EL))
  }

  const warmupSteps =
    OVERRIDE_WARMUP_STEPS !== null && Number.isFinite(OVERRIDE_WARMUP_STEPS)
      ? OVERRIDE_WARMUP_STEPS
      : (scenario.warmupSteps ?? 0)
  const measureSteps =
    OVERRIDE_MEASURE_STEPS !== null && Number.isFinite(OVERRIDE_MEASURE_STEPS)
      ? OVERRIDE_MEASURE_STEPS
      : scenario.measureSteps

  for (let i = 0; i < warmupSteps; i++) {
    scenario.perStep?.(world, rngU32, EL, i, true)
    world.step()
  }

  const outerStepMs = []
  const perfStepMs = []

  for (let i = 0; i < measureSteps; i++) {
    scenario.perStep?.(world, rngU32, EL, i, false)

    const t0 = performance.now()
    world.step()
    outerStepMs.push(performance.now() - t0)

    if (ENGINE_PERF) {
      // `PerfStats` is a wasm-bindgen class with getters.
      const stats = world.get_perf_stats()
      if (typeof stats?.step_ms === 'number') perfStepMs.push(stats.step_ms)
    }
  }

  const endState = {
    particleCount: world.particle_count ?? 0,
    activeChunks: typeof world.active_chunks === 'function' ? world.active_chunks() : 0,
    totalChunks: typeof world.total_chunks === 'function' ? world.total_chunks() : 0,
  }

  return {
    spawn: spawnResults,
    outerStepMs,
    perfStepMs,
    endState,
  }
}

async function runScenario(wasm, EL, scenario, config) {
  const outerAll = []
  const perfAll = []

  let endState = null
  const spawns = []

  for (let runIndex = 0; runIndex < RUNS; runIndex++) {
    const res = await runScenarioOnce(wasm, EL, scenario, config, runIndex)
    outerAll.push(...res.outerStepMs)
    perfAll.push(...res.perfStepMs)
    endState = res.endState
    spawns.push(res.spawn)
  }

  return {
    outer: quantiles(outerAll),
    perfStepMs: ENGINE_PERF ? quantiles(perfAll) : null,
    endState,
    spawns,
  }
}

async function main() {
  const wasm = await loadWasm()
  const EL = getElementIds(wasm)

  const cells = WORLD_WIDTH * WORLD_HEIGHT
  const sandCount = Math.min(Math.floor(cells * 0.55), cells)

  const scenarios = [
    {
      id: 'pile_corner_sand',
      label: 'Corner pile (rest empty)',
      spawns: [
        (world, _rng, EL2) => {
          const w = Math.min(WORLD_WIDTH, 512)
          const h = Math.min(WORLD_HEIGHT, 512)
          return fillRect(world, 0, 0, w, h, EL2.SAND)
        },
      ],
      warmupSteps: 40,
      measureSteps: 180,
    },
    {
      id: 'half_bottom_sand',
      label: 'Bottom half filled with sand (50% occupancy)',
      spawns: [
        (world, _rng, EL2) => {
          const startY = Math.floor(WORLD_HEIGHT / 2)
          return fillRect(world, 0, startY, WORLD_WIDTH, WORLD_HEIGHT - startY, EL2.SAND)
        },
      ],
      // Allow empty top-half chunks to transition to Sleeping (threshold=60 frames).
      warmupSteps: 80,
      measureSteps: 240,
    },
    {
      id: 'half_bottom_water_over_lava',
      label: 'Bottom half filled (water over lava, 50% occupancy)',
      spawns: [
        (world, _rng, EL2) => {
          const halfY = Math.floor(WORLD_HEIGHT / 2)
          const midY = Math.floor((WORLD_HEIGHT * 3) / 4)
          const water = fillRect(world, 0, halfY, WORLD_WIDTH, midY - halfY, EL2.WATER)
          const lava = fillRect(world, 0, midY, WORLD_WIDTH, WORLD_HEIGHT - midY, EL2.LAVA)
          return { placed: water.placed + lava.placed, elapsedMs: water.elapsedMs + lava.elapsedMs }
        },
      ],
      warmupSteps: 80,
      measureSteps: 240,
    },
    {
      id: 'sparse_scatter_50k',
      label: 'Sparse scatter (row skip sensitivity)',
      spawns: [
        (world, rng, EL2) => spawnRandom(world, rng, EL2.SAND, Math.min(50_000, Math.floor(cells * 0.05))),
        (world, rng, EL2) => spawnRandom(world, rng, EL2.WATER, Math.min(20_000, Math.floor(cells * 0.02))),
      ],
      warmupSteps: 40,
      measureSteps: 120,
    },
    {
      id: 'static_sand',
      label: `Static sand (~${Math.round((sandCount / cells) * 100)}% occupancy)`,
      spawns: [(world, rng, EL2) => spawnRandom(world, rng, EL2.SAND, sandCount)],
      warmupSteps: 30,
      measureSteps: 120,
    },
    {
      id: 'water_lava_stripe',
      label: 'Water/lava stripe (reactions + temperature)',
      spawns: [
        (world, _rng, EL2) => {
          const t0 = performance.now()
          const y = Math.floor(WORLD_HEIGHT / 2)
          let placed = 0
          for (let x = 0; x < WORLD_WIDTH; x++) {
            if (world.add_particle(x, y, EL2.WATER)) placed++
            if (y > 0 && world.add_particle(x, y - 1, EL2.LAVA)) placed++
          }
          return { placed, elapsedMs: performance.now() - t0 }
        },
      ],
      warmupSteps: 80,
      measureSteps: 240,
    },
    {
      id: 'temperature_hot_cold_blocks',
      label: 'Hot/cold blocks (phase + temperature)',
      spawns: [
        (world, _rng, EL2) => {
          const t0 = performance.now()
          let placed = 0
          // Hot block
          for (let x = 0; x < Math.min(256, WORLD_WIDTH); x++) {
            for (let y = 0; y < Math.min(128, WORLD_HEIGHT); y++) {
              if (world.add_particle(x, y, EL2.LAVA)) placed++
            }
          }
          // Cold block
          for (let x = Math.min(512, WORLD_WIDTH - 1); x < Math.min(768, WORLD_WIDTH); x++) {
            for (let y = 0; y < Math.min(128, WORLD_HEIGHT); y++) {
              if (world.add_particle(x, y, EL2.ICE)) placed++
            }
          }
          return { placed, elapsedMs: performance.now() - t0 }
        },
      ],
      warmupSteps: 80,
      measureSteps: 240,
    },
    {
      id: 'empty_world',
      label: 'Empty world (sleep dominates, sanity check)',
      spawns: [(_world) => ({ placed: 0, elapsedMs: 0 })],
      warmupSteps: 80,
      measureSteps: 240,
    },
  ]

  const selectedScenarios = SCENARIO_FILTER
    ? scenarios.filter((s) => s.id.includes(SCENARIO_FILTER) || s.label.includes(SCENARIO_FILTER))
    : scenarios

  if (selectedScenarios.length === 0) {
    console.error(`No scenarios matched SCENARIO_FILTER=${JSON.stringify(SCENARIO_FILTER)}`)
    process.exitCode = 2
    return
  }

  console.log(`=== Particula engine optimization perf (${WORLD_WIDTH}x${WORLD_HEIGHT}) ===`)
  console.log(`runs=${RUNS} seed=${SEED} engine_perf=${ENGINE_PERF} mode=${MODE} started_at=${nowIso()}`)
  if (OVERRIDE_WARMUP_STEPS !== null) console.log(`WARMUP_STEPS override: ${OVERRIDE_WARMUP_STEPS}`)
  if (OVERRIDE_MEASURE_STEPS !== null) console.log(`MEASURE_STEPS override: ${OVERRIDE_MEASURE_STEPS}`)

  const report = {
    meta: {
      startedAt: nowIso(),
      world: { width: WORLD_WIDTH, height: WORLD_HEIGHT, cells },
      runs: RUNS,
      seed: SEED,
      enginePerf: ENGINE_PERF,
      warmupStepsOverride: OVERRIDE_WARMUP_STEPS,
      measureStepsOverride: OVERRIDE_MEASURE_STEPS,
      baselineConfig: BASELINE_CONFIG,
      optimizations: OPTS.map((o) => ({ id: o.id, label: o.label, key: o.key, baseline: o.baseline, variant: o.variant })),
    },
    scenarios: [],
  }

  for (const scenario of selectedScenarios) {
    console.log(`\n--- Scenario: ${scenario.id} ---`)

    const baselineRes = await runScenario(wasm, EL, scenario, BASELINE_CONFIG)
    console.log(`baseline outer: ${formatMs(baselineRes.outer)}`)

    if (MODE === 'matrix') {
      const keys = /** @type {const} */ (['chunkSleeping', 'chunkGating', 'sparseRowSkip', 'temperatureEveryFrame'])
      const configs = []
      for (let mask = 0; mask < (1 << keys.length); mask++) {
        const cfg = { ...BASELINE_CONFIG }
        for (let i = 0; i < keys.length; i++) {
          cfg[keys[i]] = ((mask >> i) & 1) === 1
        }
        configs.push(cfg)
      }

      const results = []
      for (const cfg of configs) {
        const res = await runScenario(wasm, EL, scenario, cfg)
        const slowdown = ratio(res.outer.avg, baselineRes.outer.avg)
        results.push({
          id: configId(cfg),
          config: cfg,
          outer: res.outer,
          perfStepMs: res.perfStepMs,
          endState: res.endState,
          slowdownAvgVsBaseline: slowdown,
        })
      }

      results.sort((a, b) => (a.slowdownAvgVsBaseline ?? Infinity) - (b.slowdownAvgVsBaseline ?? Infinity))

      const topN = Math.min(6, results.length)
      console.log(`matrix fastest (top ${topN} by avg):`)
      for (let i = 0; i < topN; i++) {
        const r = results[i]
        const s = r.slowdownAvgVsBaseline === null ? 'n/a' : `x${r.slowdownAvgVsBaseline.toFixed(2)}`
        console.log(`  ${r.id} -> ${formatMs(r.outer)} | ${s}`)
      }

      report.scenarios.push({
        id: scenario.id,
        label: scenario.label,
        baseline: {
          config: BASELINE_CONFIG,
          outer: baselineRes.outer,
          perfStepMs: baselineRes.perfStepMs,
          endState: baselineRes.endState,
        },
        matrix: results,
      })
    } else {
      const variants = []
      for (const opt of OPTS) {
        const cfg = makeVariantConfig(opt)
        const res = await runScenario(wasm, EL, scenario, cfg)
        const slowdown = ratio(res.outer.avg, baselineRes.outer.avg)

        const suffix = slowdown === null ? '' : ` | x${slowdown.toFixed(2)}`
        console.log(`${opt.id}: ${formatMs(res.outer)}${suffix}`)

        variants.push({
          optId: opt.id,
          config: cfg,
          outer: res.outer,
          perfStepMs: res.perfStepMs,
          endState: res.endState,
          slowdownAvgVsBaseline: slowdown,
        })
      }

      report.scenarios.push({
        id: scenario.id,
        label: scenario.label,
        baseline: {
          config: BASELINE_CONFIG,
          outer: baselineRes.outer,
          perfStepMs: baselineRes.perfStepMs,
          endState: baselineRes.endState,
        },
        variants,
      })
    }
  }

  if (OUT) {
    await writeFile(OUT, JSON.stringify(report, null, 2), 'utf8')
    console.log(`\nWrote report to ${OUT}`)
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err)
  process.exitCode = 1
})
