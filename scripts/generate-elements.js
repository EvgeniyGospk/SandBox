#!/usr/bin/env node
/**
 * Phase 1: Data-Driven Code Generation Pipeline
 * 
 * Reads definitions/elements.json and definitions/reactions.json
 * Generates:
 * - packages/engine/src/domain/generated_elements.rs (Elements + Flags + Reactions LUT)
 * - apps/web/src/core/engine/generated_elements.ts (TypeScript)
 * 
 * Usage:
 *   node scripts/generate-elements.js
 *   npm run codegen
 */

const fs = require('fs');
const path = require('path');

// Paths
const ROOT = path.resolve(__dirname, '..');
const ELEMENTS_PATH = path.join(ROOT, 'definitions', 'elements.json');
const REACTIONS_PATH = path.join(ROOT, 'definitions', 'reactions.json');
const ELEMENTS_SCHEMA_PATH = path.join(ROOT, 'definitions', 'elements.schema.json');
const REACTIONS_SCHEMA_PATH = path.join(ROOT, 'definitions', 'reactions.schema.json');
const RUST_OUTPUT = path.join(ROOT, 'packages', 'engine', 'src', 'domain', 'generated_elements.rs');
const TS_OUTPUT = path.join(ROOT, 'apps', 'web', 'src', 'core', 'engine', 'generated_elements.ts');

const Ajv = require('ajv');

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function validateWithSchema(data, schemaPath, label) {
  if (!fs.existsSync(schemaPath)) {
    fail(`${label}: schema file not found: ${schemaPath}`);
  }

  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv({ allErrors: true, jsonPointers: true });
  const validate = ajv.compile(schema);

  const ok = validate(data);
  if (!ok) {
    console.error(`\n❌ ${label}: schema validation failed`);
    for (const err of validate.errors || []) {
      const path = err.dataPath || '(root)';
      console.error(`   - ${path}: ${err.message}`);
    }
    process.exit(1);
  }
}

// Load definitions
console.log('📖 Reading elements from:', ELEMENTS_PATH);
const elementsData = JSON.parse(fs.readFileSync(ELEMENTS_PATH, 'utf8'));

console.log('📖 Reading reactions from:', REACTIONS_PATH);
const reactionsData = JSON.parse(fs.readFileSync(REACTIONS_PATH, 'utf8'));

validateWithSchema(elementsData, ELEMENTS_SCHEMA_PATH, 'definitions/elements.json');
validateWithSchema(reactionsData, REACTIONS_SCHEMA_PATH, 'definitions/reactions.json');

const {
  categories,
  elements,
  flags: flagDefs,
  physics: physicsConfig,
  uiCategories = [],
} = elementsData;
const { reactions } = reactionsData;

// Guardrails
assert(Array.isArray(elements), `definitions/elements.json: 'elements' must be an array`);
assert(elements.length <= 256, `definitions/elements.json: element count ${elements.length} exceeds 256 (ElementId is u8)`);

const requiredFlagKeys = [
  'FLAG_SOLID',
  'FLAG_POWDER',
  'FLAG_LIQUID',
  'FLAG_GAS',
  'FLAG_ENERGY',
  'FLAG_UTILITY',
  'FLAG_BIO',
  'FLAG_FLAMMABLE',
  'FLAG_CONDUCTIVE',
  'FLAG_IGNORE_GRAVITY',
  'FLAG_CORROSIVE',
  'FLAG_HOT',
  'FLAG_COLD',
  'FLAG_RIGID',
];
for (const k of requiredFlagKeys) {
  assert(typeof flagDefs?.[k] === 'number', `definitions/elements.json: flags.${k} must be a number`);
}

const categoryNames = new Set(categories.map((c) => c.name));
const uiCategoryKeys = new Set(uiCategories.map((c) => c.key));
assert(uiCategoryKeys.size === uiCategories.length, `definitions/elements.json: uiCategories[].key must be unique`);

const elementNameSet = new Set();
const elementRustNameSet = new Set();
const elementIdSet = new Set();

for (let i = 0; i < elements.length; i++) {
  const el = elements[i];

  assert(Number.isInteger(el.id), `definitions/elements.json: elements[${i}].id must be an integer`);
  assert(el.id >= 0 && el.id <= 255, `definitions/elements.json: elements[${i}].id must be in [0..255]`);
  assert(el.id === i, `definitions/elements.json: elements must be sorted and contiguous by id (expected id ${i} at index ${i}, got ${el.id})`);
  assert(!elementIdSet.has(el.id), `definitions/elements.json: duplicate element id ${el.id}`);
  elementIdSet.add(el.id);

  assert(typeof el.name === 'string' && el.name.length > 0, `definitions/elements.json: elements[${i}].name must be a string`);
  assert(!elementNameSet.has(el.name), `definitions/elements.json: duplicate element name '${el.name}'`);
  elementNameSet.add(el.name);

  assert(typeof el.rustName === 'string' && el.rustName.length > 0, `definitions/elements.json: elements[${i}].rustName must be a string`);
  assert(!elementRustNameSet.has(el.rustName), `definitions/elements.json: duplicate element rustName '${el.rustName}'`);
  elementRustNameSet.add(el.rustName);

  assert(categoryNames.has(el.category), `definitions/elements.json: elements[${i}].category '${el.category}' is not in categories[]`);

  if (el.ui) {
    assert(uiCategoryKeys.has(el.ui.category), `definitions/elements.json: elements[${i}].ui.category '${el.ui.category}' is not in uiCategories[]`);
  }

  if (el.category === 'utility') {
    assert(el.ignoreGravity === true, `definitions/elements.json: elements[${i}] '${el.name}' is category=utility and must set ignoreGravity=true`);
  }
  if (el.density === 'Infinity') {
    assert(el.ignoreGravity === true, `definitions/elements.json: elements[${i}] '${el.name}' has density='Infinity' and must set ignoreGravity=true`);
  }
}

assert(elements[0]?.name === 'empty', `definitions/elements.json: elements[0] must be 'empty'`);
assert(elements[0]?.rustName === 'EL_EMPTY', `definitions/elements.json: elements[0].rustName must be 'EL_EMPTY'`);

// Strict reference validation for phase changes
for (let i = 0; i < elements.length; i++) {
  const el = elements[i];
  const pc = el.phaseChange;

  if (pc?.high?.to !== undefined) {
    assert(typeof pc.high.to === 'string', `definitions/elements.json: elements[${i}].phaseChange.high.to must be a string`);
    assert(typeof pc.high.temp === 'number' && Number.isFinite(pc.high.temp), `definitions/elements.json: elements[${i}].phaseChange.high.temp must be a number`);
    assert(elementNameSet.has(pc.high.to), `definitions/elements.json: elements[${i}] '${el.name}' phaseChange.high.to refers to unknown element '${pc.high.to}'`);
  }

  if (pc?.low?.to !== undefined) {
    assert(typeof pc.low.to === 'string', `definitions/elements.json: elements[${i}].phaseChange.low.to must be a string`);
    assert(typeof pc.low.temp === 'number' && Number.isFinite(pc.low.temp), `definitions/elements.json: elements[${i}].phaseChange.low.temp must be a number`);
    assert(elementNameSet.has(pc.low.to), `definitions/elements.json: elements[${i}] '${el.name}' phaseChange.low.to refers to unknown element '${pc.low.to}'`);
  }
}

// Strict reference validation for reactions
assert(Array.isArray(reactions), `definitions/reactions.json: 'reactions' must be an array`);
const reactionIdSet = new Set();
const reactionPairSet = new Set();
for (let i = 0; i < reactions.length; i++) {
  const r = reactions[i];
  assert(typeof r.id === 'string' && r.id.length > 0, `definitions/reactions.json: reactions[${i}].id must be a string`);
  assert(!reactionIdSet.has(r.id), `definitions/reactions.json: duplicate reaction id '${r.id}'`);
  reactionIdSet.add(r.id);

  assert(elementNameSet.has(r.aggressor), `definitions/reactions.json: reactions[${i}] '${r.id}' aggressor '${r.aggressor}' not found in elements`);
  assert(elementNameSet.has(r.victim), `definitions/reactions.json: reactions[${i}] '${r.id}' victim '${r.victim}' not found in elements`);

  const pairKey = `${r.aggressor}::${r.victim}`;
  assert(!reactionPairSet.has(pairKey), `definitions/reactions.json: duplicate reaction pair ${pairKey}`);
  reactionPairSet.add(pairKey);

  if (r.result_aggressor !== null) {
    assert(elementNameSet.has(r.result_aggressor), `definitions/reactions.json: reactions[${i}] '${r.id}' result_aggressor '${r.result_aggressor}' not found in elements`);
  }
  if (r.result_victim !== null) {
    assert(elementNameSet.has(r.result_victim), `definitions/reactions.json: reactions[${i}] '${r.id}' result_victim '${r.result_victim}' not found in elements`);
  }
  if (r.spawn !== null) {
    assert(elementNameSet.has(r.spawn), `definitions/reactions.json: reactions[${i}] '${r.id}' spawn '${r.spawn}' not found in elements`);
  }

  assert(typeof r.chance === 'number' && Number.isFinite(r.chance), `definitions/reactions.json: reactions[${i}] '${r.id}' chance must be a number`);
  assert(r.chance >= 0 && r.chance <= 1, `definitions/reactions.json: reactions[${i}] '${r.id}' chance must be in [0..1]`);
}

// Build name->id map for reactions
const nameToId = {};
const nameToRustName = {};
for (const el of elements) {
  nameToId[el.name] = el.id;
  nameToRustName[el.name] = el.rustName;
}

// Phase 2: Default physics properties by category
const defaultPhysics = {
  solid:   { bounce: 0.0, friction: 0.0 },   // Static, no movement
  powder:  { bounce: 0.2, friction: 0.9 },   // Bounces slightly, high friction
  liquid:  { bounce: 0.0, friction: 0.95 },  // No bounce, low friction
  gas:     { bounce: 0.0, friction: 0.99 },  // Almost no friction
  energy:  { bounce: 0.0, friction: 1.0 },   // No physics
  utility: { bounce: 0.0, friction: 1.0 },   // No physics
  bio:     { bounce: 0.1, friction: 0.85 },  // Slight bounce
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert a number to Rust f32 literal (always with .0 suffix)
 */
function toRustFloat(value) {
  if (typeof value !== 'number') return String(value);
  // If it's already a float (has decimal), return as-is
  if (String(value).includes('.')) return String(value);
  // Add .0 for integers to make them f32
  return `${value}.0`;
}

/**
 * Compute flags bitmask for an element based on its properties
 */
function computeFlags(el) {
  let flags = 0;
  
  // Category flags
  switch (el.category) {
    case 'solid':   flags |= flagDefs.FLAG_SOLID; break;
    case 'powder':  flags |= flagDefs.FLAG_POWDER; break;
    case 'liquid':  flags |= flagDefs.FLAG_LIQUID; break;
    case 'gas':     flags |= flagDefs.FLAG_GAS; break;
    case 'energy':  flags |= flagDefs.FLAG_ENERGY; break;
    case 'utility': flags |= flagDefs.FLAG_UTILITY; break;
    case 'bio':     flags |= flagDefs.FLAG_BIO; break;
  }
  
  // Property flags
  if (el.flammable) flags |= flagDefs.FLAG_FLAMMABLE;
  if (el.conductive) flags |= flagDefs.FLAG_CONDUCTIVE;
  if (el.corrosive) flags |= flagDefs.FLAG_CORROSIVE;
  if (el.hot) flags |= flagDefs.FLAG_HOT;
  if (el.cold) flags |= flagDefs.FLAG_COLD;
  if (el.ignoreGravity) flags |= flagDefs.FLAG_IGNORE_GRAVITY;
  if (el.rigid) flags |= flagDefs.FLAG_RIGID;
  
  return flags;
}

/**
 * Build reaction LUT index: (aggressor_id << 8) | victim_id
 */
function reactionIndex(aggId, vicId) {
  return (aggId << 8) | vicId;
}

// ============================================================================
// RUST CODE GENERATION
// ============================================================================

function generateRust() {
  const lines = [];

  const behaviorKindSet = new Set(
    elements
      .map((e) => e.behaviorKind)
      .filter((v) => typeof v === 'string' && v.length > 0)
  );

  const behaviorKinds = ['none', ...Array.from(behaviorKindSet).sort()];

  function toRustEnumVariant(name) {
    return name
      .split(/[_\-\s]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('');
  }
  
  lines.push(`//! Generated Element Definitions - DO NOT EDIT MANUALLY!`);
  lines.push(`//!`);
  lines.push(`//! Phase 1: Data-Driven Core`);
  lines.push(`//! This file is auto-generated by scripts/generate-elements.js`);
  lines.push(`//! Sources: definitions/elements.json, definitions/reactions.json`);
  lines.push(`//!`);
  lines.push(`//! To add a new element or reaction: edit JSON files and run 'npm run codegen'`);
  lines.push(``);
  lines.push(`use wasm_bindgen::prelude::*;`);
  lines.push(``);
  lines.push(`/// Element ID as u8 for compact storage`);
  lines.push(`pub type ElementId = u8;`);
  lines.push(``);
  
  // Element constants
  lines.push(`// ============================================================================`);
  lines.push(`// ELEMENT CONSTANTS`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  
  for (const el of elements) {
    lines.push(`pub const ${el.rustName}: ElementId = ${el.id};`);
  }
  lines.push(`pub const ELEMENT_COUNT: usize = ${elements.length};`);
  lines.push(``);
  
  // Category constants
  lines.push(`// ============================================================================`);
  lines.push(`// CATEGORY CONSTANTS`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`pub type CategoryId = u8;`);
  
  for (const cat of categories) {
    lines.push(`pub const ${cat.rustName}: CategoryId = ${cat.id};`);
  }
  lines.push(``);
  
  // Flag constants
  lines.push(`// ============================================================================`);
  lines.push(`// ELEMENT FLAGS (BitMask) - Phase 1 Data-Driven`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`pub type ElementFlags = u32;`);
  lines.push(``);
  for (const [name, value] of Object.entries(flagDefs)) {
    lines.push(`pub const ${name}: ElementFlags = ${value};`);
  }
  lines.push(``);

  // Behavior kind mapping (element-level dispatch)
  lines.push(`// ============================================================================`);
  lines.push(`// BEHAVIOR KIND (Element-level dispatch)`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`#[repr(u8)]`);
  lines.push(`#[derive(Clone, Copy, Debug, PartialEq, Eq)]`);
  lines.push(`pub enum BehaviorKind {`);
  for (let i = 0; i < behaviorKinds.length; i++) {
    const k = behaviorKinds[i];
    const variant = k === 'none' ? 'None' : toRustEnumVariant(k);
    lines.push(`    ${variant} = ${i},`);
  }
  lines.push(`}`);
  lines.push(``);

  lines.push(`pub const BEHAVIOR_KIND_BY_ID: [BehaviorKind; ELEMENT_COUNT] = [`);
  for (const el of elements) {
    const k = el.behaviorKind;
    const variant = k ? toRustEnumVariant(k) : 'None';
    lines.push(`    BehaviorKind::${variant}, // ${el.id}: ${el.name}`);
  }
  lines.push(`];`);
  lines.push(``);
  
  // Phase 2: Physics constants
  lines.push(`// ============================================================================`);
  lines.push(`// PHYSICS CONSTANTS - Phase 2 Newtonian Physics`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`pub const GRAVITY: f32 = ${toRustFloat(physicsConfig?.gravity || 0.5)};`);
  lines.push(`pub const AIR_FRICTION: f32 = ${toRustFloat(physicsConfig?.airFriction || 0.98)};`);
  lines.push(`pub const MAX_VELOCITY: f32 = ${toRustFloat(physicsConfig?.maxVelocity || 10.0)};`);
  lines.push(``);
  
  // Inline flag check macros (as functions)
  lines.push(`/// Check if element has flag (branchless)`);
  lines.push(`#[inline(always)]`);
  lines.push(`pub fn has_flag(flags: ElementFlags, flag: ElementFlags) -> bool {`);
  lines.push(`    (flags & flag) != 0`);
  lines.push(`}`);
  lines.push(``);
  
  // ElementProps struct with flags
  lines.push(`// ============================================================================`);
  lines.push(`// ELEMENT PROPERTIES`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`/// Element properties struct - Phase 2: includes physics (bounce, friction)`);
  lines.push(`#[derive(Clone, Copy)]`);
  lines.push(`pub struct ElementProps {`);
  lines.push(`    pub color: u32,`);
  lines.push(`    pub density: f32,`);
  lines.push(`    pub category: CategoryId,`);
  lines.push(`    pub flags: ElementFlags,`);
  lines.push(`    pub dispersion: u8,`);
  lines.push(`    pub lifetime: u16,`);
  lines.push(`    pub default_temp: f32,`);
  lines.push(`    pub heat_conductivity: u8,`);
  lines.push(`    // Phase 2: Newtonian Physics`);
  lines.push(`    pub bounce: f32,      // Collision bounce factor (0.0 = no bounce, 1.0 = full bounce)`);
  lines.push(`    pub friction: f32,    // Velocity decay per frame (1.0 = no decay, 0.0 = instant stop)`);
  lines.push(`}`);
  lines.push(``);
  
  // Convenience methods for backward compatibility
  lines.push(`impl ElementProps {`);
  lines.push(`    #[inline(always)]`);
  lines.push(`    pub fn flammable(&self) -> bool { has_flag(self.flags, FLAG_FLAMMABLE) }`);
  lines.push(`    #[inline(always)]`);
  lines.push(`    pub fn conductive(&self) -> bool { has_flag(self.flags, FLAG_CONDUCTIVE) }`);
  lines.push(`    #[inline(always)]`);
  lines.push(`    pub fn is_liquid(&self) -> bool { has_flag(self.flags, FLAG_LIQUID) }`);
  lines.push(`    #[inline(always)]`);
  lines.push(`    pub fn is_gas(&self) -> bool { has_flag(self.flags, FLAG_GAS) }`);
  lines.push(`    #[inline(always)]`);
  lines.push(`    pub fn is_solid(&self) -> bool { has_flag(self.flags, FLAG_SOLID) }`);
  lines.push(`    #[inline(always)]`);
  lines.push(`    pub fn is_powder(&self) -> bool { has_flag(self.flags, FLAG_POWDER) }`);
  lines.push(`    #[inline(always)]`);
  lines.push(`    pub fn ignores_gravity(&self) -> bool { has_flag(self.flags, FLAG_IGNORE_GRAVITY) }`);
  lines.push(`}`);
  lines.push(``);
  
  // Element data array with computed flags
  lines.push(`/// Static element data - indexed by ElementId`);
  lines.push(`pub static ELEMENT_DATA: [ElementProps; ELEMENT_COUNT] = [`);
  
  for (const el of elements) {
    const catConst = categories.find(c => c.name === el.category)?.rustName || 'CAT_SOLID';
    const density = el.density === 'Infinity' ? 'f32::INFINITY' : toRustFloat(el.density);
    const defaultTemp = toRustFloat(el.defaultTemp);
    const flags = computeFlags(el);
    
    // Phase 2: Get physics from element or use category defaults
    const catPhysics = defaultPhysics[el.category] || { bounce: 0.0, friction: 1.0 };
    const bounce = el.bounce !== undefined ? el.bounce : catPhysics.bounce;
    const friction = el.friction !== undefined ? el.friction : catPhysics.friction;
    
    lines.push(`    // ${el.id}: ${el.name.charAt(0).toUpperCase() + el.name.slice(1)}`);
    lines.push(`    ElementProps {`);
    lines.push(`        color: ${el.color},`);
    lines.push(`        density: ${density},`);
    lines.push(`        category: ${catConst},`);
    lines.push(`        flags: ${flags}, // 0x${flags.toString(16).padStart(4, '0')}`);
    lines.push(`        dispersion: ${el.dispersion},`);
    lines.push(`        lifetime: ${el.lifetime},`);
    lines.push(`        default_temp: ${defaultTemp},`);
    lines.push(`        heat_conductivity: ${el.heatConductivity},`);
    lines.push(`        bounce: ${toRustFloat(bounce)},`);
    lines.push(`        friction: ${toRustFloat(friction)},`);
    lines.push(`    },`);
  }
  
  lines.push(`];`);
  lines.push(``);

  // Phase changes (generated from definitions)
  lines.push(`// ============================================================================`);
  lines.push(`// PHASE CHANGES - Data-driven`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`#[derive(Clone, Copy)]`);
  lines.push(`pub struct PhaseChange {`);
  lines.push(`    pub high: Option<(f32, ElementId)>,`);
  lines.push(`    pub low: Option<(f32, ElementId)>,`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`pub const PHASE_CHANGES: [PhaseChange; ELEMENT_COUNT] = [`);
  for (const el of elements) {
    const pc = el.phaseChange;

    let high = 'None';
    if (pc?.high?.to) {
      const toRust = nameToRustName[pc.high.to];
      if (!toRust) {
        console.warn(`⚠️ Unknown phaseChange.high.to element: ${pc.high.to} (from ${el.name})`);
      } else {
        high = `Some((${toRustFloat(pc.high.temp)}, ${toRust}))`;
      }
    }

    let low = 'None';
    if (pc?.low?.to) {
      const toRust = nameToRustName[pc.low.to];
      if (!toRust) {
        console.warn(`⚠️ Unknown phaseChange.low.to element: ${pc.low.to} (from ${el.name})`);
      } else {
        low = `Some((${toRustFloat(pc.low.temp)}, ${toRust}))`;
      }
    }

    lines.push(`    // ${el.id}: ${el.name}`);
    lines.push(`    PhaseChange { high: ${high}, low: ${low} },`);
  }
  lines.push(`];`);
  lines.push(``);

  lines.push(`/// Get phase change for element at given temperature`);
  lines.push(`/// Returns new element if phase change occurs, None otherwise`);
  lines.push(`#[inline]`);
  lines.push(`pub fn check_phase_change(element: ElementId, temp: f32) -> Option<ElementId> {`);
  lines.push(`    let idx = element as usize;`);
  lines.push(`    if idx >= ELEMENT_COUNT { return None; }`);
  lines.push(`    let pc = PHASE_CHANGES[idx];`);
  lines.push(`    // Check high temp (melting/boiling)`);
  lines.push(`    if let Some((threshold, new_el)) = pc.high {`);
  lines.push(`        if temp > threshold { return Some(new_el); }`);
  lines.push(`    }`);
  lines.push(`    // Check low temp (freezing/condensing)`);
  lines.push(`    if let Some((threshold, new_el)) = pc.low {`);
  lines.push(`        if temp < threshold { return Some(new_el); }`);
  lines.push(`    }`);
  lines.push(`    None`);
  lines.push(`}`);
  lines.push(``);
  
  // Reaction LUT
  lines.push(`// ============================================================================`);
  lines.push(`// REACTION LOOKUP TABLE (LUT) - O(1) Access`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`/// Reaction result from LUT`);
  lines.push(`#[derive(Clone, Copy, Debug)]`);
  lines.push(`pub struct Reaction {`);
  lines.push(`    /// What victim becomes (EL_EMPTY = destroyed)`);
  lines.push(`    pub target_becomes: ElementId,`);
  lines.push(`    /// What aggressor becomes (255 = unchanged, EL_EMPTY = destroyed)`);
  lines.push(`    pub source_becomes: u8,`);
  lines.push(`    /// Probability 0-255 (255 = 100%)`);
  lines.push(`    pub chance: u8,`);
  lines.push(`    /// Spawn byproduct (EL_EMPTY = none)`);
  lines.push(`    pub spawn: ElementId,`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`impl Reaction {`);
  lines.push(`    pub const NO_CHANGE: u8 = 255;`);
  lines.push(`}`);
  lines.push(``);
  
  // Generate LUT entries
  lines.push(`/// Reaction LUT size: 256 * 256 = 65536 entries`);
  lines.push(`pub const REACTION_LUT_SIZE: usize = 65536;`);
  lines.push(``);
  
  // Build sparse reaction data
  const reactionEntries = [];
  for (const r of reactions) {
    const aggId = nameToId[r.aggressor];
    const vicId = nameToId[r.victim];
    if (aggId === undefined || vicId === undefined) {
      console.warn(`⚠️ Unknown element in reaction: ${r.aggressor} -> ${r.victim}`);
      continue;
    }
    
    const resultAgg = r.result_aggressor === null ? 255 : 
                      (nameToId[r.result_aggressor] ?? 255);
    const resultVic = r.result_victim === null ? 0 :
                      (nameToId[r.result_victim] ?? 0);
    const spawn = r.spawn === null ? 0 : (nameToId[r.spawn] ?? 0);
    const chance = Math.round(r.chance * 255);
    const idx = reactionIndex(aggId, vicId);
    
    reactionEntries.push({ idx, resultAgg, resultVic, chance, spawn, id: r.id });
  }
  
  // Sort by index for predictable output
  reactionEntries.sort((a, b) => a.idx - b.idx);
  
  lines.push(`/// Reaction LUT initialization data (sparse): (index, reaction)`);
  lines.push(`pub static REACTION_INIT_DATA: [(usize, Reaction); ${reactionEntries.length}] = [`);
  for (const r of reactionEntries) {
    lines.push(`    (${r.idx}, Reaction { target_becomes: ${r.resultVic}, source_becomes: ${r.resultAgg}, chance: ${r.chance}, spawn: ${r.spawn} }), // ${r.id}`);
  }
  lines.push(`];`);
  lines.push(``);
  
  // ReactionSystem struct
  lines.push(`/// Reaction System with O(1) lookup`);
  lines.push(`pub struct ReactionSystem {`);
  lines.push(`    lut: [Option<Reaction>; REACTION_LUT_SIZE],`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`impl ReactionSystem {`);
  lines.push(`    /// Create new reaction system from init data`);
  lines.push(`    pub fn new() -> Self {`);
  lines.push(`        // Initialize with None`);
  lines.push(`        let mut lut = [None; REACTION_LUT_SIZE];`);
  lines.push(`        `);
  lines.push(`        // Populate from generated data`);
  lines.push(`        for (idx, reaction) in REACTION_INIT_DATA.iter() {`);
  lines.push(`            lut[*idx] = Some(*reaction);`);
  lines.push(`        }`);
  lines.push(`        `);
  lines.push(`        Self { lut }`);
  lines.push(`    }`);
  lines.push(`    `);
  lines.push(`    /// O(1) reaction lookup - FAST!`);
  lines.push(`    #[inline(always)]`);
  lines.push(`    pub fn get(&self, aggressor: ElementId, victim: ElementId) -> Option<&Reaction> {`);
  lines.push(`        let idx = ((aggressor as usize) << 8) | (victim as usize);`);
  lines.push(`        // SAFETY: idx is always < 65536 since both IDs are u8`);
  lines.push(`        #[cfg(not(debug_assertions))]`);
  lines.push(`        unsafe { self.lut.get_unchecked(idx).as_ref() }`);
  lines.push(`        #[cfg(debug_assertions)]`);
  lines.push(`        self.lut[idx].as_ref()`);
  lines.push(`    }`);
  lines.push(`}`);
  lines.push(``);
  
  // Helper functions
  lines.push(`/// Get element properties by ID`);
  lines.push(`#[inline]`);
  lines.push(`pub fn get_props(id: ElementId) -> &'static ElementProps {`);
  lines.push(`    &ELEMENT_DATA[id as usize]`);
  lines.push(`}`);
  lines.push(``);
  
  // Color with variation function
  lines.push(`/// Get color with variation - EXACT TypeScript algorithm`);
  lines.push(`/// Returns ABGR format for direct copy to Canvas ImageData`);
  lines.push(`pub fn get_color_with_variation(id: ElementId, seed: u8) -> u32 {`);
  lines.push(`    let base = ELEMENT_DATA[id as usize].color;`);
  lines.push(`    let i = (seed & 31) as i32;`);
  lines.push(`    let variation = (i - 16) * 2;`);
  lines.push(`    `);
  lines.push(`    let a = (base >> 24) & 0xFF;`);
  lines.push(`    let r = (((base >> 16) & 0xFF) as i32 + variation).clamp(0, 255) as u32;`);
  lines.push(`    let g = (((base >> 8) & 0xFF) as i32 + variation).clamp(0, 255) as u32;`);
  lines.push(`    let b = ((base & 0xFF) as i32 + variation).clamp(0, 255) as u32;`);
  lines.push(`    `);
  lines.push(`    (a << 24) | (b << 16) | (g << 8) | r`);
  lines.push(`}`);
  lines.push(``);
  
  // ElementType enum for JS compatibility
  lines.push(`// ============================================================================`);
  lines.push(`// ELEMENT TYPE ENUM (for JS compatibility)`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`#[wasm_bindgen]`);
  lines.push(`#[repr(u8)]`);
  lines.push(`#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]`);
  lines.push(`pub enum ElementType {`);
  
  for (const el of elements) {
    const enumName = el.name.charAt(0).toUpperCase() + el.name.slice(1);
    lines.push(`    ${enumName} = ${el.id},`);
  }
  
  lines.push(`}`);
  lines.push(``);
  lines.push(`impl ElementType {`);
  lines.push(`    pub fn to_id(self) -> ElementId {`);
  lines.push(`        self as ElementId`);
  lines.push(`    }`);
  lines.push(`    `);
  lines.push(`    pub fn props(self) -> &'static ElementProps {`);
  lines.push(`        get_props(self as ElementId)`);
  lines.push(`    }`);
  lines.push(`}`);
  lines.push(``);
  
  return lines.join('\n');
}

// ============================================================================
// TYPESCRIPT CODE GENERATION
// ============================================================================

function generateTypeScript() {
  const lines = [];
  
  lines.push(`/**`);
  lines.push(` * Generated Element Definitions - DO NOT EDIT MANUALLY!`);
  lines.push(` *`);
  lines.push(` * This file is auto-generated by scripts/generate-elements.js`);
  lines.push(` * Source: definitions/elements.json`);
  lines.push(` *`);
  lines.push(` * To add a new element: edit definitions/elements.json and run 'npm run codegen'`);
  lines.push(` */`);
  lines.push(``);
  
  // Element ID constants
  lines.push(`// ============================================================================`);
  lines.push(`// ELEMENT ID CONSTANTS`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  
  for (const el of elements) {
    lines.push(`export const ${el.rustName} = ${el.id}`);
  }
  lines.push(`export const ELEMENT_COUNT = ${elements.length}`);
  lines.push(``);
  
  // Category constants
  lines.push(`// ============================================================================`);
  lines.push(`// CATEGORY CONSTANTS`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  
  for (const cat of categories) {
    lines.push(`export const ${cat.rustName} = ${cat.id}`);
  }
  lines.push(``);

  // UI category definitions (palette grouping)
  lines.push(`// ============================================================================`);
  lines.push(`// UI CATEGORY DEFINITIONS`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`export interface UiCategoryDef {`);
  lines.push(`  key: string`);
  lines.push(`  label: string`);
  lines.push(`  sort: number`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`export const UI_CATEGORIES: UiCategoryDef[] = [`);
  for (const c of uiCategories) {
    lines.push(`  { key: ${JSON.stringify(c.key)}, label: ${JSON.stringify(c.label)}, sort: ${c.sort} },`);
  }
  lines.push(`]`);
  lines.push(``);
  
  // Type definitions
  lines.push(`// ============================================================================`);
  lines.push(`// TYPE DEFINITIONS`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`export type ElementId = number`);
  lines.push(`export type CategoryId = number`);
  lines.push(``);
  
  // ElementType union
  const elementNames = elements.map(e => `'${e.name}'`).join(' | ');
  lines.push(`export type ElementType = ${elementNames}`);
  lines.push(``);
  
  // CategoryType union
  const categoryNames = categories.map(c => `'${c.name}'`).join(' | ');
  lines.push(`export type CategoryType = ${categoryNames}`);
  lines.push(``);
  
  // Name to ID mapping
  lines.push(`// ============================================================================`);
  lines.push(`// MAPPINGS`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`export const ELEMENT_NAME_TO_ID: Record<ElementType, ElementId> = {`);
  for (const el of elements) {
    lines.push(`  ${el.name}: ${el.rustName},`);
  }
  lines.push(`}`);
  lines.push(``);
  
  // ID to name array
  lines.push(`export const ELEMENT_ID_TO_NAME: ElementType[] = [`);
  for (const el of elements) {
    lines.push(`  '${el.name}',`);
  }
  lines.push(`]`);
  lines.push(``);
  
  // Category name to ID
  lines.push(`export const CATEGORY_NAME_TO_ID: Record<CategoryType, CategoryId> = {`);
  for (const cat of categories) {
    lines.push(`  ${cat.name}: ${cat.rustName},`);
  }
  lines.push(`}`);
  lines.push(``);
  
  // Element properties interface
  lines.push(`// ============================================================================`);
  lines.push(`// ELEMENT PROPERTIES`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  // Flag constants
  lines.push(`// ============================================================================`);
  lines.push(`// ELEMENT FLAGS - Phase 1 Data-Driven`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  for (const [name, value] of Object.entries(flagDefs)) {
    lines.push(`export const ${name} = ${value}`);
  }
  lines.push(``);
  lines.push(`export type ElementFlags = number`);
  lines.push(``);
  lines.push(`export function hasFlag(flags: ElementFlags, flag: ElementFlags): boolean {`);
  lines.push(`  return (flags & flag) !== 0`);
  lines.push(`}`);
  lines.push(``);
  
  lines.push(`export interface ElementProps {`);
  lines.push(`  id: ElementId`);
  lines.push(`  name: ElementType`);
  lines.push(`  category: CategoryId`);
  lines.push(`  flags: ElementFlags`);
  lines.push(`  color: number`);
  lines.push(`  density: number`);
  lines.push(`  dispersion: number`);
  lines.push(`  lifetime: number`);
  lines.push(`  defaultTemp: number`);
  lines.push(`  heatConductivity: number`);
  lines.push(`  hidden?: boolean`);
  lines.push(`  ui?: { category: string; displayName: string; description: string; sort: number; hidden?: boolean }`);
  lines.push(`}`);
  lines.push(``);
  
  // Element data array with flags
  lines.push(`export const ELEMENT_DATA: ElementProps[] = [`);
  
  for (const el of elements) {
    const catConst = categories.find(c => c.name === el.category)?.rustName || 'CAT_SOLID';
    const density = el.density === 'Infinity' ? 'Infinity' : el.density;
    const flags = computeFlags(el);
    const hiddenStr = el.hidden ? `, hidden: true` : '';

    let uiLines = [];
    if (el.ui) {
      const ui = el.ui;
      const uiHiddenStr = ui.hidden ? `, hidden: true` : '';
      uiLines = [
        `    ui: { category: ${JSON.stringify(ui.category)}, displayName: ${JSON.stringify(ui.displayName)}, description: ${JSON.stringify(ui.description)}, sort: ${ui.sort}${uiHiddenStr} },`,
      ];
    }
    
    lines.push(`  {`);
    lines.push(`    id: ${el.rustName},`);
    lines.push(`    name: '${el.name}',`);
    lines.push(`    category: ${catConst},`);
    lines.push(`    flags: ${flags},`);
    lines.push(`    color: ${el.color},`);
    lines.push(`    density: ${density},`);
    lines.push(`    dispersion: ${el.dispersion},`);
    lines.push(`    lifetime: ${el.lifetime},`);
    lines.push(`    defaultTemp: ${el.defaultTemp},`);
    lines.push(`    heatConductivity: ${el.heatConductivity}${hiddenStr},`);
    for (const l of uiLines) lines.push(l);
    lines.push(`  },`);
  }
  
  lines.push(`]`);
  lines.push(``);
  
  // Reaction interface for TypeScript
  lines.push(`// ============================================================================`);
  lines.push(`// REACTIONS - Phase 1 Data-Driven`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`export interface Reaction {`);
  lines.push(`  aggressor: ElementType`);
  lines.push(`  victim: ElementType`);
  lines.push(`  resultAggressor: ElementType | null`);
  lines.push(`  resultVictim: ElementType | null`);
  lines.push(`  chance: number`);
  lines.push(`  spawn: ElementType | null`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`export const REACTIONS: Reaction[] = [`);
  for (const r of reactions) {
    const resAgg = r.result_aggressor ? `'${r.result_aggressor}'` : 'null';
    const resVic = r.result_victim ? `'${r.result_victim}'` : 'null';
    const spawn = r.spawn ? `'${r.spawn}'` : 'null';
    lines.push(`  { aggressor: '${r.aggressor}', victim: '${r.victim}', resultAggressor: ${resAgg}, resultVictim: ${resVic}, chance: ${r.chance}, spawn: ${spawn} },`);
  }
  lines.push(`]`);
  lines.push(``);
  
  // UI helper - get visible elements for the palette
  lines.push(`// ============================================================================`);
  lines.push(`// UI HELPERS`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`/** Get elements visible in the UI palette (excludes 'empty') */`);
  lines.push(`export const VISIBLE_ELEMENTS = ELEMENT_DATA.filter(e => !e.hidden)`);
  lines.push(``);
  lines.push(`/** Get elements by category for UI grouping */`);
  lines.push(`export function getElementsByCategory(category: CategoryType): ElementProps[] {`);
  lines.push(`  const catId = CATEGORY_NAME_TO_ID[category]`);
  lines.push(`  return ELEMENT_DATA.filter(e => e.category === catId && !e.hidden)`);
  lines.push(`}`);
  lines.push(``);
  
  return lines.join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log(`\n🔧 Phase 1: Data-Driven Code Generation Pipeline\n`);
  console.log(`   Elements:   ${ELEMENTS_PATH}`);
  console.log(`   Reactions:  ${REACTIONS_PATH}`);
  console.log(`   Elements:   ${elements.length}`);
  console.log(`   Categories: ${categories.length}`);
  console.log(`   Reactions:  ${reactions.length}`);
  console.log(`   Flags:      ${Object.keys(flagDefs).length}\n`);
  
  // Generate Rust
  console.log('🦀 Generating Rust code (elements + flags + reactions LUT)...');
  const rustCode = generateRust();
  fs.mkdirSync(path.dirname(RUST_OUTPUT), { recursive: true });
  fs.writeFileSync(RUST_OUTPUT, rustCode);
  console.log(`   → ${RUST_OUTPUT}`);
  
  // Generate TypeScript
  console.log('📘 Generating TypeScript code...');
  const tsCode = generateTypeScript();
  fs.mkdirSync(path.dirname(TS_OUTPUT), { recursive: true });
  fs.writeFileSync(TS_OUTPUT, tsCode);
  console.log(`   → ${TS_OUTPUT}`);
  
  console.log('\n✅ Phase 1 Code Generation Complete!\n');
  console.log('   To add a new element or reaction:');
  console.log('   1. Edit definitions/elements.json or definitions/reactions.json');
  console.log('   2. Run: npm run codegen');
  console.log('   3. Done! No Rust code changes needed.\n');
}

main();
