/**
 * Particula Engine - WASM-powered particle simulation
 * 
 * Phase 5: Clean architecture - WASM only!
 * Legacy fallback engines moved to _LEGACY/
 */

// Core exports
export { ELEMENTS, getElementColor } from './elements'
export type { ElementType, WorldSettings, RenderMode, ToolType } from './api/types'

// Primary engine: Rust WASM
export { WasmParticleEngine, loadWasmEngine, isWasmAvailable } from './WasmParticleEngine'

// Re-export WasmParticleEngine as ParticleEngine for convenience
export { WasmParticleEngine as ParticleEngine } from './WasmParticleEngine'
