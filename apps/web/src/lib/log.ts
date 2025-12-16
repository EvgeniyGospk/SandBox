const DEBUG_LOGS =
  import.meta.env.DEV ||
  import.meta.env.VITE_DEBUG_LOGS === 'true' ||
  import.meta.env.VITE_DEBUG === 'true'

export type ErrorReporter = (error: unknown, context?: Record<string, unknown>) => void

let errorReporter: ErrorReporter | null = null

export function setErrorReporter(reporter: ErrorReporter | null): void {
  errorReporter = reporter
}

export function debugLog(...args: unknown[]): void {
  if (DEBUG_LOGS) console.log(...args)
}

export function debugWarn(...args: unknown[]): void {
  if (DEBUG_LOGS) console.warn(...args)
}

export function logError(...args: unknown[]): void {
  console.error(...args)
  if (errorReporter) {
    // Avoid leaking arbitrary data by default; forward a best-effort summary.
    const [first] = args
    const error =
      first instanceof Error ? first : new Error(typeof first === 'string' ? first : 'Unknown error')
    errorReporter(error, { args: args.map((a) => (typeof a === 'string' ? a : typeof a)) })
  }
}
