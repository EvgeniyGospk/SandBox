# Remove Engine Optimizations (Make World Always “Live”) — Deletion Playbook

This document is a **step-by-step removal plan** for all engine optimizations we benchmarked/toggled during the perf work.

## Goal (what you want)

- **No “skips / sleeping / gating”.** The simulation should treat the world as always active.
- **Temperature runs every frame** (no 1/4 decimation).
- **Remove the code + state** related to these optimization subsystems, including WASM toggles and perf-harness env flags.

This is intentionally a **de-optimization refactor**: performance will drop (sometimes massively), but logic becomes simpler and behavior becomes more “always alive”.

---

## Scope: what exactly to delete

These are the optimizations/systems covered here:

- **Temperature decimation** (run temperature every 4th frame) via `WorldCore.temperature_every_frame` + `(world.frame & 3 == 0)` in `step.rs`.
- **Empty-chunk sleeping** (sleeping chunk states + lazy hydration + virtual temps):
  - `ChunkGrid.sleep_enabled`, `ChunkState::{Active,Sleeping}`, `idle_frames`, `SLEEP_THRESHOLD`
  - `virtual_temp`, `just_woke_up`, `hydrate_waking_chunks`, `chunks_woken/chunks_slept` perf counters
- **Chunk gating** (skip `process_chunk` if `!should_process(...)`) via `WorldCore.chunk_gating_enabled`.
- **Sparse row skip** (skip rows using `grid.row_has_data`) via `WorldCore.sparse_row_skip_enabled` + `Grid.row_has_data/row_non_empty` + per-swap bookkeeping.
- **Cross-chunk move tracking** + **MoveBuffer** (`Grid.pending_moves`) + `apply_pending_moves` phase.
- **Render extraction / smart rendering API**:
  - `collect_dirty_chunks`, `get_dirty_list_ptr`, `extract_chunk_pixels`
  - merged-rect path: `collect_merged_rects`, `get_merged_rect_*`, `extract_rect_pixels`, `rect_transfer_buffer`, `MergedDirtyRects`

---

## Important invariants & what is NOT being removed

- This document does **not** remove the chunk *concept* (`ChunkGrid` and `CHUNK_SIZE=32`) unless you choose to go further.
- It **does** remove “skip-based behavior” that makes parts of the world “not processed”.
- It does **not** propose changing rendering style (WebGL vs Canvas) — only the engine-side and WASM API surfacing.

---

## Preparation

### 0.1 Create a branch

Do this in a dedicated branch so you can bisect quickly.

### 0.2 Baseline sanity

Before deleting anything, run:

- `npm run build:wasm`
- `npm run build`
- quick run of the web app (whatever your usual workflow is)

### 0.3 Note about generated files

`packages/engine-wasm/particula_engine.js` is generated output. **Do not edit it by hand.**
After Rust changes, regenerate via `npm run build:wasm`.

---

# Deletion Order (recommended)

This order minimizes cascading compile errors:

1. **Force temperature every frame** (and remove the toggle).
2. **Remove sleeping system + lazy hydration + virtual temps.**
3. **Remove chunk gating.**
4. **Remove sparse-row skip (row_has_data) + bookkeeping.**
5. **Remove cross-chunk move tracking + MoveBuffer + apply_pending_moves.**
6. **Remove smart-rendering APIs (dirty chunks + merged rects) (optionally switch to full upload only).**
7. **Remove perf-harness env flags and any related comparison/matrix logic.**

---

# 1) Temperature: make it ALWAYS run every frame

## What you are deleting

- The “decimation” logic in:
  - `packages/engine/src/simulation/step/step.rs`
    - current: `if world.temperature_every_frame || (world.frame & 3 == 0) { ... }`
- The toggle plumbing:
  - `WorldCore.temperature_every_frame` field in `packages/engine/src/simulation/mod.rs`
  - `set_temperature_every_frame` in:
    - `packages/engine/src/simulation/mod.rs`
    - `packages/engine/src/simulation/init/settings.rs`
    - `packages/engine/src/simulation/facade.rs` (WASM exposed)

## Concrete steps

1. In `packages/engine/src/simulation/step/step.rs`:

   - Replace the whole temperature conditional with an unconditional call:
     - always call `process_temperature_grid_chunked(...)`
   - Keep perf timing (`temperature_ms`, `temp_cells`, `simd_air_cells`) but execute it every frame.
2. Remove the flag and setters:

   - Remove `temperature_every_frame: bool` from `WorldCore`.
   - Remove `set_temperature_every_frame` methods from `WorldCore` and WASM `World` facade.
   - Remove `settings::set_temperature_every_frame`.
3. Update perf scripts / callers:

   - `scripts/perf/sand-benchmark.mjs`:
     - remove `TEMPERATURE_EVERY_FRAME`, `COMPARE_TEMPERATURE_EVERY_FRAME`, and any matrix loops involving it.
   - `scripts/perf/engine-optimizations.mjs`:
     - remove the `temperature_every_frame` optimization entry (and config key).

## Expected behavior change

- Temperature becomes more responsive and consistent.
- CPU cost increases (often a lot, especially in static-heavy worlds).

---

# 2) Remove Sleeping Chunks + Lazy Hydration + Virtual Temps

This is the biggest “world not living” mechanism.

## Where it currently lives

- `packages/engine/src/spatial/chunks/mod.rs`
  - `ChunkState`, `sleep_enabled`, `state`, `idle_frames`, `SLEEP_THRESHOLD`
  - `virtual_temp`, `just_woke_up`, counters `woke_this_frame`, `slept_this_frame`
- `packages/engine/src/spatial/chunks/lifecycle.rs`
  - `begin_frame()` sleeping transitions
  - `end_chunk_update()` wake-below logic
  - `set_sleeping_enabled()`
- `packages/engine/src/spatial/chunks/bitset.rs`
  - `is_sleeping()` and waking behavior in `mark_dirty_idx`
- `packages/engine/src/spatial/chunks/compat.rs`
  - `active_chunk_count()` uses state
  - `active_chunks()` iterator assumes skipping is valid
- `packages/engine/src/simulation/step/step.rs`
  - calls `world.hydrate_waking_chunks()`
  - perf counters `chunks_woken`, `chunks_slept`
- `packages/engine/src/simulation/step/hydration.rs`
  - `hydrate_waking_chunks(...)`
- `packages/engine/src/systems/temperature/chunked.rs`
  - `if chunks.is_sleeping(cx, cy) { update_virtual_temp(...) } else { per-cell processing }`

## Concrete steps

### 2.1 ChunkGrid state cleanup

In `packages/engine/src/spatial/chunks/mod.rs`:

- Delete:

  - `const SLEEP_THRESHOLD: u32 = 60;`
  - `pub enum ChunkState { ... }`
  - `sleep_enabled: bool`
  - `state: Vec<ChunkState>`
  - `idle_frames: Vec<u32>`
  - `virtual_temp: Vec<f32>`
  - `just_woke_up: Vec<bool>`
  - `woke_this_frame`, `slept_this_frame`
- Update `ChunkGrid::new(...)` initialization accordingly.

### 2.2 Lifecycle removal

In `packages/engine/src/spatial/chunks/lifecycle.rs`:

- Rewrite `begin_frame()` into a minimal “per-frame reset” that **does not** scan for sleeping.

  - Likely it becomes either:
    - a no-op, or
    - just resets any per-frame counters that remain.
- Rewrite `end_chunk_update(cx, cy, had_movement)`:

  - Remove sleeping-specific transitions.
  - Keep visual dirty marking if you still use dirty rendering.
  - Remove “wake chunk below if has particles” behavior if it’s only needed for sleeping.
- Delete `set_sleeping_enabled(...)` (and any references).

### 2.3 Bitset helpers cleanup

In `packages/engine/src/spatial/chunks/bitset.rs`:

- Remove `is_sleeping(...)` entirely.
- In `mark_dirty_idx(...)`:
  - remove “if chunk is sleeping -> set just_woke_up -> state Active” logic.

### 2.4 Remove lazy hydration

In `packages/engine/src/simulation/mod.rs`:

- Remove `hydrate_waking_chunks()` method on `WorldCore`.

In `packages/engine/src/simulation/step/step.rs`:

- Remove the entire “LAZY HYDRATION: Process waking chunks” block.
- Remove perf stats fields usage:
  - `hydrate_ms`
  - `chunks_woken`, `chunks_slept`

In `packages/engine/src/simulation/step/hydration.rs`:

- Delete the file (or leave it empty until removed from module tree) and remove the module import from `simulation/mod.rs`.

### 2.5 Temperature system simplification

In `packages/engine/src/systems/temperature/chunked.rs`:

- Remove the `chunks.is_sleeping(...)` branch.
- Remove all `virtual_temp` logic:
  - `update_virtual_temp`
  - `set_virtual_temp`
  - `grid.get_average_air_temp` sync if it exists only for virtual temp consistency

After this, temperature becomes a single uniform path over all chunks/cells.

### 2.6 WASM toggle removal

In `packages/engine/src/simulation/facade.rs`:

- Remove `set_chunk_sleeping_enabled` from the WASM `World` API.

In `packages/engine/src/simulation/init/settings.rs`:

- Remove `set_chunk_sleeping_enabled`.

In perf harness:

- Remove env toggle `CHUNK_SLEEPING` and `COMPARE_SLEEPING` from `scripts/perf/sand-benchmark.mjs`.
- Remove `chunk_sleeping` from `scripts/perf/engine-optimizations.mjs`.

---

# 3) Remove Chunk Gating

## Where it is

- `WorldCore.chunk_gating_enabled` (`packages/engine/src/simulation/mod.rs`)
- `set_chunk_gating_enabled` in:
  - `packages/engine/src/simulation/mod.rs`
  - `packages/engine/src/simulation/init/settings.rs`
  - `packages/engine/src/simulation/facade.rs`
- Gating usage:
  - `packages/engine/src/simulation/step/chunk_processing.rs`:
    - `if world.chunk_gating_enabled && !world.chunks.should_process(cx, cy) { return; }`

## Concrete steps

1. In `chunk_processing.rs`:

   - Remove the early return.
   - After this, **every chunk row/cell gets processed**.
2. Remove the flag and setters from `WorldCore`, `settings.rs`, and the WASM facade.
3. Remove env toggles:

   - `CHUNK_GATING` and `COMPARE_GATING` from `sand-benchmark.mjs`.
   - `chunk_gating` from `engine-optimizations.mjs`.
4. If `ChunkGrid.should_process(...)` becomes unused afterwards:

   - Delete it from `packages/engine/src/spatial/chunks/bitset.rs`.

---

# 4) Remove Sparse Row Skip (row_has_data)

This is a fairly invasive cleanup because it touches Grid state and per-swap bookkeeping.

## Where it is

- Flags:

  - `WorldCore.sparse_row_skip_enabled` (`packages/engine/src/simulation/mod.rs`)
  - `set_sparse_row_skip_enabled` in `mod.rs`, `init/settings.rs`, `facade.rs`
- Main usage:

  - `packages/engine/src/simulation/step/chunk_processing.rs`:
    - `if world.sparse_row_skip_enabled && !world.grid.row_has_data[y as usize] { continue; }`
  - `packages/engine/src/simulation/step/step_physics.rs`:
    - same row skip check
- Grid state:

  - `packages/engine/src/spatial/grid/mod.rs`:
    - `row_has_data: Vec<bool>`
    - `row_non_empty: Vec<u32>`
  - `packages/engine/src/spatial/grid/sparse.rs`:
    - `refresh_chunk_bits()`
- Per-swap bookkeeping:

  - `packages/engine/src/spatial/grid/moves.rs`:
    - `record_sparse_swap_counts(...)` and its calls from `swap()` and `swap_unchecked()`

## Concrete steps

1. Remove row-skip checks:

   - In `chunk_processing.rs` and `step_physics.rs`, delete the `if sparse_row_skip_enabled ... continue` blocks.
2. Remove the flag and setters:

   - Delete `sparse_row_skip_enabled` from `WorldCore` and remove WASM API toggle.
3. Remove Grid sparse structures:

   - In `Grid` (`grid/mod.rs`): delete `row_has_data`, `row_non_empty`, and helper methods `mark_cell_non_empty`, `mark_cell_empty`.
   - Delete module `grid/sparse.rs` and remove `mod sparse;` from `grid/mod.rs`.
4. Remove bookkeeping from swaps:

   - In `grid/moves.rs`:
     - delete `record_sparse_swap_counts`.
     - remove the call sites in `swap()` and `swap_unchecked()`.
5. Remove the per-frame refresh:

   - In `simulation/step/step.rs` remove the call:
     - `world.grid.refresh_chunk_bits();`
6. Remove env toggles:

   - `SPARSE_ROW_SKIP` and `COMPARE_SPARSE_ROW_SKIP` from `sand-benchmark.mjs`.
   - `sparse_row_skip` from `engine-optimizations.mjs`.

---

# 5) Remove Cross-Chunk Move Tracking + MoveBuffer (`pending_moves`)

This is **NOT physics**. This is chunk-level accounting (keeping per-chunk particle counts/dirty state updated cheaply).

If you remove it, you must also remove things that depend on it (like `apply_pending_moves` and move-buffer overflow safety net).

## Where it is

- Grid:

  - `packages/engine/src/spatial/grid/mod.rs`
    - `pending_moves: MoveBuffer`
    - `cross_chunk_move_tracking_enabled: bool`
  - `packages/engine/src/spatial/grid/move_buffer.rs`
  - `packages/engine/src/spatial/grid/moves.rs`
    - `record_cross_chunk_swap_moves(...)`
    - `clear_moves()`
    - calls from `swap()` and `swap_unchecked()`
- Simulation step:

  - `packages/engine/src/simulation/step/step.rs`
    - `world.grid.clear_moves();`
    - `world.apply_pending_moves();`
    - overflow safety net: `if world.grid.pending_moves.overflow_count() > 0 { world.chunks.mark_all_dirty(); }`
- Apply:

  - `packages/engine/src/simulation/step/moves.rs` (`apply_pending_moves`)
- Chunk particle counts / move accounting:

  - `packages/engine/src/spatial/chunks/counts.rs` (`move_particle`, `particle_counts`, etc.)
- WASM toggle (added for experiments):

  - `World.set_cross_chunk_move_tracking_enabled(...)`

## Concrete steps

### 5.1 Remove the toggle first

- Remove `set_cross_chunk_move_tracking_enabled`:
  - `packages/engine/src/simulation/mod.rs`
  - `packages/engine/src/simulation/init/settings.rs`
  - `packages/engine/src/simulation/facade.rs`

Also remove env toggles from perf scripts:

- `CROSS_CHUNK_MOVE_TRACKING` / `COMPARE_CROSS_CHUNK_MOVE_TRACKING` from `sand-benchmark.mjs`.

### 5.2 Remove MoveBuffer from Grid

In `packages/engine/src/spatial/grid/mod.rs`:

- Remove:
  - `pending_moves: MoveBuffer`
  - `cross_chunk_move_tracking_enabled: bool`
  - `set_cross_chunk_move_tracking_enabled`
  - constants `MIN_MOVE_BUFFER_CAPACITY`, `MAX_MOVE_BUFFER_CAPACITY` if only used for move buffer
  - `mod move_buffer;` and `pub use move_buffer::{...}`

Delete `packages/engine/src/spatial/grid/move_buffer.rs`.

### 5.3 Remove move recording in swaps

In `packages/engine/src/spatial/grid/moves.rs`:

- Delete `record_cross_chunk_swap_moves`.
- Remove the `self.pending_moves.push(...)` logic.
- Remove calls from:
  - `swap()`
  - `swap_unchecked()`

Also remove:

- `clear_moves()` implementation.

### 5.4 Remove apply_pending_moves phase

In `packages/engine/src/simulation/step/step.rs`:

- Remove:
  - `world.grid.clear_moves();` (and the comment about clearing move tracking)
  - `world.apply_pending_moves();`
  - the overflow safety net block:
    - `if world.grid.pending_moves.overflow_count() > 0 { ... }`

Remove module file `packages/engine/src/simulation/step/moves.rs` and its `mod moves;` import in `simulation/mod.rs`.

### 5.5 Remove chunk particle-count dependency in physics

Right now physics does:

- `if world.chunks.particle_counts()[chunk_idx] == 0 { return; }`

This is also a skip optimization (chunk-level early exit). If you want “always live”, remove it.

In `packages/engine/src/simulation/step/step_physics.rs`:

- Delete the early return based on `particle_counts()`.

### 5.6 Decide what to do with `ChunkGrid.particle_count`

After removing MoveBuffer and chunk-level early exits, `particle_count` becomes optional.

- **If you want maximum simplification:** delete `particle_count` and all of `counts.rs`.
- **If you still want counts for UI/debug:** keep counts but update them directly on add/remove/transform without relying on per-step move buffers.

Given your stated goal (“remove all these optimizations”), the simplest is:

- delete `particle_count` and `counts.rs`
- remove all calls to `chunks.add_particle/remove_particle/move_particle/rebuild_particle_counts/particle_counts`

---

# 6) Remove Smart Rendering (dirty chunks + merged rects)

This is a render optimization layer. If you remove it, the simplest UI path is: **always full texture upload**.

## Where it is

### Engine (WASM API)

- `packages/engine/src/simulation/facade.rs`

  - `collect_dirty_chunks`, `get_dirty_list_ptr`
  - `extract_chunk_pixels`
  - `collect_merged_rects`, `get_merged_rect_*`, `extract_rect_pixels`
- `packages/engine/src/simulation/mod.rs`

  - `RenderBuffers` contains:
    - `dirty_list: Vec<u32>`
    - `chunk_transfer_buffer: Vec<u32>`
    - `merged_rects: MergedDirtyRects`
    - `rect_transfer_buffer: Vec<u32>`
- `packages/engine/src/simulation/render/render_extract.rs`
- `packages/engine/src/spatial/chunks/merged_rects.rs`

### Web

- `apps/web/src/features/simulation/engine/rendering/webgl/renderer/upload.ts`

  - `uploadDirtyChunks(...)` uses:
    - `engine.collect_dirty_chunks()` and `engine.get_dirty_list_ptr()`
  - `uploadWithMergedRects(...)` uses:
    - `engine.collect_merged_rects()` and `engine.get_merged_rect_*()`
- `apps/web/src/features/simulation/engine/wasm/api/smartRendering.ts`

  - wrapper around dirty chunk API

## Two removal options

### Option A (partial): keep dirty chunks, remove only merged rects

This removes the more complex part but keeps partial uploads.

- Delete merged-rect API in WASM:

  - `collect_merged_rects`, `get_merged_rect_*`, `extract_rect_pixels`, `rect_buffer_size`
  - remove `MergedDirtyRects` and `rect_transfer_buffer`
  - remove `merged_rects.rs` and merged rect render_extract functions
- In web, remove `uploadWithMergedRects` and call `uploadDirtyChunks` (or full upload).

### Option B (full removal): remove ALL smart rendering; always full upload

This is the simplest and matches “remove render optimizations”.

Steps:

1. In web (`upload.ts`):

   - stop calling `uploadDirtyChunks` and `uploadWithMergedRects`.
   - call `uploadFull(...)` every frame.
2. Remove the following WASM methods from `facade.rs` and `WorldCore`:

   - dirty chunks:
     - `collect_dirty_chunks`, `get_dirty_list_ptr`, `extract_chunk_pixels`, `chunk_buffer_byte_size`
   - merged rects:
     - `collect_merged_rects`, `get_merged_rect_*`, `extract_rect_pixels`, `rect_buffer_size`
3. Remove `RenderBuffers` fields and `render_extract.rs` entirely.
4. Remove `apps/web/src/features/simulation/engine/wasm/api/smartRendering.ts`.

---

# 7) Remove perf harness toggles / comparison logic

If the optimization knobs no longer exist, the harness should stop trying to toggle them.

## sand-benchmark.mjs

File: `scripts/perf/sand-benchmark.mjs`

Remove:

- `resolveSleepingMode`, `resolveGatingMode`, `resolveSparseRowSkipMode`, `resolveTemperatureEveryFrameMode`, `resolveCrossChunkMoveTrackingMode`, `resolveRenderExtractMode`
- all `COMPARE_*` flags and `*_ENABLED` resolved variables
- all branching that generates a config matrix over those toggles
- `runRenderExtract(...)` if you remove render-extract API

After cleanup, the benchmark becomes a fixed scenario runner with fixed engine behavior.

## engine-optimizations.mjs

File: `scripts/perf/engine-optimizations.mjs`

Remove:

- `OPTS` entries for:
  - `chunk_sleeping`
  - `chunk_gating`
  - `sparse_row_skip`
  - `temperature_every_frame`

If you fully delete all knobs, this script becomes obsolete. You can delete it entirely or repurpose it.

---

# 8) Cleanup checklist (grep targets)

Use searches like:

- `set_chunk_sleeping_enabled`
- `sleep_enabled`, `ChunkState`, `SLEEP_THRESHOLD`, `idle_frames`, `just_woke_up`, `virtual_temp`
- `hydrate_waking_chunks`
- `chunk_gating_enabled`, `should_process(`
- `sparse_row_skip_enabled`, `row_has_data`, `row_non_empty`, `refresh_chunk_bits`, `record_sparse_swap_counts`
- `pending_moves`, `MoveBuffer`, `apply_pending_moves`, `clear_moves`, `record_cross_chunk_swap_moves`
- `collect_dirty_chunks`, `get_dirty_list_ptr`, `extract_chunk_pixels`
- `collect_merged_rects`, `MergedDirtyRects`, `extract_rect_pixels`, `get_merged_rect_`

If any of these remain after the refactor, they should either:

- be removed, or
- be clearly “kept intentionally” (but that contradicts this plan).

---

# 9) Verification steps

After each major section (1–6), run:

1. `npm run build:wasm`
2. `npm run build`
3. Launch the app and verify:
   - simulation runs
   - rendering works
   - no runtime exceptions in the console

For rendering changes (Section 6), specifically verify:

- full upload path works and does not depend on dirty chunk lists
- memory views are created correctly (`engine.colors_ptr()` + `memory.buffer`)

---

# What you should expect after ALL deletions

- Much simpler mental model:

  - no “sleeping vs active” chunk state
  - no “waking hydration”
  - no “skip row if empty”
  - no move-buffer accounting pipeline
  - optionally: no smart rendering API
- A big performance hit, especially in worlds that are mostly static.

---

## Appendix: Why `pending_moves` was not “physics”

Movement still happens via `Grid.swap_unchecked(...)`. `pending_moves` only existed to update chunk-level metadata (`particle_count`, dirty propagation) efficiently. Removing it does not remove sand movement; it removes an optimization layer for chunk bookkeeping.
