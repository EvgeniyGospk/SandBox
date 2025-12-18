import { describe, expect, it } from 'vitest'

import {
  INPUT_TYPE_BRUSH_OFFSET,
  INPUT_TYPE_END_STROKE,
  INPUT_TYPE_ERASE,
  INPUT_TYPE_NONE,
} from '@/core/canvas/input/InputBuffer'

import { decodeSharedInputEvent, shouldResetTrackingOnDecodedEvent, shouldResetTrackingOnOverflow } from './sharedInputDecoding'

describe('sharedInputDecoding', () => {
  it('decodes end-stroke sentinel', () => {
    const ev = decodeSharedInputEvent({ x: 0, y: 0, type: INPUT_TYPE_END_STROKE, val: 0, maxElementId: 10 })
    expect(ev).toEqual({ kind: 'end_stroke' })
    expect(shouldResetTrackingOnDecodedEvent(ev)).toBe(true)
  })

  it('returns reset for malformed inputs', () => {
    const ev1 = decodeSharedInputEvent({ x: Number.NaN, y: 0, type: INPUT_TYPE_ERASE, val: 1, maxElementId: 10 })
    expect(ev1).toEqual({ kind: 'reset' })
    expect(shouldResetTrackingOnDecodedEvent(ev1)).toBe(true)

    const ev2 = decodeSharedInputEvent({ x: 0, y: 0, type: Number.NaN, val: 1, maxElementId: 10 })
    expect(ev2).toEqual({ kind: 'reset' })
  })

  it('ignores INPUT_TYPE_NONE', () => {
    const ev = decodeSharedInputEvent({ x: 0, y: 0, type: INPUT_TYPE_NONE, val: 0, maxElementId: 10 })
    expect(ev).toEqual({ kind: 'ignore' })
  })

  it('decodes erase events', () => {
    const ev = decodeSharedInputEvent({ x: 10.7, y: 20.2, type: INPUT_TYPE_ERASE, val: 5.9, maxElementId: 10 })
    expect(ev).toEqual({ kind: 'stroke', x: 10, y: 20, radius: 5, isErase: true, elementType: 0 })
  })

  it('decodes brush events with offset encoding', () => {
    const brushType = INPUT_TYPE_BRUSH_OFFSET + 3
    const ev = decodeSharedInputEvent({ x: 1.2, y: 2.9, type: brushType, val: 12, maxElementId: 10 })
    expect(ev).toEqual({ kind: 'stroke', x: 1, y: 2, radius: 12, isErase: false, elementType: 3 })
  })

  it('ignores brush events with out-of-range element ids', () => {
    const brushType = INPUT_TYPE_BRUSH_OFFSET + 999
    const ev = decodeSharedInputEvent({ x: 1, y: 2, type: brushType, val: 12, maxElementId: 10 })
    expect(ev).toEqual({ kind: 'ignore' })
  })

  it('clamps radius to [0,256]', () => {
    const brushType = INPUT_TYPE_BRUSH_OFFSET + 1
    const ev1 = decodeSharedInputEvent({ x: 0, y: 0, type: brushType, val: -123, maxElementId: 10 })
    expect(ev1).toEqual({ kind: 'stroke', x: 0, y: 0, radius: 0, isErase: false, elementType: 1 })

    const ev2 = decodeSharedInputEvent({ x: 0, y: 0, type: brushType, val: 10_000, maxElementId: 10 })
    expect(ev2).toEqual({ kind: 'stroke', x: 0, y: 0, radius: 256, isErase: false, elementType: 1 })
  })

  it('resets tracking on overflow', () => {
    expect(shouldResetTrackingOnOverflow(true)).toBe(true)
    expect(shouldResetTrackingOnOverflow(false)).toBe(false)
  })
})
