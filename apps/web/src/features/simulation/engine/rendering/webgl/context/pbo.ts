import { debugLog, debugWarn } from '@/platform/logging/log'

export function initPBO(args: {
  gl: WebGL2RenderingContext
  pboSize: number
}): {
  pbo: [WebGLBuffer | null, WebGLBuffer | null]
  usePBO: boolean
} {
  const { gl, pboSize } = args

  const pbo0 = gl.createBuffer()
  const pbo1 = gl.createBuffer()

  if (!pbo0 || !pbo1) {
    debugWarn('Failed to create PBOs, falling back to direct upload')
    return { pbo: [null, null], usePBO: false }
  }

  try {
    // Initialize both PBOs with empty data
    for (const pbo of [pbo0, pbo1]) {
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, pbo)
      gl.bufferData(gl.PIXEL_UNPACK_BUFFER, pboSize, gl.STREAM_DRAW)
    }

    // Unbind PBO
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null)

    debugLog(`📦 PBO initialized: 2x ${(pboSize / 1024 / 1024).toFixed(2)}MB`)
    return { pbo: [pbo0, pbo1], usePBO: true }
  } catch (e) {
    debugWarn('PBO init failed:', e)
    return { pbo: [null, null], usePBO: false }
  }
}
