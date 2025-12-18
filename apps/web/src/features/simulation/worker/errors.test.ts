import { describe, expect, it } from 'vitest'

import { canRecoverFromCrash, serializeError } from './errors'

describe('worker/errors', () => {
  it('serializes Error with name/message and optional stack', () => {
    const err = new Error('boom')
    err.name = 'TestError'

    const ser = serializeError(err)
    expect(ser).toEqual(
      expect.objectContaining({
        name: 'TestError',
        message: 'boom',
      })
    )
    if (ser?.stack !== undefined) {
      expect(typeof ser.stack).toBe('string')
    }
  })

  it('serializes non-Error values losslessly as message strings', () => {
    expect(serializeError('x')?.message).toBe('x')
    expect(serializeError(123)?.message).toBe('123')
    expect(serializeError(null)?.message).toBe('null')
  })

  it('classifies WebAssembly.RuntimeError as recoverable', () => {
    const err = new WebAssembly.RuntimeError('trap')
    expect(canRecoverFromCrash(err)).toBe(true)
    expect(canRecoverFromCrash(new Error('nope'))).toBe(false)
  })
})
