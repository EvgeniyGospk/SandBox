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
  wasm: {
    engine: WasmWorld | null
    module: WasmModule | null
    memory: WebAssembly.Memory | null
  }

  render: {
    canvas: OffscreenCanvas | null
    renderer: WebGLRenderer | null
    useWebGL: boolean
    thermalCanvas: OffscreenCanvas | null
    ctx: OffscreenCanvasRenderingContext2D | null
    screenCtx: OffscreenCanvasRenderingContext2D | null
    imageData: ImageData | null
    pixels: Uint8ClampedArray | null
    pixels32: Uint32Array | null
    mode: RenderMode
  }

  view: {
    transform: { zoom: number; panX: number; panY: number }
    viewportWidth: number
    viewportHeight: number
  }

  sim: {
    isPlaying: boolean
    stepAccumulator: number
    isCrashed: boolean
  }

  settings: {
    gravity: { x: number; y: number } | null
    ambientTemperature: number | null
    speed: number
  }

  input: {
    sharedBuffer: SharedInputBuffer | null
    lastX: number | null
    lastY: number | null
  }

  memory: {
    manager: MemoryManager | null
    engine: WasmWorld | null
  }

  fill: {
    visited: Int32Array | null
    stamp: number
  }

  timing: {
    lastTime: number
    fpsBuffer: Float32Array
    fpsIndex: number
    fpsCount: number
    lastStatsUpdate: number
  }

  debug: {
    dirty: boolean
    logInterval: number
    logEvery: number
  }
}

export function createInitialWorkerState(): SimulationWorkerState {
  return {
    wasm: {
      engine: null,
      module: null,
      memory: null,
    },

    render: {
      canvas: null,
      renderer: null,
      useWebGL: true,
      thermalCanvas: null,
      ctx: null,
      screenCtx: null,
      imageData: null,
      pixels: null,
      pixels32: null,
      mode: 'normal',
    },

    view: {
      transform: { zoom: 1, panX: 0, panY: 0 },
      viewportWidth: 0,
      viewportHeight: 0,
    },

    sim: {
      isPlaying: false,
      stepAccumulator: 0,
      isCrashed: false,
    },

    settings: {
      gravity: null,
      ambientTemperature: null,
      speed: 1,
    },

    input: {
      sharedBuffer: null,
      lastX: null,
      lastY: null,
    },

    memory: {
      manager: null,
      engine: null,
    },

    fill: {
      visited: null,
      stamp: 1,
    },

    timing: {
      lastTime: 0,
      fpsBuffer: new Float32Array(FPS_SAMPLES),
      fpsIndex: 0,
      fpsCount: 0,
      lastStatsUpdate: 0,
    },

    debug: {
      dirty: import.meta.env.VITE_DEBUG_DIRTY === 'true',
      logInterval: 0,
      logEvery: 60,
    },
  }
}
