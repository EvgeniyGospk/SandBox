import { debugLog, debugWarn } from '../../log'
import {
  SharedInputBuffer,
  getInputBufferSize,
  isSharedArrayBufferAvailable,
} from '../../InputBuffer'

export function setupSharedInputBuffer(): {
  inputBufferData: SharedArrayBuffer | null
  inputBuffer: SharedInputBuffer | null
  useSharedInput: boolean
} {
  let inputBufferData: SharedArrayBuffer | null = null
  let inputBuffer: SharedInputBuffer | null = null
  let useSharedInput = false

  if (isSharedArrayBufferAvailable()) {
    try {
      inputBufferData = new SharedArrayBuffer(getInputBufferSize())
      inputBuffer = new SharedInputBuffer(inputBufferData)
      useSharedInput = true
      debugLog('🚀 WorkerBridge: Using SharedArrayBuffer for input (zero-latency)')
    } catch {
      debugWarn('SharedArrayBuffer not available, falling back to postMessage')
    }
  }

  return { inputBufferData, inputBuffer, useSharedInput }
}
