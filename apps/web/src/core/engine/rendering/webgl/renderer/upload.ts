import { logError } from '../../../../logging/log'

import { uploadDirtyChunk } from '../upload/dirtyChunksUpload'
import { uploadFullTexture } from '../upload/fullUpload'
import { uploadMergedRectsBatch } from '../upload/mergedRectsUpload'
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
  memoryView: Uint8Array
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
    memoryView,
    engine,
    worldWidth,
    worldHeight,
    pboSize,
    usePBO,
    pbo,
    pboIndex,
    immediate = false,
  } = args

  const colorsPtr = engine.colors_ptr()
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
  memoryView: Uint8Array
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
    memoryView,
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
      memoryView,
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
      memoryView,
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
  const dirtyList = new Uint32Array(memory.buffer, dirtyListPtr, dirtyCount)

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
      engine,
      chunkIdx,
      xOffset: rect.xOffset,
      yOffset: rect.yOffset,
      uploadW: rect.uploadW,
      uploadH: rect.uploadH,
    })
  }

  return { forceFullUpload, pboIndex }
}

export function uploadWithMergedRects(args: {
  gl: WebGL2RenderingContext
  memoryView: Uint8Array
  engine: WasmWorld

  worldWidth: number
  worldHeight: number

  forceFullUpload: boolean

  pboSize: number
  usePBO: boolean
  pbo: [WebGLBuffer | null, WebGLBuffer | null]
  pboIndex: number
}): { forceFullUpload: boolean; pboIndex: number } {
  const { gl, memoryView, engine, worldWidth, worldHeight, pboSize, usePBO, pbo } = args

  let { forceFullUpload, pboIndex } = args

  const DEBUG_FORCE_FULL = import.meta.env.VITE_FORCE_FULL_UPLOAD === 'true'
  if (DEBUG_FORCE_FULL) {
    const res = uploadFull({
      gl,
      memoryView,
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
      memoryView,
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
      memoryView,
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

  for (let i = 0; i < rectCount; i++) {
    const x = engine.get_merged_rect_x(i)
    const y = engine.get_merged_rect_y(i)
    const w = engine.get_merged_rect_w(i)
    const h = engine.get_merged_rect_h(i)

    const area = computeClampedRectArea({ x, y, w, h, worldWidth, worldHeight })
    if (!area) continue

    coveredPixels += area.area
    if (coveredPixels > worldPixels * 0.5) {
      const res = uploadFull({
        gl,
        memoryView,
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

  const res = uploadMergedRectsBatch({
    gl,
    memoryView,
    engine,
    rectCount,
    worldWidth,
    worldHeight,
  })

  if (!res.ok) {
    logError('uploadWithMergedRects failed, falling back to full upload:', res.error)
    const full = uploadFull({
      gl,
      memoryView,
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
