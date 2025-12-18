import { logError } from '@/platform/logging/log'

import { uploadDirtyChunk } from '../upload/dirtyChunksUpload'
import { uploadFullTexture } from '../upload/fullUpload'
import { uploadMergedRectsBatch, type UploadRect } from '../upload/mergedRectsUpload'
import {
  computeClampedRectArea,
  getChunkUploadRect,
  hasEdgeChunks,
  shouldFullUploadForDirtyChunks,
  shouldFullUploadForMergedRects,
} from './uploadHeuristics'

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

export function uploadDirtyChunks(args: {
  gl: WebGL2RenderingContext
  engine: WasmWorld
  memory: WebAssembly.Memory

  worldWidth: number
  worldHeight: number
  chunkSize: number

  forceFullUpload: boolean

  pboSize: number
  usePBO: boolean
  pbo: [WebGLBuffer | null, WebGLBuffer | null]
  pboIndex: number
}): { forceFullUpload: boolean; pboIndex: number } {
  const {
    gl,
    engine,
    memory,
    worldWidth,
    worldHeight,
    chunkSize,
    pboSize,
    usePBO,
    pbo,
  } = args

  let { forceFullUpload, pboIndex } = args

  const dirtyCount = engine.collect_dirty_chunks()

  if (forceFullUpload) {
    const res = uploadFull({
      gl,
      memory,
      engine,
      worldWidth,
      worldHeight,
      pboSize,
      usePBO,
      pbo,
      pboIndex,
      immediate: true,
    })
    pboIndex = res.pboIndex
    forceFullUpload = false
    return { forceFullUpload, pboIndex }
  }

  if (dirtyCount === 0) return { forceFullUpload, pboIndex }

  const chunksX = engine.chunks_x()
  const chunksY = engine.chunks_y()
  const totalChunks = chunksX * chunksY

  const hasEdge = hasEdgeChunks({ worldWidth, worldHeight, chunkSize })

  if (shouldFullUploadForDirtyChunks({ dirtyCount, totalChunks, hasEdgeChunks: hasEdge })) {
    const res = uploadFull({
      gl,
      memory,
      engine,
      worldWidth,
      worldHeight,
      pboSize,
      usePBO,
      pbo,
      pboIndex,
    })
    pboIndex = res.pboIndex
    return { forceFullUpload, pboIndex }
  }

  const dirtyListPtr = engine.get_dirty_list_ptr()
  const colorsPtr = engine.colors_ptr()

  // Create views AFTER any WASM calls that might grow memory.
  const memoryView = new Uint8Array(memory.buffer)
  const dirtyList = new Uint32Array(memory.buffer, dirtyListPtr, dirtyCount)

  // Upload dirty chunk rects directly from the full world color buffer.
  gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null)
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, worldWidth)
  gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0)
  gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0)

  try {
    for (let i = 0; i < dirtyCount; i++) {
      const chunkIdx = dirtyList[i]

      const rect = getChunkUploadRect({
        chunkIdx,
        chunksX,
        chunkSize,
        worldWidth,
        worldHeight,
      })
      if (!rect) continue

      uploadDirtyChunk({
        gl,
        memoryView,
        colorsPtr,
        worldWidth,
        worldHeight,
        xOffset: rect.xOffset,
        yOffset: rect.yOffset,
        uploadW: rect.uploadW,
        uploadH: rect.uploadH,
      })
    }
  } finally {
    // Reset pixel store state for later full uploads (tight packing).
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0)
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0)
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0)
  }

  return { forceFullUpload, pboIndex }
}

export function uploadWithMergedRects(args: {
  gl: WebGL2RenderingContext
  engine: WasmWorld
  memory: WebAssembly.Memory

  worldWidth: number
  worldHeight: number

  forceFullUpload: boolean

  pboSize: number
  usePBO: boolean
  pbo: [WebGLBuffer | null, WebGLBuffer | null]
  pboIndex: number
}): { forceFullUpload: boolean; pboIndex: number } {
  const { gl, engine, memory, worldWidth, worldHeight, pboSize, usePBO, pbo } = args

  const { forceFullUpload, pboIndex } = args

  const DEBUG_FORCE_FULL = import.meta.env.VITE_FORCE_FULL_UPLOAD === 'true'
  if (DEBUG_FORCE_FULL) {
    const res = uploadFull({
      gl,
      memory,
      engine,
      worldWidth,
      worldHeight,
      pboSize,
      usePBO,
      pbo,
      pboIndex,
    })
    return { forceFullUpload, pboIndex: res.pboIndex }
  }

  if (forceFullUpload) {
    const res = uploadFull({
      gl,
      memory,
      engine,
      worldWidth,
      worldHeight,
      pboSize,
      usePBO,
      pbo,
      pboIndex,
      immediate: true,
    })
    return { forceFullUpload: false, pboIndex: res.pboIndex }
  }

  const rectCount = engine.collect_merged_rects()

  if (rectCount === 0) return { forceFullUpload, pboIndex }

  const chunksX = engine.chunks_x()
  const chunksY = engine.chunks_y()
  const totalChunks = chunksX * chunksY

  if (shouldFullUploadForMergedRects({ rectCount, totalChunks })) {
    const res = uploadFull({
      gl,
      memory,
      engine,
      worldWidth,
      worldHeight,
      pboSize,
      usePBO,
      pbo,
      pboIndex,
    })
    return { forceFullUpload, pboIndex: res.pboIndex }
  }

  const worldPixels = worldWidth * worldHeight
  let coveredPixels = 0
  const rects: UploadRect[] = []

  for (let i = 0; i < rectCount; i++) {
    const x = engine.get_merged_rect_x(i)
    const y = engine.get_merged_rect_y(i)
    const w = engine.get_merged_rect_w(i)
    const h = engine.get_merged_rect_h(i)

    const area = computeClampedRectArea({ x, y, w, h, worldWidth, worldHeight })
    if (!area) continue
    rects.push({ x, y, w: area.w, h: area.h })

    coveredPixels += area.area
    if (coveredPixels > worldPixels * 0.5) {
      const res = uploadFull({
        gl,
        memory,
        engine,
        worldWidth,
        worldHeight,
        pboSize,
        usePBO,
        pbo,
        pboIndex,
      })
      return { forceFullUpload, pboIndex: res.pboIndex }
    }
  }

  if (rects.length === 0) return { forceFullUpload, pboIndex }

  const colorsPtr = engine.colors_ptr()
  const memoryView = new Uint8Array(memory.buffer)

  const res = uploadMergedRectsBatch({
    gl,
    memoryView,
    colorsPtr,
    worldWidth,
    worldHeight,
    rects,
  })

  if (!res.ok) {
    logError('uploadWithMergedRects failed, falling back to full upload:', res.error)
    const full = uploadFull({
      gl,
      memory,
      engine,
      worldWidth,
      worldHeight,
      pboSize,
      usePBO,
      pbo,
      pboIndex,
    })
    return { forceFullUpload, pboIndex: full.pboIndex }
  }

  return { forceFullUpload, pboIndex }
}
