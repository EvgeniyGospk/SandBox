import { describe, expect, it } from 'vitest'
import {
  SharedInputBuffer,
  getInputBufferSize,
  INPUT_BUFFER_SIZE,
  INPUT_TYPE_END_STROKE,
} from './InputBuffer'

describe('SharedInputBuffer', () => {
  it('sets and clears overflow flag when full', () => {
    const sab = new SharedArrayBuffer(getInputBufferSize())
    const buf = new SharedInputBuffer(sab)

    // Ring buffer keeps 1 slot empty to distinguish full vs empty.
    for (let i = 0; i < INPUT_BUFFER_SIZE - 1; i++) {
      expect(buf.push(i, i, 0, 0)).toBe(true)
    }

    expect(buf.push(0, 0, 0, 0)).toBe(false)
    expect(buf.checkOverflow()).toBe(true)
    expect(buf.checkAndClearOverflow()).toBe(true)
    expect(buf.checkOverflow()).toBe(false)
  })

  it('emits an end-stroke sentinel event', () => {
    const sab = new SharedArrayBuffer(getInputBufferSize())
    const buf = new SharedInputBuffer(sab)

    buf.pushEndStroke()
    expect(buf.pendingCount()).toBe(1)

    const events = buf.readAll()
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe(INPUT_TYPE_END_STROKE)
    expect(buf.pendingCount()).toBe(0)
  })
})

