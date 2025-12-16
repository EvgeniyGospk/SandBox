export type RenderBufferCanvas = HTMLCanvasElement | OffscreenCanvas
export type RenderBufferCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export function createRenderBuffer(args: {
  width: number
  height: number
  useOffscreenCanvas: boolean
}): {
  bufferCanvas: RenderBufferCanvas
  bufferCtx: RenderBufferCtx
  imageData: ImageData
  pixels: Uint8ClampedArray
  pixels32: Uint32Array
} {
  const { width, height, useOffscreenCanvas } = args

  let bufferCanvas: RenderBufferCanvas
  let bufferCtx: RenderBufferCtx

  if (useOffscreenCanvas) {
    bufferCanvas = new OffscreenCanvas(width, height)
    const bCtx = bufferCanvas.getContext('2d', { alpha: false })
    if (!bCtx) throw new Error('Failed to create OffscreenCanvas context')
    bufferCtx = bCtx
  } else {
    bufferCanvas = document.createElement('canvas')
    bufferCanvas.width = width
    bufferCanvas.height = height
    const bCtx = bufferCanvas.getContext('2d', { alpha: false })
    if (!bCtx) throw new Error('Failed to create buffer context')
    bufferCtx = bCtx
  }

  const imageData = bufferCtx.createImageData(width, height)
  const pixels = imageData.data
  const pixels32 = new Uint32Array(pixels.buffer)

  return { bufferCanvas, bufferCtx, imageData, pixels, pixels32 }
}

export function resizeRenderBuffer(args: {
  bufferCanvas: RenderBufferCanvas
  bufferCtx: RenderBufferCtx
  width: number
  height: number
}): {
  imageData: ImageData
  pixels: Uint8ClampedArray
  pixels32: Uint32Array
} {
  const { bufferCanvas, bufferCtx, width, height } = args

  bufferCanvas.width = width
  bufferCanvas.height = height

  const imageData = bufferCtx.createImageData(width, height)
  const pixels = imageData.data
  const pixels32 = new Uint32Array(pixels.buffer)

  return { imageData, pixels, pixels32 }
}
