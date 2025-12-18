export type WorkerSerializedError = {
  name: string
  message: string
  stack?: string
}

const STACK_MAX_LINES = 30
const STACK_MAX_CHARS = 2000

function sanitizeStack(stack: string): string {
  const lines = stack.split('\n').slice(0, STACK_MAX_LINES)
  const joined = lines.join('\n')
  return joined.length > STACK_MAX_CHARS ? joined.slice(0, STACK_MAX_CHARS) : joined
}

export function canRecoverFromCrash(error: unknown): boolean {
  if (error instanceof WebAssembly.RuntimeError) return true
  if (error instanceof RangeError) return false
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('out of memory') || msg.includes('oom')) return false
  }
  return false
}

export function serializeError(err: unknown): WorkerSerializedError | undefined {
  if (err instanceof Error) {
    const stack = typeof err.stack === 'string' && err.stack.length > 0 ? sanitizeStack(err.stack) : undefined
    return {
      name: typeof err.name === 'string' && err.name.length > 0 ? err.name : 'Error',
      message: typeof err.message === 'string' ? err.message : String(err),
      stack,
    }
  }

  if (typeof err === 'string') {
    return { name: 'Error', message: err }
  }

  if (typeof err === 'number' || typeof err === 'boolean' || err === null || err === undefined) {
    return { name: 'Error', message: String(err) }
  }

  try {
    return { name: 'Error', message: String(err) }
  } catch {
    return { name: 'Error', message: 'Unknown error' }
  }
}

export function postWorkerError(args: {
  message: string
  error?: unknown
  extra?: Record<string, unknown>
}): void {
  const { message, error, extra } = args
  const msg: Record<string, unknown> = {
    type: 'ERROR',
    message,
    ...extra,
  }
  if (error !== undefined) {
    msg.error = serializeError(error)
  }
  self.postMessage(msg)
}

export function postWorkerCrash(args: {
  message: string
  canRecover: boolean
  error?: unknown
  extra?: Record<string, unknown>
}): void {
  const { message, canRecover, error, extra } = args
  const msg: Record<string, unknown> = {
    type: 'CRASH',
    message,
    canRecover,
    ...extra,
  }
  if (error !== undefined) {
    msg.error = serializeError(error)
  }
  self.postMessage(msg)
}
