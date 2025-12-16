/**
 * High-performance renderer using Double Buffering
 * Phase 5: ABGR direct copy + OffscreenCanvas optimization
 * 
 * Optimizations:
 * - ABGR format: Direct pixels32.set() from WASM memory
 * - OffscreenCanvas: Better memory management, no DOM overhead
 * - Uint32Array.fill(): 50-100x faster clear
 * - No object access = no pointer chasing = cache friendly
 */

export * from './rendering/Renderer'
