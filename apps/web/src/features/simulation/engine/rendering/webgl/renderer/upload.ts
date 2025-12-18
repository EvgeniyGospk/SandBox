import { uploadFullTexture } from '../upload/fullUpload'

type WasmWorld = import('@particula/engine-wasm/particula_engine').World

export function uploadFull(args: {
  gl: WebGL2RenderingContext
  memory: WebAssembly.Memory
  engine: WasmWorld
  worldWidth: number
  worldHeight: number

  pboSize: number
  usePBO: boolean
  pbo: [WebGLBuffer | null, WebGLBuffer | null]
  pboIndex: number

  immediate?: boolean
}): { pboIndex: number } {
  const {
    gl,
    memory,
    engine,
    worldWidth,
    worldHeight,
    pboSize,
    usePBO,
    pbo,
    pboIndex,
    immediate = false,
  } = args

  // Defensive: ensure no PBO is bound when doing CPU-backed uploads.
  // (uploadFullTexture also does this for the non-PBO path, but keeping it here
  // prevents state leaks from earlier GL code.)
  gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null)

  const colorsPtr = engine.colors_ptr()
  const memoryView = new Uint8Array(memory.buffer)
  const res = uploadFullTexture({
    gl,
    memoryView,
    colorsPtr,
    worldWidth,
    worldHeight,
    pboSize,
    usePBO,
    pbo,
    pboIndex,
    immediate,
  })

  return { pboIndex: res.pboIndex }
}
