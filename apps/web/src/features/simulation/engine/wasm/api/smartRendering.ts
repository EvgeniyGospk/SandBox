import type { WasmWorld } from '../types'

export function getDirtyChunksCount(world: WasmWorld): number {
  return world.collect_dirty_chunks()
}

export function getDirtyListPtr(world: WasmWorld): number {
  return world.get_dirty_list_ptr()
}

export function extractChunkPixels(world: WasmWorld, chunkIdx: number): number {
  return world.extract_chunk_pixels(chunkIdx)
}

export function getChunksX(world: WasmWorld): number {
  return world.chunks_x()
}

export function getChunksY(world: WasmWorld): number {
  return world.chunks_y()
}
