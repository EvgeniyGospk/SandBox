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

let WORLD_WIDTH = Number.parseInt(process.env.WORLD_WIDTH ?? '1024', 10)
let WORLD_HEIGHT = Number.parseInt(process.env.WORLD_HEIGHT ?? '768', 10)

const RUNS = Math.max(1, Number.parseInt(process.env.RUNS ?? '1', 10))
const SEED = Number.parseInt(process.env.SEED ?? '1337', 10) >>> 0

const ENGINE_PERF = (process.env.ENGINE_PERF ?? '0').toLowerCase().trim() === '1'
const ENGINE_PERF_DETAILED = (process.env.ENGINE_PERF_DETAILED ?? '0').toLowerCase().trim() === '1'
const ENGINE_PERF_SPLIT = (process.env.ENGINE_PERF_SPLIT ?? '0').toLowerCase().trim() === '1'
const OUT = (process.env.OUT ?? '').trim()
const SCENARIO_FILTER = (process.env.SCENARIO_FILTER ?? '').trim()
const MODE = (process.env.MODE ?? 'ablation').toLowerCase().trim()

const WORLD_SIZES = (process.env.WORLD_SIZES ?? '').trim()
const OCCUPANCIES = (process.env.OCCUPANCIES ?? '').trim()

const TARGET_PARTICLES = Math.max(0, Number.parseInt(process.env.TARGET_PARTICLES ?? '200000', 10))
const TARGET_DENSITY = process.env.TARGET_DENSITY ? Number.parseFloat(process.env.TARGET_DENSITY) : null
const RANDOM_ELEMENTS_N = Math.max(1, Number.parseInt(process.env.RANDOM_ELEMENTS_N ?? '5', 10))

const OVERRIDE_WARMUP_STEPS = process.env.WARMUP_STEPS ? Number.parseInt(process.env.WARMUP_STEPS, 10) : null
const OVERRIDE_MEASURE_STEPS = process.env.MEASURE_STEPS ? Number.parseInt(process.env.MEASURE_STEPS, 10) : null

function nowIso() {
  return new Date().toISOString()
}

function fpsFromMsQuantiles(q) {
  const inv = (ms) => (ms > 0 ? 1000 / ms : 0)
  return {
    n: q.n,
    avg: inv(q.avg),
    p50: inv(q.p50),
    p95: inv(q.p95),
    p99: inv(q.p99),
    min: inv(q.max),
  }
}

function parseCsvInts(s) {
  if (!s) return []
  return s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => Number.parseInt(v, 10))
    .filter((v) => Number.isFinite(v) && v > 0)
}

function parseCsvFloats(s) {
  if (!s) return []
  return s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => Number.parseFloat(v))
    .filter((v) => Number.isFinite(v) && v >= 0)
}

function pickRandomUnique(rngU32, arr, n) {
  const pool = [...arr]
  const out = []
  while (pool.length > 0 && out.length < n) {
    const idx = rngU32() % pool.length
    out.push(pool[idx])
    pool.splice(idx, 1)
  }
  return out
}

function spawnRandomInRect(world, rngU32, element, targetCount, rect) {
  const t0 = performance.now()
  let placed = 0
  const maxAttempts = targetCount * 3
  const x0 = Math.max(0, rect.x | 0)
  const y0 = Math.max(0, rect.y | 0)
  const x1 = Math.max(x0 + 1, rect.x2 | 0)
  const y1 = Math.max(y0 + 1, rect.y2 | 0)
  const w = Math.max(1, x1 - x0)
  const h = Math.max(1, y1 - y0)
  for (let i = 0; i < maxAttempts && placed < targetCount; i++) {
    const x = x0 + (rngU32() % w)
    const y = y0 + (rngU32() % h)
    if (world.add_particle(x, y, element)) placed++
  }
  return { placed, elapsedMs: performance.now() - t0 }
}

function spawnUniqueScatterInRect(world, rngU32, element, targetCount, rect) {
  const t0 = performance.now()
  let placed = 0
  const x0 = Math.max(0, rect.x | 0)
  const y0 = Math.max(0, rect.y | 0)
  const x1 = Math.max(x0 + 1, rect.x2 | 0)
  const y1 = Math.max(y0 + 1, rect.y2 | 0)
  const w = Math.max(1, x1 - x0)
  const h = Math.max(1, y1 - y0)
  const area = w * h
  if (targetCount <= 0 || area <= 0) return { placed: 0, elapsedMs: performance.now() - t0 }

  const gcd = (a, b) => {
    let x = Math.abs(a)
    let y = Math.abs(b)
    while (y !== 0) {
      const t = x % y
      x = y
      y = t
    }
    return x
  }

  const start = rngU32() % area
  let step = (rngU32() | 1) % area
  if (step === 0) step = 1
  for (let i = 0; i < 64 && gcd(step, area) !== 1; i++) {
    step = (step + 2) % area
    if (step === 0) step = 1
  }
  if (gcd(step, area) !== 1) step = 1

  for (let i = 0; i < area && placed < targetCount; i++) {
    const idx = (start + (i * step)) % area
    const x = x0 + (idx % w)
    const y = y0 + Math.floor(idx / w)
    if (world.add_particle(x, y, element)) placed++
  }

  return { placed, elapsedMs: performance.now() - t0 }
}

function extractBundleElementIndex(bundleJson) {
  let bundle
  try {
    bundle = JSON.parse(bundleJson)
  } catch {
    return { ids: [], idToKey: new Map() }
  }
  const els = Array.isArray(bundle?.elements) ? bundle.elements : []
  const ids = []
  const idToKey = new Map()
  for (const el of els) {
    const id = Number(el?.id)
    if (!Number.isFinite(id)) continue
    const hidden = Boolean(el?.hidden)
    const key = typeof el?.key === 'string' ? el.key : null
    if (key) idToKey.set(id, key)
    if (hidden) continue
    if (id === 0) continue
    ids.push(id)
  }
  return { ids, idToKey }
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
  world.enable_perf_metrics(ENGINE_PERF)
  safeCall(world, 'enable_perf_detailed_metrics', ENGINE_PERF_DETAILED)
  safeCall(world, 'enable_perf_split_metrics', ENGINE_PERF_SPLIT)
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

const OPTS = []

const BASELINE_CONFIG = {}

function makeVariantConfig(opt) {
  return { ...BASELINE_CONFIG, [opt.key]: opt.variant }
}

function configId(cfg) {
  return 'baseline'
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

async function runScenarioOnce(wasm, EL, scenario, config, runIndex, contentBundleJson) {
  const world = new wasm.World(WORLD_WIDTH, WORLD_HEIGHT)
  applyConfig(world, config)

  if (contentBundleJson && typeof world.load_content_bundle === 'function') {
    try {
      world.load_content_bundle(contentBundleJson)
    } catch {
    }
  }

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
  const perfBreakdown = ENGINE_PERF
    ? {
        rigid_ms: [],
        physics_ms: [],
        physics_raycast_ms: [],
        physics_other_ms: [],
        chunks_ms: [],
        chunks_empty_ms: [],
        chunks_non_empty_ms: [],
        temperature_ms: [],
        temperature_air_ms: [],
        temperature_particle_ms: [],
        powder_ms: [],
        liquid_ms: [],
        gas_ms: [],
        energy_ms: [],
        utility_ms: [],
        bio_ms: [],
      }
    : null

  const perfCounters = ENGINE_PERF
    ? {
        particles_processed: [],
        chunk_empty_cells: [],
        chunk_non_empty_cells: [],
        particles_moved: [],
        reactions_checked: [],
        reactions_applied: [],
        temp_cells: [],
        simd_air_cells: [],
        phase_changes: [],
        liquid_scans: [],
        physics_calls: [],
        raycast_steps_total: [],
        raycast_collisions: [],
        behavior_calls: [],
        behavior_powder: [],
        behavior_liquid: [],
        behavior_gas: [],
        behavior_energy: [],
        behavior_utility: [],
        behavior_bio: [],
        grid_size: [],
        memory_bytes: [],
        active_chunks: [],
        particle_count: [],
        non_empty_cells: [],
      }
    : null

  const readStat = (stats, key) => {
    const v = stats?.[key]
    if (typeof v === 'number') return v
    if (typeof v === 'function') return v.call(stats)
    return null
  }

  for (let i = 0; i < measureSteps; i++) {
    scenario.perStep?.(world, rngU32, EL, i, false)

    const t0 = performance.now()
    world.step()
    outerStepMs.push(performance.now() - t0)

    if (ENGINE_PERF) {
      const stats = world.get_perf_stats()
      if (typeof stats?.step_ms === 'number') perfStepMs.push(stats.step_ms)
      if (perfBreakdown) {
        if (typeof stats?.rigid_ms === 'number') perfBreakdown.rigid_ms.push(stats.rigid_ms)
        if (typeof stats?.physics_ms === 'number') perfBreakdown.physics_ms.push(stats.physics_ms)
        if (typeof stats?.physics_raycast_ms === 'number') perfBreakdown.physics_raycast_ms.push(stats.physics_raycast_ms)
        if (typeof stats?.physics_other_ms === 'number') perfBreakdown.physics_other_ms.push(stats.physics_other_ms)
        if (typeof stats?.chunks_ms === 'number') perfBreakdown.chunks_ms.push(stats.chunks_ms)
        if (typeof stats?.chunks_empty_ms === 'number') perfBreakdown.chunks_empty_ms.push(stats.chunks_empty_ms)
        if (typeof stats?.chunks_non_empty_ms === 'number') perfBreakdown.chunks_non_empty_ms.push(stats.chunks_non_empty_ms)
        if (typeof stats?.temperature_ms === 'number') perfBreakdown.temperature_ms.push(stats.temperature_ms)
        if (typeof stats?.temperature_air_ms === 'number') perfBreakdown.temperature_air_ms.push(stats.temperature_air_ms)
        if (typeof stats?.temperature_particle_ms === 'number') perfBreakdown.temperature_particle_ms.push(stats.temperature_particle_ms)
        if (typeof stats?.powder_ms === 'number') perfBreakdown.powder_ms.push(stats.powder_ms)
        if (typeof stats?.liquid_ms === 'number') perfBreakdown.liquid_ms.push(stats.liquid_ms)
        if (typeof stats?.gas_ms === 'number') perfBreakdown.gas_ms.push(stats.gas_ms)
        if (typeof stats?.energy_ms === 'number') perfBreakdown.energy_ms.push(stats.energy_ms)
        if (typeof stats?.utility_ms === 'number') perfBreakdown.utility_ms.push(stats.utility_ms)
        if (typeof stats?.bio_ms === 'number') perfBreakdown.bio_ms.push(stats.bio_ms)
      }
      if (perfCounters) {
        for (const k of Object.keys(perfCounters)) {
          const val = readStat(stats, k)
          if (typeof val === 'number') perfCounters[k].push(val)
        }
      }
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
    perfBreakdown,
    perfCounters,
    endState,
  }
}

async function runScenario(wasm, EL, scenario, config, contentBundleJson) {
  const outerAll = []
  const perfAll = []
  const breakdownAll = ENGINE_PERF
    ? {
        rigid_ms: [],
        physics_ms: [],
        physics_raycast_ms: [],
        physics_other_ms: [],
        chunks_ms: [],
        chunks_empty_ms: [],
        chunks_non_empty_ms: [],
        temperature_ms: [],
        temperature_air_ms: [],
        temperature_particle_ms: [],
        powder_ms: [],
        liquid_ms: [],
        gas_ms: [],
        energy_ms: [],
        utility_ms: [],
        bio_ms: [],
      }
    : null

  const countersAll = ENGINE_PERF
    ? {
        particles_processed: [],
        chunk_empty_cells: [],
        chunk_non_empty_cells: [],
        particles_moved: [],
        reactions_checked: [],
        reactions_applied: [],
        temp_cells: [],
        simd_air_cells: [],
        phase_changes: [],
        liquid_scans: [],
        physics_calls: [],
        raycast_steps_total: [],
        raycast_collisions: [],
        behavior_calls: [],
        behavior_powder: [],
        behavior_liquid: [],
        behavior_gas: [],
        behavior_energy: [],
        behavior_utility: [],
        behavior_bio: [],
        grid_size: [],
        memory_bytes: [],
        active_chunks: [],
        particle_count: [],
        non_empty_cells: [],
      }
    : null

  let endState = null
  const spawns = []

  for (let runIndex = 0; runIndex < RUNS; runIndex++) {
    const res = await runScenarioOnce(wasm, EL, scenario, config, runIndex, contentBundleJson)
    outerAll.push(...res.outerStepMs)
    perfAll.push(...res.perfStepMs)
    if (breakdownAll && res.perfBreakdown) {
      for (const k of Object.keys(breakdownAll)) {
        breakdownAll[k].push(...(res.perfBreakdown[k] ?? []))
      }
    }
    if (countersAll && res.perfCounters) {
      for (const k of Object.keys(countersAll)) {
        countersAll[k].push(...(res.perfCounters[k] ?? []))
      }
    }
    endState = res.endState
    spawns.push(res.spawn)
  }

  const breakdown =
    ENGINE_PERF && breakdownAll
      ? Object.fromEntries(Object.entries(breakdownAll).map(([k, v]) => [k, quantiles(v)]))
      : null

  const counters =
    ENGINE_PERF && countersAll
      ? Object.fromEntries(Object.entries(countersAll).map(([k, v]) => [k, quantiles(v)]))
      : null

  const outerQ = quantiles(outerAll)
  return {
    outer: outerQ,
    fps: fpsFromMsQuantiles(outerQ),
    perfStepMs: ENGINE_PERF ? quantiles(perfAll) : null,
    perfBreakdown: breakdown,
    perfCounters: counters,
    endState,
    spawns,
  }
}

async function main() {
  const wasm = await loadWasm()
  const EL = getElementIds(wasm)

  const bundlePath = resolve(__dirname, '../../apps/web/public/content/bundle.json')
  let contentBundleJson = ''
  try {
    contentBundleJson = await readFile(bundlePath, 'utf8')
  } catch {
    contentBundleJson = ''
  }

  const bundleIndex = contentBundleJson ? extractBundleElementIndex(contentBundleJson) : { ids: [], idToKey: new Map() }

  const worldSizes = WORLD_SIZES ? parseCsvInts(WORLD_SIZES) : []
  const worldsToRun = worldSizes.length > 0 ? worldSizes.map((s) => ({ width: s, height: s })) : [{ width: WORLD_WIDTH, height: WORLD_HEIGHT }]

  const occupancyListRaw = OCCUPANCIES ? parseCsvFloats(OCCUPANCIES) : []
  const occupancyList = occupancyListRaw
    .map((v) => (v > 1 ? v / 100 : v))
    .filter((v) => Number.isFinite(v) && v >= 0 && v <= 1)

  const reportMatrix = {
    meta: {
      startedAt: nowIso(),
      runs: RUNS,
      seed: SEED,
      enginePerf: ENGINE_PERF,
      enginePerfDetailed: ENGINE_PERF_DETAILED,
      enginePerfSplit: ENGINE_PERF_SPLIT,
      warmupStepsOverride: OVERRIDE_WARMUP_STEPS,
      measureStepsOverride: OVERRIDE_MEASURE_STEPS,
      baselineConfig: BASELINE_CONFIG,
      optimizations: OPTS.map((o) => ({ id: o.id, label: o.label, key: o.key, baseline: o.baseline, variant: o.variant })),
      worlds: worldsToRun,
      targetParticles: TARGET_PARTICLES,
      targetDensity: TARGET_DENSITY,
      occupancies: occupancyList.length > 0 ? occupancyList : null,
      randomElementsN: RANDOM_ELEMENTS_N,
      contentBundleLoaded: Boolean(contentBundleJson),
    },
    worlds: [],
  }

  for (const worldSpec of worldsToRun) {
    WORLD_WIDTH = worldSpec.width
    WORLD_HEIGHT = worldSpec.height
    const cells = WORLD_WIDTH * WORLD_HEIGHT
    const sandCount = Math.min(Math.floor(cells * 0.55), cells)

    const baseMeasureSteps = cells <= 250_000 ? 240 : cells <= 1_000_000 ? 180 : 120
    const baseWarmupSteps = cells <= 250_000 ? 80 : cells <= 1_000_000 ? 60 : 40

    const targetCountFromEnv =
      TARGET_DENSITY !== null && Number.isFinite(TARGET_DENSITY)
        ? Math.min(cells, Math.max(0, Math.floor(cells * TARGET_DENSITY)))
        : Math.min(cells, TARGET_PARTICLES)

    const occsToRun = occupancyList.length > 0 ? occupancyList : [null]

    const random5Scenarios = occsToRun.map((occ) => {
      const targetCount = occ === null ? targetCountFromEnv : Math.min(cells, Math.max(0, Math.floor(cells * occ)))
      const occLabel = occ === null ? '' : ` occ=${Math.round(occ * 100)}%`
      const id = occ === null ? 'random5_elements_scatter' : `random5_elements_scatter_occ_${Math.round(occ * 100)}`

      const heavyOcc = cells > 1_000_000 && occ !== null && occ >= 0.6
      const measureSteps = heavyOcc ? Math.min(baseMeasureSteps, 30) : baseMeasureSteps
      const warmupSteps = heavyOcc ? Math.min(baseWarmupSteps, 10) : baseWarmupSteps

      return {
        id,
        label: `Random scatter (${RANDOM_ELEMENTS_N} elements, target=${targetCount})${occLabel}`,
        occupancy: occ,
        targetCount,
        spawns: [
          (world, rng, _EL2) => {
            const rngSeed = rng()
            const rng2 = makeXorshift32(rngSeed)
            const fallback = [EL.STONE, EL.SAND, EL.WATER, EL.LAVA, EL.ICE].filter((v) => Number.isFinite(v) && v > 0)
            const source = bundleIndex.ids.length > 0 ? bundleIndex.ids : fallback
            const picked = pickRandomUnique(rng2, source, RANDOM_ELEMENTS_N)
            const stripeW = Math.max(1, Math.floor(WORLD_WIDTH / RANDOM_ELEMENTS_N))
            const perEl = targetCount <= 0 ? 0 : Math.max(1, Math.floor(targetCount / Math.max(1, picked.length)))
            let placedTotal = 0
            const t0 = performance.now()
            const pickedMeta = picked.map((id2) => ({ id: id2, key: bundleIndex.idToKey.get(id2) ?? null }))
            for (let i = 0; i < picked.length; i++) {
              if (perEl <= 0) {
                continue
              }
              const x0 = i * stripeW
              const x2 = i === picked.length - 1 ? WORLD_WIDTH : Math.min(WORLD_WIDTH, (i + 1) * stripeW)
              const rect = { x: x0, y: 0, x2, y2: WORLD_HEIGHT }
              const res = heavyOcc
                ? spawnUniqueScatterInRect(world, rng2, picked[i], perEl, rect)
                : spawnRandomInRect(world, rng2, picked[i], perEl, rect)
              placedTotal += res.placed
            }
            return { placed: placedTotal, elapsedMs: performance.now() - t0, elements: pickedMeta, occupancy: occ, targetCount }
          },
        ],
        warmupSteps,
        measureSteps,
      }
    })

    const scenarios = [
      ...random5Scenarios,
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
            for (let x = 0; x < Math.min(256, WORLD_WIDTH); x++) {
              for (let y = 0; y < Math.min(128, WORLD_HEIGHT); y++) {
                if (world.add_particle(x, y, EL2.LAVA)) placed++
              }
            }
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
        label: 'Empty world (sanity check)',
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

    const worldReport = {
      world: { width: WORLD_WIDTH, height: WORLD_HEIGHT, cells },
      scenarios: [],
    }

    for (const scenario of selectedScenarios) {
      console.log(`\n--- Scenario: ${scenario.id} ---`)

      const baselineRes = await runScenario(wasm, EL, scenario, BASELINE_CONFIG, contentBundleJson)
      console.log(`baseline outer: ${formatMs(baselineRes.outer)}`)
      console.log(`baseline fps: avg=${baselineRes.fps.avg.toFixed(2)} p50=${baselineRes.fps.p50.toFixed(2)} p95=${baselineRes.fps.p95.toFixed(2)} p99=${baselineRes.fps.p99.toFixed(2)} min=${baselineRes.fps.min.toFixed(2)}`)

      const baselineEntry = {
        config: BASELINE_CONFIG,
        outer: baselineRes.outer,
        fps: baselineRes.fps,
        perfStepMs: baselineRes.perfStepMs,
        perfBreakdown: baselineRes.perfBreakdown,
        perfCounters: baselineRes.perfCounters,
        endState: baselineRes.endState,
        spawns: baselineRes.spawns,
      }

      if (MODE === 'matrix') {
        const keys = /** @type {const} */ ([])
        const configs = []
        for (let mask = 0; mask < (1 << keys.length); mask++) {
          const cfg = { ...BASELINE_CONFIG }
          for (let i = 0; i < keys.length; i++) {
            cfg[keys[i]] = (mask & (1 << i)) !== 0
          }
          configs.push(cfg)
        }

        const results = []
        for (const cfg of configs) {
          const res = await runScenario(wasm, EL, scenario, cfg, contentBundleJson)
          const slowdown = ratio(res.outer.avg, baselineRes.outer.avg)
          results.push({
            id: configId(cfg),
            config: cfg,
            outer: res.outer,
            fps: res.fps,
            perfStepMs: res.perfStepMs,
            perfBreakdown: res.perfBreakdown,
            perfCounters: res.perfCounters,
            endState: res.endState,
            spawns: res.spawns,
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

        worldReport.scenarios.push({
          id: scenario.id,
          label: scenario.label,
          occupancy: scenario.occupancy ?? null,
          targetCount: scenario.targetCount ?? null,
          baseline: baselineEntry,
          matrix: results,
        })
      } else {
        const variants = []
        for (const opt of OPTS) {
          const cfg = makeVariantConfig(opt)
          const res = await runScenario(wasm, EL, scenario, cfg, contentBundleJson)
          const slowdown = ratio(res.outer.avg, baselineRes.outer.avg)

          const suffix = slowdown === null ? '' : ` | x${slowdown.toFixed(2)}`
          console.log(`${opt.id}: ${formatMs(res.outer)}${suffix}`)

          variants.push({
            optId: opt.id,
            config: cfg,
            outer: res.outer,
            fps: res.fps,
            perfStepMs: res.perfStepMs,
            perfBreakdown: res.perfBreakdown,
            perfCounters: res.perfCounters,
            endState: res.endState,
            spawns: res.spawns,
            slowdownAvgVsBaseline: slowdown,
          })
        }

        worldReport.scenarios.push({
          id: scenario.id,
          label: scenario.label,
          occupancy: scenario.occupancy ?? null,
          targetCount: scenario.targetCount ?? null,
          baseline: baselineEntry,
          variants,
        })
      }
    }

    reportMatrix.worlds.push(worldReport)
  }

  const outReport = worldsToRun.length === 1 ? { meta: { ...reportMatrix.meta, world: reportMatrix.worlds[0].world }, scenarios: reportMatrix.worlds[0].scenarios } : reportMatrix

  if (OUT) {
    await writeFile(OUT, JSON.stringify(outReport, null, 2), 'utf8')
    console.log(`\nWrote report to ${OUT}`)
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err)
  process.exitCode = 1
})
