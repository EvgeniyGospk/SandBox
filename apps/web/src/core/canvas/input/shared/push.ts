export function pushEvent(args: {
  buffer: Int32Array
  x: number
  y: number
  type: number
  val: number

  inputBufferSize: number
  eventSize: number
  headOffset: number
  overflowIndex: number
}): boolean {
  const { buffer, x, y, type, val, inputBufferSize, eventSize, headOffset, overflowIndex } = args

  const writeIndex = Atomics.load(buffer, 0)
  const readIndex = Atomics.load(buffer, 1)

  const nextWriteIndex = (writeIndex + 1) % inputBufferSize

  if (nextWriteIndex === readIndex) {
    Atomics.store(buffer, overflowIndex, 1)
    return false
  }

  const offset = headOffset + writeIndex * eventSize
  buffer[offset + 0] = Math.floor(x)
  buffer[offset + 1] = Math.floor(y)
  buffer[offset + 2] = type
  buffer[offset + 3] = Math.floor(val)

  Atomics.store(buffer, 0, nextWriteIndex)

  return true
}

export function pushBrushEvent(args: {
  buffer: Int32Array
  x: number
  y: number
  brushSize: number
  elementId: number

  inputTypeBrushOffset: number
  inputBufferSize: number
  eventSize: number
  headOffset: number
  overflowIndex: number
}): boolean {
  const {
    buffer,
    x,
    y,
    brushSize,
    elementId,
    inputTypeBrushOffset,
    inputBufferSize,
    eventSize,
    headOffset,
    overflowIndex,
  } = args

  return pushEvent({
    buffer,
    x,
    y,
    type: inputTypeBrushOffset + elementId,
    val: brushSize,
    inputBufferSize,
    eventSize,
    headOffset,
    overflowIndex,
  })
}

export function pushEraseEvent(args: {
  buffer: Int32Array
  x: number
  y: number
  brushSize: number
  inputTypeErase: number

  inputBufferSize: number
  eventSize: number
  headOffset: number
  overflowIndex: number
}): boolean {
  const { buffer, x, y, brushSize, inputTypeErase, inputBufferSize, eventSize, headOffset, overflowIndex } = args

  return pushEvent({
    buffer,
    x,
    y,
    type: inputTypeErase,
    val: brushSize,
    inputBufferSize,
    eventSize,
    headOffset,
    overflowIndex,
  })
}

export function pushEndStrokeEvent(args: {
  buffer: Int32Array
  inputTypeEndStroke: number

  inputBufferSize: number
  eventSize: number
  headOffset: number
  overflowIndex: number
}): boolean {
  const { buffer, inputTypeEndStroke, inputBufferSize, eventSize, headOffset, overflowIndex } = args

  return pushEvent({
    buffer,
    x: 0,
    y: 0,
    type: inputTypeEndStroke,
    val: 0,
    inputBufferSize,
    eventSize,
    headOffset,
    overflowIndex,
  })
}
