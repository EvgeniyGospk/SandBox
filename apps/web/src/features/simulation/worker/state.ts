import type { RenderMode } from '@/features/simulation/engine/api/types'

import { SharedInputBuffer } from '@/core/canvas/input/InputBuffer'
import { MemoryManager } from '@/features/simulation/engine/MemoryManager'
import { WebGLRenderer } from '@/features/simulation/engine/rendering/WebGLRenderer'
import { ELEMENT_NAME_TO_ID } from '@/features/simulation/engine/api/types'
import { FPS_SAMPLES } from '@/features/simulation/engine/timing'

import type { WasmModule, WasmWorld } from './types'

export const BG_COLOR_32 = 0xFF0A0A0A
export const EL_EMPTY = 0

export const ELEMENT_MAP: Record<string, number> = ELEMENT_NAME_TO_ID

export type SimulationWorkerState = {
  engine: WasmWorld | null
  wasmModule: WasmModule | null
  wasmMemory: WebAssembly.Memory | null
  canvas: OffscreenCanvas | null

  renderer: WebGLRenderer | null
  useWebGL: boolean

  sharedInputBuffer: SharedInputBuffer | null

  thermalCanvas: OffscreenCanvas | null
  ctx: OffscreenCanvasRenderingContext2D | null
  screenCtx: OffscreenCanvasRenderingContext2D | null
  imageData: ImageData | null
  pixels: Uint8ClampedArray | null
  pixels32: Uint32Array | null

  memoryManager: MemoryManager | null
  memoryManagerEngine: WasmWorld | null

  currentGravity: { x: number; y: number } | null
  currentAmbientTemperature: number | null

  fillVisited: Int32Array | null
  fillStamp: number

  isPlaying: boolean
  speed: number
  stepAccumulator: number
  renderMode: RenderMode
  isCrashed: boolean

  zoom: number
  panX: number
  panY: number

  viewportWidth: number
  viewportHeight: number

  lastTime: number

  fpsBuffer: Float32Array
  fpsIndex: number
  fpsCount: number

  lastStatsUpdate: number

  debugDirty: boolean
  debugLogInterval: number
  debugLogEvery: number

  lastInputX: number | null
  lastInputY: number | null
}

export const state: SimulationWorkerState = {
  engine: null,
  wasmModule: null,
  wasmMemory: null,
  canvas: null,

  renderer: null,
  useWebGL: true,

  sharedInputBuffer: null,

  thermalCanvas: null,
  ctx: null,
  screenCtx: null,
  imageData: null,
  pixels: null,
  pixels32: null,

  memoryManager: null,
  memoryManagerEngine: null,

  currentGravity: null,
  currentAmbientTemperature: null,

  fillVisited: null,
  fillStamp: 1,

  isPlaying: false,
  speed: 1,
  stepAccumulator: 0,
  renderMode: 'normal',
  isCrashed: false,

  zoom: 1,
  panX: 0,
  panY: 0,

  viewportWidth: 0,
  viewportHeight: 0,

  lastTime: 0,

  fpsBuffer: new Float32Array(FPS_SAMPLES),
  fpsIndex: 0,
  fpsCount: 0,

  lastStatsUpdate: 0,

  debugDirty: import.meta.env.VITE_DEBUG_DIRTY === 'true',
  debugLogInterval: 0,
  debugLogEvery: 60,

  lastInputX: null,
  lastInputY: null,
}
