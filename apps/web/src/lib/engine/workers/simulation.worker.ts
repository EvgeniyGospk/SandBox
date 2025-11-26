/**
 * SimulationWorker - Physics simulation in a separate thread
 * 
 * Phase 2: Multi-threaded simulation
 * 
 * This worker receives SharedArrayBuffers from Main Thread,
 * runs physics simulation, and writes results directly to shared memory.
 * Main Thread can read the updated data for rendering without any copying.
 */

import { SharedGrid, SharedGridBuffers } from '../core/SharedGrid'
import { 
  ElementType, 
  WorldSettings, 
  ElementCategory,
  ELEMENT_ID_TO_NAME,
  EL_EMPTY 
} from '../types'
import { ELEMENTS, getColorWithVariation, getElementCategory } from '../elements'
import { REACTIONS, Reaction } from '../reactions'
import { 
  IBehavior, 
  UpdateContext,
  PowderBehavior, 
  LiquidBehavior, 
  GasBehavior, 
  EnergyBehavior,
  UtilityBehavior,
  PlantBehavior
} from '../behaviors'

// ============================================
// WORKER STATE
// ============================================
let grid: SharedGrid | null = null
let frame = 0
let settings: WorldSettings = {
  gravity: { x: 0, y: 0.5 },
  ambientTemperature: 20,
  speed: 1,
}
let particleCount = 0
let isRunning = false

// Behavior registry
const behaviors = new Map<ElementCategory, IBehavior>([
  ['powder', new PowderBehavior()],
  ['liquid', new LiquidBehavior()],
  ['gas', new GasBehavior()],
  ['energy', new EnergyBehavior()],
  ['utility', new UtilityBehavior()],
  ['bio', new PlantBehavior()],
])

// ============================================
// MESSAGE HANDLERS
// ============================================

export type WorkerMessage = 
  | { type: 'init'; buffers: SharedGridBuffers }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'step' }
  | { type: 'setSettings'; settings: Partial<WorldSettings> }
  | { type: 'addParticle'; x: number; y: number; element: ElementType }
  | { type: 'addParticlesInRadius'; cx: number; cy: number; radius: number; element: ElementType }
  | { type: 'removeParticle'; x: number; y: number }
  | { type: 'removeParticlesInRadius'; cx: number; cy: number; radius: number }
  | { type: 'clear' }
  | { type: 'getStats' }

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'stepped'; frame: number; particleCount: number }
  | { type: 'stats'; frame: number; particleCount: number }
  | { type: 'error'; message: string }

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data
  
  try {
    switch (msg.type) {
      case 'init':
        handleInit(msg.buffers)
        break
      case 'start':
        isRunning = true
        runSimulationLoop()
        break
      case 'stop':
        isRunning = false
        break
      case 'step':
        step()
        respond({ type: 'stepped', frame, particleCount })
        break
      case 'setSettings':
        Object.assign(settings, msg.settings)
        break
      case 'addParticle':
        addParticle(msg.x, msg.y, msg.element)
        break
      case 'addParticlesInRadius':
        addParticlesInRadius(msg.cx, msg.cy, msg.radius, msg.element)
        break
      case 'removeParticle':
        removeParticle(msg.x, msg.y)
        break
      case 'removeParticlesInRadius':
        removeParticlesInRadius(msg.cx, msg.cy, msg.radius)
        break
      case 'clear':
        clear()
        break
      case 'getStats':
        respond({ type: 'stats', frame, particleCount })
        break
    }
  } catch (err) {
    respond({ type: 'error', message: String(err) })
  }
}

function respond(msg: WorkerResponse) {
  self.postMessage(msg)
}

function handleInit(buffers: SharedGridBuffers) {
  grid = SharedGrid.fromBuffers(buffers)
  frame = 0
  particleCount = 0
  
  // Count existing particles
  for (let i = 0; i < grid.types.length; i++) {
    if (grid.types[i] !== EL_EMPTY) particleCount++
  }
  
  respond({ type: 'ready' })
}

// ============================================
// SIMULATION LOOP
// ============================================

function runSimulationLoop() {
  if (!isRunning || !grid) return
  
  step()
  respond({ type: 'stepped', frame, particleCount })
  
  // Schedule next step (target ~60 FPS simulation)
  setTimeout(runSimulationLoop, 16)
}

function step() {
  if (!grid) return
  
  // Reset update flags
  grid.resetUpdated()
  
  // Process based on gravity direction
  const goRight = (frame & 1) === 0
  const gravityDown = settings.gravity.y >= 0
  
  if (gravityDown) {
    for (let y = grid.height - 1; y >= 0; y--) {
      processRow(y, goRight)
    }
  } else {
    for (let y = 0; y < grid.height; y++) {
      processRow(y, goRight)
    }
  }
  
  // Thermodynamics pass every other frame
  if (frame % 2 === 0) {
    processTemperatureGrid()
  }
  
  frame++
}

function processRow(y: number, goRight: boolean) {
  if (!grid) return
  const w = grid.width
  
  if (goRight) {
    for (let x = 0; x < w; x++) {
      updateParticle(x, y)
    }
  } else {
    for (let x = w - 1; x >= 0; x--) {
      updateParticle(x, y)
    }
  }
}

function updateParticle(x: number, y: number) {
  if (!grid) return
  
  const type = grid.getType(x, y)
  if (type === EL_EMPTY) return
  if (grid.isUpdated(x, y)) return
  
  grid.setUpdated(x, y, true)
  
  // Handle lifetime
  const life = grid.getLife(x, y)
  if (life > 0) {
    grid.setLife(x, y, life - 1)
    if (life - 1 <= 0) {
      grid.clearCell(x, y)
      particleCount--
      return
    }
  }
  
  // Get behavior for this category
  const category = getElementCategory(ELEMENT_ID_TO_NAME[type])
  const behavior = behaviors.get(category)
  
  if (behavior) {
    const ctx: UpdateContext = {
      grid,
      x,
      y,
      settings,
      frame
    }
    behavior.update(ctx)
  }
  
  // Process reactions
  const currentType = grid.getType(x, y)
  if (currentType !== EL_EMPTY) {
    processReactions(x, y, currentType)
  }
}

function processReactions(x: number, y: number, type: number) {
  if (!grid) return
  
  const elementName = ELEMENT_ID_TO_NAME[type]
  const myReactions = REACTIONS[elementName]
  if (!myReactions) return
  
  const dir = Math.floor(Math.random() * 4)
  let nx = x, ny = y
  
  if (dir === 0) ny--
  else if (dir === 1) ny++
  else if (dir === 2) nx--
  else nx++
  
  if (!grid.inBounds(nx, ny)) return
  
  const neighborType = grid.getType(nx, ny)
  if (neighborType === EL_EMPTY) return
  
  const neighborName = ELEMENT_ID_TO_NAME[neighborType]
  const reaction = myReactions[neighborName]
  if (!reaction) return
  
  if (Math.random() > reaction.chance) return
  
  applyReaction(x, y, nx, ny, reaction)
}

function applyReaction(srcX: number, srcY: number, targetX: number, targetY: number, reaction: Reaction) {
  if (!grid) return
  
  // Transform target
  if (reaction.targetBecomes === null) {
    removeParticle(targetX, targetY)
  } else {
    replaceParticle(targetX, targetY, reaction.targetBecomes)
  }
  
  // Transform source
  if (reaction.sourceBecomes !== undefined) {
    if (reaction.sourceBecomes === null) {
      removeParticle(srcX, srcY)
    } else {
      replaceParticle(srcX, srcY, reaction.sourceBecomes)
    }
  }
  
  // Spawn byproduct
  if (reaction.spawn) {
    if (grid.isEmpty(srcX, srcY - 1)) {
      addParticle(srcX, srcY - 1, reaction.spawn)
    } else if (grid.isEmpty(targetX, targetY - 1)) {
      addParticle(targetX, targetY - 1, reaction.spawn)
    }
  }
}

// ============================================
// TEMPERATURE
// ============================================

function processTemperatureGrid() {
  if (!grid) return
  
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      updateTemperature(x, y)
    }
  }
}

function updateTemperature(x: number, y: number) {
  if (!grid) return
  
  const myTemp = grid.getTemp(x, y)
  const type = grid.getType(x, y)
  
  if (type === EL_EMPTY) {
    const ambient = settings.ambientTemperature
    const diff = ambient - myTemp
    if (Math.abs(diff) > 0.5) {
      grid.setTemp(x, y, myTemp + diff * 0.02)
    }
  }
  
  const conductivity = type !== EL_EMPTY 
    ? ELEMENTS[ELEMENT_ID_TO_NAME[type]].heatConductivity 
    : 5
  
  if (conductivity === 0) return
  
  const dir = Math.floor(Math.random() * 4)
  let nx = x, ny = y
  if (dir === 0) ny--
  else if (dir === 1) ny++
  else if (dir === 2) nx--
  else nx++
  
  if (!grid.inBounds(nx, ny)) {
    const ambient = settings.ambientTemperature
    const diff = ambient - myTemp
    grid.setTemp(x, y, myTemp + diff * 0.02)
    return
  }
  
  const neighborTemp = grid.getTemp(nx, ny)
  const diff = neighborTemp - myTemp
  
  if (Math.abs(diff) < 0.5) return
  
  const transferRate = (conductivity / 100) * 0.5
  
  grid.setTemp(x, y, myTemp + diff * transferRate)
  grid.setTemp(nx, ny, neighborTemp - diff * transferRate)
  
  if (type !== EL_EMPTY) {
    checkPhaseChange(x, y, type, myTemp + diff * transferRate)
  }
}

function checkPhaseChange(x: number, y: number, type: number, temp: number) {
  if (!grid) return
  
  const props = ELEMENTS[ELEMENT_ID_TO_NAME[type]]
  if (!props.phaseChange) return
  
  if (props.phaseChange.high && temp > props.phaseChange.high.temp) {
    const newElement = ELEMENT_ID_TO_NAME[props.phaseChange.high.to]
    if (newElement) replaceParticle(x, y, newElement)
    return
  }
  
  if (props.phaseChange.low && temp < props.phaseChange.low.temp) {
    const newElement = ELEMENT_ID_TO_NAME[props.phaseChange.low.to]
    if (newElement) replaceParticle(x, y, newElement)
  }
}

// ============================================
// PARTICLE MANAGEMENT
// ============================================

function addParticle(x: number, y: number, element: ElementType): boolean {
  if (!grid) return false
  
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  
  if (!grid.inBounds(ix, iy)) return false
  if (grid.getType(ix, iy) !== EL_EMPTY) return false
  
  const seed = (ix * 7 + iy * 13 + frame) & 31
  const props = ELEMENTS[element]
  
  grid.setParticle(
    ix, iy,
    props.id,
    getColorWithVariation(element, seed),
    props.lifetime,
    props.defaultTemp
  )
  
  particleCount++
  return true
}

function addParticlesInRadius(cx: number, cy: number, radius: number, element: ElementType) {
  const r2 = radius * radius
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= r2) {
        addParticle(cx + dx, cy + dy, element)
      }
    }
  }
}

function removeParticle(x: number, y: number): boolean {
  if (!grid) return false
  
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  
  if (!grid.inBounds(ix, iy)) return false
  if (grid.getType(ix, iy) === EL_EMPTY) return false
  
  grid.clearCell(ix, iy)
  particleCount--
  return true
}

function removeParticlesInRadius(cx: number, cy: number, radius: number) {
  const r2 = radius * radius
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= r2) {
        removeParticle(cx + dx, cy + dy)
      }
    }
  }
}

function replaceParticle(x: number, y: number, element: ElementType) {
  if (!grid) return
  
  const seed = (x * 7 + y * 13 + frame) & 31
  const props = ELEMENTS[element]
  
  grid.setParticle(
    x, y,
    props.id,
    getColorWithVariation(element, seed),
    props.lifetime,
    props.defaultTemp
  )
}

function clear() {
  if (!grid) return
  grid.clear()
  particleCount = 0
  frame = 0
}
