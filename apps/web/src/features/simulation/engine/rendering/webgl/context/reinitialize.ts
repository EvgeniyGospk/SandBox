import { createBorderBuffer, createQuadBuffer } from '../geometry'
import { createProgram } from '../program'

export function reinitializeResources(args: {
  gl: WebGL2RenderingContext
  worldWidth: number
  worldHeight: number
  texVertexShader: string
  texFragmentShader: string
  lineVertexShader: string
  lineFragmentShader: string
}): {
  texture: WebGLTexture
  texProgram: WebGLProgram
  quadBuffer: WebGLBuffer
  uTexTransform: WebGLUniformLocation | null
  uTexWorldSize: WebGLUniformLocation | null
  uTexViewportSize: WebGLUniformLocation | null

  lineProgram: WebGLProgram
  lineBuffer: WebGLBuffer
  uLineTransform: WebGLUniformLocation | null
  uLineWorldSize: WebGLUniformLocation | null
  uLineViewportSize: WebGLUniformLocation | null
  uLineColor: WebGLUniformLocation | null
} {
  const { gl } = args

  const texProgram = createProgram(gl, args.texVertexShader, args.texFragmentShader)
  const quadBuffer = createQuadBuffer(gl)

  const texture = gl.createTexture()
  if (!texture) throw new Error('Failed to create texture')

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, args.worldWidth, args.worldHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

  const uTexTransform = gl.getUniformLocation(texProgram, 'u_transform')
  const uTexWorldSize = gl.getUniformLocation(texProgram, 'u_worldSize')
  const uTexViewportSize = gl.getUniformLocation(texProgram, 'u_viewportSize')

  const lineProgram = createProgram(gl, args.lineVertexShader, args.lineFragmentShader)
  const lineBuffer = createBorderBuffer(gl, args.worldWidth, args.worldHeight)

  const uLineTransform = gl.getUniformLocation(lineProgram, 'u_transform')
  const uLineWorldSize = gl.getUniformLocation(lineProgram, 'u_worldSize')
  const uLineViewportSize = gl.getUniformLocation(lineProgram, 'u_viewportSize')
  const uLineColor = gl.getUniformLocation(lineProgram, 'u_color')

  return {
    texture,
    texProgram,
    quadBuffer,
    uTexTransform,
    uTexWorldSize,
    uTexViewportSize,

    lineProgram,
    lineBuffer,
    uLineTransform,
    uLineWorldSize,
    uLineViewportSize,
    uLineColor,
  }
}
