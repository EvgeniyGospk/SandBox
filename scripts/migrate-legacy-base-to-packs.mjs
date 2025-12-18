#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..')
const legacyElementsPath = path.join(repoRoot, 'definitions', 'elements.json')
const legacyReactionsPath = path.join(repoRoot, 'definitions', 'reactions.json')

const packRoot = path.join(repoRoot, 'content', 'packs', 'base')
const elementsOutDir = path.join(packRoot, 'elements')
const reactionsOutDir = path.join(packRoot, 'reactions')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function isRecord(v) {
  return typeof v === 'object' && v !== null
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

function sanitizeFileName(name) {
  return String(name)
    .trim()
    .replaceAll(/[^a-zA-Z0-9_\-\.]/g, '_')
}

function mapLegacyElementToPackFile(el) {
  const density = el.density === 'Infinity' ? 'Infinity' : (typeof el.density === 'number' ? el.density : null)

  return {
    kind: 'element',
    id: el.id,
    key: el.name,
    category: el.category,
    color: el.color,
    density,
    dispersion: el.dispersion,
    lifetime: el.lifetime,
    defaultTemp: el.defaultTemp,
    heatConductivity: el.heatConductivity,
    flags: {
      flammable: !!el.flammable,
      conductive: !!el.conductive,
      corrosive: !!el.corrosive,
      hot: !!el.hot,
      cold: !!el.cold,
      ignoreGravity: !!el.ignoreGravity,
      rigid: !!el.rigid,
    },
    behavior: typeof el.behaviorKind === 'string' ? el.behaviorKind : null,
    phaseChange: isRecord(el.phaseChange) ? el.phaseChange : null,
    hidden: !!el.hidden,
    ui: isRecord(el.ui) ? el.ui : null,
  }
}

function mapLegacyReactionToPackFile(r) {
  return {
    kind: 'reaction',
    id: r.id,
    aggressor: r.aggressor,
    victim: r.victim,
    resultAggressor: r.result_aggressor ?? null,
    resultVictim: r.result_victim ?? null,
    chance: r.chance,
    spawn: r.spawn ?? null,
    comment: typeof r.comment === 'string' ? r.comment : undefined,
  }
}

async function main() {
  const elementsData = await readJson(legacyElementsPath)
  const reactionsData = await readJson(legacyReactionsPath)

  assert(isRecord(elementsData) && Array.isArray(elementsData.elements), 'definitions/elements.json: expected elements[]')
  assert(isRecord(reactionsData) && Array.isArray(reactionsData.reactions), 'definitions/reactions.json: expected reactions[]')

  await mkdir(elementsOutDir, { recursive: true })
  await mkdir(reactionsOutDir, { recursive: true })

  let elementsWritten = 0
  for (const el of elementsData.elements) {
    assert(isRecord(el), 'definitions/elements.json: element must be object')
    assert(typeof el.name === 'string' && el.name.length > 0, 'definitions/elements.json: element.name must be string')
    assert(Number.isInteger(el.id) && el.id >= 0 && el.id <= 255, `definitions/elements.json: invalid element id for ${el.name}`)

    const out = mapLegacyElementToPackFile(el)
    const fileName = `${sanitizeFileName(el.name)}.json`
    const filePath = path.join(elementsOutDir, fileName)
    await writeFile(filePath, JSON.stringify(out, null, 2) + '\n', 'utf8')
    elementsWritten += 1
  }

  let reactionsWritten = 0
  for (const r of reactionsData.reactions) {
    assert(isRecord(r), 'definitions/reactions.json: reaction must be object')
    assert(typeof r.id === 'string' && r.id.length > 0, 'definitions/reactions.json: reaction.id must be string')

    const out = mapLegacyReactionToPackFile(r)
    const fileName = `${sanitizeFileName(r.id)}.json`
    const filePath = path.join(reactionsOutDir, fileName)
    await writeFile(filePath, JSON.stringify(out, null, 2) + '\n', 'utf8')
    reactionsWritten += 1
  }

  process.stdout.write(
    `Migrated legacy base definitions to packs.\n` +
      `- elements: ${elementsWritten} -> content/packs/base/elements/*.json\n` +
      `- reactions: ${reactionsWritten} -> content/packs/base/reactions/*.json\n`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
