import type { RenderMode, ToolType } from '@/features/simulation/engine/api/types'

export type WasmModule = typeof import('@particula/engine-wasm/particula_engine')
export type WasmWorld = import('@particula/engine-wasm/particula_engine').World
export type WasmInitOutput = import('@particula/engine-wasm/particula_engine').InitOutput

export interface InitMessage {
  type: 'INIT'
  protocolVersion: number
  canvas: OffscreenCanvas
  width: number
  height: number
  viewportWidth?: number
  viewportHeight?: number
  inputBuffer?: SharedArrayBuffer
}

export interface InputMessage {
  type: 'INPUT'
  x: number
  y: number
  radius: number
  elementId: number
  tool: ToolType
  brushShape?: 'circle' | 'square' | 'line'
}

export interface TransformMessage {
  type: 'TRANSFORM'
  zoom: number
  panX: number
  panY: number
}

export interface SettingsMessage {
  type: 'SETTINGS'
  gravity?: { x: number; y: number }
  ambientTemperature?: number
  speed?: number
}

export interface RenderModeMessage {
  type: 'SET_RENDER_MODE'
  mode: RenderMode
}

export interface ResizeMessage {
  type: 'RESIZE'
  width: number
  height: number
}

export interface SetViewportMessage {
  type: 'SET_VIEWPORT'
  width: number
  height: number
}

export type WorkerMessage =
  | InitMessage
  | InputMessage
  | TransformMessage
  | SettingsMessage
  | RenderModeMessage
  | ResizeMessage
  | SetViewportMessage
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'STEP' }
  | { type: 'CLEAR' }
  | { type: 'LOAD_CONTENT_BUNDLE'; json: string }
  | { type: 'FILL'; x: number; y: number; elementId: number }
  | { type: 'PIPETTE'; id: number; x: number; y: number }
  | { type: 'SNAPSHOT'; id: number }
  | { type: 'LOAD_SNAPSHOT'; buffer: ArrayBuffer }
  | { type: 'INPUT_END' }
  | {
      type: 'SPAWN_RIGID_BODY'
      x: number
      y: number
      size: number
      shape: 'box' | 'circle'
      elementId: number
    }
