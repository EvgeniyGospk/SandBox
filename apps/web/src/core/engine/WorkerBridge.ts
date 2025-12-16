/**
 * WorkerBridge - Main thread interface to simulation worker
 * 
 * Phase 5: Uses SharedArrayBuffer Ring Buffer for zero-latency input!
 * 
 * Provides the same API as WasmParticleEngine but delegates to worker.
 * Main thread never touches WASM directly.
 */

export * from './worker/WorkerBridge'
