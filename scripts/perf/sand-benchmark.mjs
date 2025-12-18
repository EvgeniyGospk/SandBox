// Comprehensive perf harness for the WASM engine.
// Runs multiple scenarios and collects detailed timing/counter metrics per step.
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmPath = resolve(__dirname, '../../packages/engine-wasm/particula_engine.js');
const wasmBytesPath = resolve(__dirname, '../../packages/engine-wasm/particula_engine_bg.wasm');

const WORLD_WIDTH = Number.parseInt(process.env.WORLD_WIDTH ?? '2048', 10); // 2,097,152 cells total (default)
const WORLD_HEIGHT = Number.parseInt(process.env.WORLD_HEIGHT ?? '1024', 10);

const SCENARIO_FILTER = (process.env.SCENARIO_FILTER ?? '').trim();
const OVERRIDE_WARMUP_STEPS = process.env.WARMUP_STEPS ? Number.parseInt(process.env.WARMUP_STEPS, 10) : null;
const OVERRIDE_MEASURE_STEPS = process.env.MEASURE_STEPS ? Number.parseInt(process.env.MEASURE_STEPS, 10) : null;
const ENGINE_PERF = (process.env.ENGINE_PERF ?? '0').toLowerCase().trim() === '1';

let EL;
let WASM_MEMORY;
const METRIC_KEYS = [
  'outer_step_ms',
  'step_ms',
  'rigid_ms',
  'physics_ms',
  'chunks_ms',
  'temperature_ms',
  'powder_ms',
  'liquid_ms',
  'gas_ms',
  'energy_ms',
  'utility_ms',
  'bio_ms',
  'particles_processed',
  'particles_moved',
  'reactions_checked',
  'reactions_applied',
  'temp_cells',
  'simd_air_cells',
  'phase_changes',
  'physics_calls',
  'raycast_steps_total',
  'raycast_collisions',
  'behavior_calls',
  'behavior_powder',
  'behavior_liquid',
  'behavior_gas',
  'behavior_energy',
  'behavior_utility',
  'behavior_bio',
  'liquid_scans',
  'memory_bytes',
  'grid_size',
  'active_chunks',
  'dirty_chunks',
  'particle_count',
];

// Helper: load wasm module with explicit bytes (no fetch)
async function loadWasm() {
  const wasmModule = await import(wasmPath);
  const wasmBytes = await readFile(wasmBytesPath);
  const wasmExports = await wasmModule.default({ module_or_path: wasmBytes });
  WASM_MEMORY = wasmExports?.memory;
  return wasmModule;
}

function getElementIds(wasm) {
  return {
    EMPTY: wasm.el_empty(),
    SAND: wasm.el_sand(),
    WATER: wasm.el_water(),
    LAVA: wasm.el_lava(),
    ICE: wasm.el_ice(),
    STONE: wasm.el_stone(),
  };
}

function randInt(max) {
  return Math.floor(Math.random() * max);
}

function spawnRandom(world, element, targetCount, yMax = WORLD_HEIGHT) {
  const start = performance.now();
  let placed = 0;
  const maxAttempts = targetCount * 2;
  for (let i = 0; i < maxAttempts && placed < targetCount; i++) {
    const x = randInt(WORLD_WIDTH);
    const y = randInt(Math.max(1, yMax));
    if (world.add_particle(x, y, element)) placed++;
  }
  return { placed, elapsedMs: performance.now() - start };
}

function quantiles(nums) {
  if (!nums.length) return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...nums].sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    avg: sum / nums.length,
    p50: pick(0.5),
    p95: pick(0.95),
    p99: pick(0.99),
    max: sorted[sorted.length - 1],
  };
}

function aggregateMetrics(samples) {
  const metrics = {};
  for (const key of METRIC_KEYS) {
    const arr = samples.map((s) => s[key]).filter((v) => typeof v === 'number');
    metrics[key] = quantiles(arr);
  }
  return metrics;
}

function summarizeCounters(samples) {
  const last = samples[samples.length - 1];
  const maxActive = Math.max(...samples.map((s) => s.active_chunks));
  const maxDirty = Math.max(...samples.map((s) => s.dirty_chunks));
  const maxPhase = Math.max(...samples.map((s) => s.phase_changes ?? 0));
  const maxLiquidScans = Math.max(...samples.map((s) => s.liquid_scans ?? 0));
  return {
    last_active_chunks: last?.active_chunks ?? 0,
    max_active_chunks: maxActive,
    max_dirty_chunks: maxDirty,
    last_particle_count: last?.particle_count ?? 0,
    max_particle_count: Math.max(...samples.map((s) => s.particle_count)),
    max_phase_changes: maxPhase,
    max_liquid_scans: maxLiquidScans,
  };
}

function perfStatsToPojo(stats) {
  const o = {};
  for (const key of METRIC_KEYS) {
    if (key === 'outer_step_ms') continue;
    const v = stats?.[key];
    if (typeof v === 'number') o[key] = v;
  }
  return o;
}

async function runScenario(wasm, config) {
  const world = new wasm.World(WORLD_WIDTH, WORLD_HEIGHT);
  world.enable_perf_metrics(ENGINE_PERF);

  const spawnRes = [];
  for (const spawn of config.spawns) {
    spawnRes.push(spawn(world));
  }

  const warmupSteps =
    OVERRIDE_WARMUP_STEPS !== null && Number.isFinite(OVERRIDE_WARMUP_STEPS)
      ? OVERRIDE_WARMUP_STEPS
      : (config.warmup_steps ?? 0);
  const measureSteps =
    OVERRIDE_MEASURE_STEPS !== null && Number.isFinite(OVERRIDE_MEASURE_STEPS)
      ? OVERRIDE_MEASURE_STEPS
      : config.measure_steps;

  // Warmup
  for (let i = 0; i < warmupSteps; i++) {
    if (config.perStep) config.perStep(world, i, true);
    world.step();
  }

  const samples = [];
  for (let step = 0; step < measureSteps; step++) {
    if (config.perStep) config.perStep(world, step, false);

    const t0 = performance.now();
    world.step();
    const outerStepMs = performance.now() - t0;

    if (ENGINE_PERF) {
      const stats = world.get_perf_stats();
      samples.push({
        outer_step_ms: outerStepMs,
        ...perfStatsToPojo(stats),
      });
    } else {
      samples.push({
        outer_step_ms: outerStepMs,
      });
    }
  }

  const endState = {
    particle_count: world.particle_count ?? 0,
    active_chunks: typeof world.active_chunks === 'function' ? world.active_chunks() : 0,
    total_chunks: typeof world.total_chunks === 'function' ? world.total_chunks() : 0,
  };

  return {
    label: config.label,
    spawn: spawnRes,
    metrics: aggregateMetrics(samples),
    counters: ENGINE_PERF ? summarizeCounters(samples) : endState,
  };
}

function printScenarioResult(result) {
  console.log(`\n=== Scenario: ${result.label} ===`);
  for (const s of result.spawn) {
    console.log(
      `Spawn placed=${s.placed.toLocaleString()} in ${s.elapsedMs.toFixed(1)}ms`
    );
  }
  const m = result.metrics;
  const c = result.counters;
  const fmt = (q) =>
    `avg/p50/p95/p99/max=${q.avg.toFixed(2)}/${q.p50.toFixed(2)}/${q.p95.toFixed(
      2
    )}/${q.p99.toFixed(2)}/${q.max.toFixed(2)} ms`;
  console.log(`World.step() wall-time: ${fmt(m.outer_step_ms)}`);

  if (ENGINE_PERF) {
    console.log(`Engine step_ms:      ${fmt(m.step_ms)}`);
    console.log(`  rigid: ${fmt(m.rigid_ms)}`);
    console.log(`  physics: ${fmt(m.physics_ms)} | chunks: ${fmt(m.chunks_ms)}`);
    console.log(`  temperature: ${fmt(m.temperature_ms)}`);
    console.log(
      `Processed particles avg=${m.particles_processed.avg.toFixed(0)} ` +
      `moved avg=${m.particles_moved.avg.toFixed(0)} ` +
      `reactions checked avg=${m.reactions_checked.avg.toFixed(0)} applied avg=${m.reactions_applied.avg.toFixed(0)}`
    );
    console.log(`Temp cells avg=${m.temp_cells.avg.toFixed(0)}`);
    console.log(
      `Chunks active last=${c.last_active_chunks}/${c.max_active_chunks} ` +
      `dirty max=${c.max_dirty_chunks} ` +
      `phase changes max=${c.max_phase_changes} liquid scans max=${c.max_liquid_scans}`
    );
  } else {
    const total = c.total_chunks ?? 0;
    const active = c.active_chunks ?? 0;
    const ratio = total > 0 ? (active / total) * 100 : 0;
    console.log(`Chunks active=${active}/${total} (${ratio.toFixed(1)}%) | particles=${(c.particle_count ?? 0).toLocaleString()}`);
  }
}

function sandBlock(EL, count) {
  return (world) => spawnRandom(world, EL.SAND, count);
}

function sandRainPerStep(EL, rate) {
  return (world) => {
    spawnRandom(world, EL.SAND, rate, 64); // spawn near top rows
  };
}

function waterLavaStripe(EL) {
  return (world) => {
  // Lay a water stripe at mid height, lava above to trigger reactions/temperature
  const midY = Math.floor(WORLD_HEIGHT / 2);
  for (let x = 0; x < WORLD_WIDTH; x++) {
    world.add_particle(x, midY, EL.WATER);
    world.add_particle(x, midY - 1, EL.LAVA);
  }
  return { placed: WORLD_WIDTH * 2, elapsedMs: 0 };
  };
}

function fillHalfTop(elementId) {
  return (world) => {
    const t0 = performance.now();
    let placed = 0;
    const endY = Math.floor(WORLD_HEIGHT / 2);
    for (let y = 0; y < endY; y++) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        if (world.add_particle(x, y, elementId)) placed++;
      }
    }
    return { placed, elapsedMs: performance.now() - t0 };
  };
}

function fillHalfBottom(elementId) {
  return (world) => {
    const t0 = performance.now();
    let placed = 0;
    const startY = Math.floor(WORLD_HEIGHT / 2);
    for (let y = startY; y < WORLD_HEIGHT; y++) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        if (world.add_particle(x, y, elementId)) placed++;
      }
    }
    return { placed, elapsedMs: performance.now() - t0 };
  };
}

async function main() {
  const wasm = await loadWasm();
  EL = getElementIds(wasm);

  const scenarios = [
    // ---------------------------------------------------------------------
    // Sleeping-chunks focused scenarios (use SCENARIO_FILTER=sleep_)
    // ---------------------------------------------------------------------
    {
      label: 'sleep_empty_world',
      spawns: [(_world) => ({ placed: 0, elapsedMs: 0 })],
      // Ensure empty chunks have time to transition to Sleeping (threshold=60 frames).
      warmup_steps: 80,
      measure_steps: 120,
    },
    {
      label: 'sleep_sparse_sand_10k',
      spawns: [(world) => spawnRandom(world, EL.SAND, 10_000)],
      warmup_steps: 80,
      measure_steps: 120,
    },
    {
      label: 'sleep_full_stone',
      spawns: [
        (world) => {
          const t0 = performance.now();
          let placed = 0;
          for (let y = 0; y < WORLD_HEIGHT; y++) {
            for (let x = 0; x < WORLD_WIDTH; x++) {
              if (world.add_particle(x, y, wasm.el_stone())) placed++;
            }
          }
          return { placed, elapsedMs: performance.now() - t0 };
        },
      ],
      warmup_steps: 10,
      measure_steps: 40,
    },
    {
      label: 'sleep_full_sand',
      spawns: [
        (world) => {
          const t0 = performance.now();
          let placed = 0;
          for (let y = 0; y < WORLD_HEIGHT; y++) {
            for (let x = 0; x < WORLD_WIDTH; x++) {
              if (world.add_particle(x, y, EL.SAND)) placed++;
            }
          }
          return { placed, elapsedMs: performance.now() - t0 };
        },
      ],
      warmup_steps: 10,
      measure_steps: 40,
    },

    {
      label: 'half_stone_top',
      spawns: [fillHalfTop(EL.STONE)],
      warmup_steps: 80,
      measure_steps: 120,
    },
    {
      label: 'half_stone_bottom',
      spawns: [fillHalfBottom(EL.STONE)],
      warmup_steps: 80,
      measure_steps: 120,
    },
    {
      label: 'half_sand_top',
      spawns: [fillHalfTop(EL.SAND)],
      warmup_steps: 80,
      measure_steps: 120,
    },
    {
      label: 'half_sand_bottom',
      spawns: [fillHalfBottom(EL.SAND)],
      warmup_steps: 80,
      measure_steps: 120,
    },
    {
      label: 'half_water_bottom',
      spawns: [fillHalfBottom(EL.WATER)],
      warmup_steps: 80,
      measure_steps: 120,
    },

    {
      label: 'static_sand_500k',
      spawns: [sandBlock(EL, 500_000)],
      warmup_steps: 20,
      measure_steps: 100,
    },
    {
      label: 'static_sand_1M',
      spawns: [sandBlock(EL, 1_000_000)],
      warmup_steps: 20,
      measure_steps: 100,
    },
    {
      label: 'falling_rain_5k_per_frame',
      spawns: [sandBlock(EL, 200_000)],
      warmup_steps: 10,
      measure_steps: 100,
      perStep: sandRainPerStep(EL, 5_000),
    },
    {
      label: 'liquid_pool_300k',
      spawns: [(world) => spawnRandom(world, EL.WATER, 300_000)],
      warmup_steps: 20,
      measure_steps: 80,
    },
    {
      label: 'lava_water_100k_each',
      spawns: [
        (world) => spawnRandom(world, EL.WATER, 100_000),
        (world) => spawnRandom(world, EL.LAVA, 100_000),
      ],
      warmup_steps: 10,
      measure_steps: 80,
    },
    {
      label: 'temperature_stress_hot_cold_blocks',
      spawns: [
        (world) => {
          // Hot block
          for (let x = 0; x < 256; x++) {
            for (let y = 0; y < 128; y++) {
              world.add_particle(x, y, EL.LAVA);
            }
          }
          // Cold block
          for (let x = 512; x < 768; x++) {
            for (let y = 0; y < 128; y++) {
              world.add_particle(x, y, EL.ICE);
            }
          }
          return { placed: 256 * 128 + 256 * 128, elapsedMs: 0 };
        },
      ],
      warmup_steps: 10,
      measure_steps: 80,
    },
    {
      label: 'mixed_chaos_100k_each',
      spawns: [
        (world) => spawnRandom(world, EL.SAND, 100_000),
        (world) => spawnRandom(world, EL.WATER, 100_000),
        (world) => spawnRandom(world, EL.LAVA, 100_000),
        (world) => spawnRandom(world, EL.ICE, 100_000),
        (_world) => ({ placed: 0, elapsedMs: 0 }),
      ],
      warmup_steps: 10,
      measure_steps: 80,
    },
    {
      label: 'edge_case_1M_corner',
      spawns: [
        (world) => {
          const startX = 0;
          const startY = 0;
          let placed = 0;
          const t0 = performance.now();
          for (let x = startX; x < startX + 1024; x++) {
            for (let y = startY; y < startY + 1024 && placed < 1_000_000; y++) {
              if (world.add_particle(x, y, EL.SAND)) placed++;
            }
          }
          return { placed, elapsedMs: performance.now() - t0 };
        },
      ],
      warmup_steps: 10,
      measure_steps: 60,
    },
    {
      label: 'sparse_world_50k_all_over',
      spawns: [
        (world) => spawnRandom(world, EL.SAND, 10_000),
        (world) => spawnRandom(world, EL.WATER, 10_000),
        (world) => spawnRandom(world, EL.ICE, 10_000),
        (world) => spawnRandom(world, EL.LAVA, 10_000),
        (world) => spawnRandom(world, EL.SAND, 10_000),
      ],
      warmup_steps: 10,
      measure_steps: 60,
    },
    {
      label: 'water_lava_stripe',
      spawns: [waterLavaStripe(EL)],
      warmup_steps: 10,
      measure_steps: 60,
    },
  ];

  const results = [];
  const selectedScenarios = SCENARIO_FILTER
    ? scenarios.filter((s) => s.label.includes(SCENARIO_FILTER))
    : scenarios;

  for (const scenario of selectedScenarios) {
    const label = `${scenario.label}`;
    console.log(`\nRunning scenario: ${label}`);
    results.push(
      await runScenario(wasm, {
        ...scenario,
        label,
      })
    );
  }

  console.log('=== Particula WASM perf report ===');
  for (const r of results) {
    printScenarioResult(r);
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exitCode = 1;
});
