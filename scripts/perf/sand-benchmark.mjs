// Comprehensive perf harness for the WASM engine.
// Runs multiple scenarios and collects detailed timing/counter metrics per step.
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmPath = resolve(__dirname, '../../packages/engine-wasm/particula_engine.js');
const wasmBytesPath = resolve(__dirname, '../../packages/engine-wasm/particula_engine_bg.wasm');

// Element IDs from apps/web/src/lib/engine/generated_elements.ts
const EL = {
  EMPTY: 0,
  SAND: 2,
  WATER: 6,
  LAVA: 8,
};

const WORLD_WIDTH = 2048;   // 2,097,152 cells total
const WORLD_HEIGHT = 1024;
const METRIC_KEYS = [
  'step_ms',
  'hydrate_ms',
  'rigid_ms',
  'physics_ms',
  'chunks_ms',
  'apply_moves_ms',
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
  'move_buffer_overflows',
  'move_buffer_usage',
  'chunks_woken',
  'chunks_slept',
  'liquid_scans',
  'memory_bytes',
  'grid_size',
  'active_chunks',
  'dirty_chunks',
  'pending_moves',
  'particle_count',
];

// Helper: load wasm module with explicit bytes (no fetch)
async function loadWasm() {
  const wasmModule = await import(wasmPath);
  const wasmBytes = await readFile(wasmBytesPath);
  await wasmModule.default({ module_or_path: wasmBytes });
  return wasmModule;
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

function summarizeCounts(samples) {
  const last = samples[samples.length - 1];
  const maxActive = Math.max(...samples.map((s) => s.active_chunks));
  const maxDirty = Math.max(...samples.map((s) => s.dirty_chunks));
  const maxOverflow = Math.max(...samples.map((s) => s.move_buffer_overflows ?? 0));
  const maxMoveUsage = Math.max(...samples.map((s) => s.move_buffer_usage ?? 0));
  const maxPhase = Math.max(...samples.map((s) => s.phase_changes ?? 0));
  const maxLiquidScans = Math.max(...samples.map((s) => s.liquid_scans ?? 0));
  return {
    last_active_chunks: last?.active_chunks ?? 0,
    max_active_chunks: maxActive,
    last_dirty_chunks: last?.dirty_chunks ?? 0,
    max_dirty_chunks: maxDirty,
    last_particle_count: last?.particle_count ?? 0,
    max_particle_count: Math.max(...samples.map((s) => s.particle_count)),
    max_pending_moves: Math.max(...samples.map((s) => s.pending_moves)),
    max_overflow: maxOverflow,
    max_move_usage: maxMoveUsage,
    max_phase_changes: maxPhase,
    max_liquid_scans: maxLiquidScans,
  };
}

async function runScenario(wasm, config) {
  const world = new wasm.World(WORLD_WIDTH, WORLD_HEIGHT);
  world.enable_perf_metrics(true);

  const spawnRes = [];
  for (const spawn of config.spawns) {
    spawnRes.push(spawn(world));
  }

  // Warmup
  for (let i = 0; i < (config.warmup_steps ?? 0); i++) {
    if (config.perStep) config.perStep(world, i, true);
    world.step();
  }

  const samples = [];
  for (let step = 0; step < config.measure_steps; step++) {
    if (config.perStep) config.perStep(world, step, false);
    world.step();
    samples.push(world.get_perf_stats());
  }

  return {
    label: config.label,
    spawn: spawnRes,
    metrics: aggregateMetrics(samples),
    counts: summarizeCounts(samples),
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
  const c = result.counts;
  const fmt = (q) =>
    `avg/p50/p95/p99/max=${q.avg.toFixed(2)}/${q.p50.toFixed(2)}/${q.p95.toFixed(
      2
    )}/${q.p99.toFixed(2)}/${q.max.toFixed(2)} ms`;
  console.log(`Step: ${fmt(m.step_ms)}`);
  console.log(`  hydrate: ${fmt(m.hydrate_ms)} | rigid: ${fmt(m.rigid_ms)}`);
  console.log(`  physics: ${fmt(m.physics_ms)} | chunks: ${fmt(m.chunks_ms)}`);
  console.log(`  apply_moves: ${fmt(m.apply_moves_ms)} | temperature: ${fmt(m.temperature_ms)}`);
  console.log(
    `Processed particles avg=${m.particles_processed.avg.toFixed(0)} ` +
    `moved avg=${m.particles_moved.avg.toFixed(0)} ` +
    `reactions checked avg=${m.reactions_checked.avg.toFixed(0)} applied avg=${m.reactions_applied.avg.toFixed(0)}`
  );
  console.log(
    `Temp cells avg=${m.temp_cells.avg.toFixed(0)} | pending moves max=${c.max_pending_moves}`
  );
  console.log(
    `Chunks active last=${c.last_active_chunks}/${c.max_active_chunks} ` +
    `dirty last=${c.last_dirty_chunks}/${c.max_dirty_chunks} ` +
    `particles last=${c.last_particle_count.toLocaleString()}` +
    `${c.max_active_chunks === WORLD_WIDTH * WORLD_HEIGHT ? ' (all active)' : ''}`
  );
  console.log(
    `Move buffer overflow max=${c.max_overflow} usage max=${(c.max_move_usage * 100).toFixed(1)}% | phase_changes max=${c.max_phase_changes} | liquid_scans max=${c.max_liquid_scans}`
  );
  console.log(
    `Non-empty cells=${m.non_empty_cells?.avg?.toFixed?.(0) ?? 'n/a'} ` +
    `Chunk particle sum=${m.chunk_particle_sum?.avg?.toFixed?.(0) ?? 'n/a'} ` +
    `Chunk particle max=${m.chunk_particle_max?.avg?.toFixed?.(0) ?? 'n/a'} ` +
    `Ray speed max=${m.raycast_speed_max?.max?.toFixed?.(2) ?? 'n/a'}`
  );
  const total_chunks = Math.ceil(WORLD_WIDTH / 32) * Math.ceil(WORLD_HEIGHT / 32);
  const activeRatio = total_chunks ? c.last_active_chunks / total_chunks : 0;
  if (activeRatio > 0.3) {
    console.warn(`  ⚠️  High active chunk ratio ${(activeRatio * 100).toFixed(1)}% (sleep likely broken)`);
  }
  if (c.max_overflow > 0) {
    console.warn(`  ⚠️  Move buffer overflowed ${c.max_overflow} times`);
  }
}

function sandBlock(count) {
  return (world) => spawnRandom(world, EL.SAND, count);
}

function sandRainPerStep(rate) {
  return (world) => {
    spawnRandom(world, EL.SAND, rate, 64); // spawn near top rows
  };
}

function waterLavaStripe(world) {
  // Lay a water stripe at mid height, lava above to trigger reactions/temperature
  const midY = Math.floor(WORLD_HEIGHT / 2);
  for (let x = 0; x < WORLD_WIDTH; x++) {
    world.add_particle(x, midY, EL.WATER);
    world.add_particle(x, midY - 1, EL.LAVA);
  }
  return { placed: WORLD_WIDTH * 2, elapsedMs: 0 };
}

async function main() {
  const wasm = await loadWasm();

  const scenarios = [
    {
      label: 'static_sand_500k',
      spawns: [sandBlock(500_000)],
      warmup_steps: 20,
      measure_steps: 100,
    },
    {
      label: 'static_sand_1M',
      spawns: [sandBlock(1_000_000)],
      warmup_steps: 20,
      measure_steps: 100,
    },
    {
      label: 'falling_rain_5k_per_frame',
      spawns: [sandBlock(200_000)],
      warmup_steps: 10,
      measure_steps: 100,
      perStep: sandRainPerStep(5_000),
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
        (world) => spawnRandom(world, EL.EMPTY, 0),
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
      spawns: [waterLavaStripe],
      warmup_steps: 10,
      measure_steps: 60,
    },
  ];

  const results = [];
  for (const scenario of scenarios) {
    console.log(`\nRunning scenario: ${scenario.label}`);
    results.push(await runScenario(wasm, scenario));
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
