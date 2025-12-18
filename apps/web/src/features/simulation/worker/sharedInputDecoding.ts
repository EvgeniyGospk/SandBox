import {
  INPUT_TYPE_BRUSH_OFFSET,
  INPUT_TYPE_END_STROKE,
  INPUT_TYPE_ERASE,
  INPUT_TYPE_NONE,
} from '@/core/canvas/input/InputBuffer'

export type DecodedSharedInputEvent =
  | { kind: 'end_stroke' }
  | { kind: 'reset' }
  | {
      kind: 'stroke'
      x: number
      y: number
      radius: number
      isErase: boolean
      elementType: number
    }

export type SharedInputDecodeResult =
  | { kind: 'ignore' }
  | { kind: 'end_stroke' }
  | { kind: 'reset' }
  | {
      kind: 'stroke'
      x: number
      y: number
      radius: number
      isErase: boolean
      elementType: number
    }

export function decodeSharedInputEvent(args: {
  x: number
  y: number
  type: number
  val: number
  maxElementId: number
}): SharedInputDecodeResult {
  const { x, y, type, val, maxElementId } = args

  if (!Number.isFinite(type)) return { kind: 'reset' }

  if (type === INPUT_TYPE_NONE) return { kind: 'ignore' }

  if (type === INPUT_TYPE_END_STROKE) {
    return { kind: 'end_stroke' }
  }

  if (!Number.isFinite(x) || !Number.isFinite(y)) return { kind: 'reset' }
  if (!Number.isFinite(maxElementId) || maxElementId < 0) return { kind: 'reset' }

  const currentX = Math.floor(x)
  const currentY = Math.floor(y)
  const radius = Number.isFinite(val) ? Math.max(0, Math.min(256, Math.floor(val))) : 0

  if (type === INPUT_TYPE_ERASE) {
    return {
      kind: 'stroke',
      x: currentX,
      y: currentY,
      radius,
      isErase: true,
      elementType: 0,
    }
  }

  const elementType = type - INPUT_TYPE_BRUSH_OFFSET
  if (elementType <= 0 || elementType > maxElementId) {
    return { kind: 'ignore' }
  }

  return {
    kind: 'stroke',
    x: currentX,
    y: currentY,
    radius,
    isErase: false,
    elementType,
  }
}

export function shouldResetTrackingOnOverflow(overflowed: boolean): boolean {
  return overflowed
}

export function shouldResetTrackingOnDecodedEvent(ev: SharedInputDecodeResult): boolean {
  return ev.kind === 'end_stroke' || ev.kind === 'reset'
}
