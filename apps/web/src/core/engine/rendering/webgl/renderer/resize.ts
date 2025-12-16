import { updateBorderBuffer as updateBorderBufferImpl } from '../geometry'
import { initPBO as initPBOImpl } from '../context/pbo'

type InitPBOResult = {
  pbo: [WebGLBuffer | null, WebGLBuffer | null]
  usePBO: boolean
}

export function computeViewportSize(width: number, height: number): { viewportWidth: number; viewportHeight: number } {
  return { viewportWidth: Math.floor(width), viewportHeight: Math.floor(height) }
}

export function updateBorderAndPBO(args: {
  gl: WebGL2RenderingContext
  lineBuffer: WebGLBuffer

  worldWidth: number
  worldHeight: number

  usePboConstant: boolean

  pbo: [WebGLBuffer | null, WebGLBuffer | null]
  pboIndex: number
}): { pbo: [WebGLBuffer | null, WebGLBuffer | null]; pboIndex: number; pboSize: number; usePBO: boolean } {
  const { gl, lineBuffer, worldWidth, worldHeight, usePboConstant } = args

  updateBorderBufferImpl(gl, lineBuffer, worldWidth, worldHeight)

  let pbo: [WebGLBuffer | null, WebGLBuffer | null] = args.pbo
  let pboIndex = args.pboIndex
  let usePBO = false
  let pboSize = worldWidth * worldHeight * 4

  // Recreate PBOs to match new texture size
  if (usePboConstant) {
    // Delete old PBOs
    if (pbo[0]) gl.deleteBuffer(pbo[0])
    if (pbo[1]) gl.deleteBuffer(pbo[1])
    pbo = [null, null]
    pboIndex = 0

    const init: InitPBOResult = initPBOImpl({ gl, pboSize })
    pbo = init.pbo
    usePBO = init.usePBO
  }

  return { pbo, pboIndex, pboSize, usePBO }
}

export function resizeWorldResources(args: {
  gl: WebGL2RenderingContext
  texture: WebGLTexture

  width: number
  height: number

  usePBO: boolean
  pbo: [WebGLBuffer | null, WebGLBuffer | null]
  pboIndex: number

  onAfterResize: (worldWidth: number, worldHeight: number) => void
}): {
  worldWidth: number
  worldHeight: number
  pboSize: number
  pboIndex: number
} {
  const { gl, texture } = args

  const worldWidth = Math.floor(args.width)
  const worldHeight = Math.floor(args.height)

  // Resize texture
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, worldWidth, worldHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

  let pboSize = worldWidth * worldHeight * 4
  let pboIndex = args.pboIndex

  // Resize PBO buffers (if enabled)
  if (args.usePBO && args.pbo[0] && args.pbo[1]) {
    for (let i = 0; i < 2; i++) {
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, args.pbo[i])
      gl.bufferData(gl.PIXEL_UNPACK_BUFFER, pboSize, gl.STREAM_DRAW)
    }
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null)
    pboIndex = 0
  }

  args.onAfterResize(worldWidth, worldHeight)

  return { worldWidth, worldHeight, pboSize, pboIndex }
}
