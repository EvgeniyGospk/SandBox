#!/usr/bin/env node
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..')
const packsRoot = path.join(repoRoot, 'content', 'packs')
const legacyElementsPath = path.join(repoRoot, 'definitions', 'elements.json')
const legacyReactionsPath = path.join(repoRoot, 'definitions', 'reactions.json')
const webPublicOutDir = path.join(repoRoot, 'apps', 'web', 'public', 'content')
const webBundleJsonPath = path.join(webPublicOutDir, 'bundle.json')

const defaultPhysicsByCategory = {
  solid: { bounce: 0.0, friction: 0.0 },
  powder: { bounce: 0.2, friction: 0.9 },
  liquid: { bounce: 0.0, friction: 0.95 },
  gas: { bounce: 0.0, friction: 0.99 },
  energy: { bounce: 0.0, friction: 1.0 },
  utility: { bounce: 0.0, friction: 1.0 },
  bio: { bounce: 0.1, friction: 0.85 },
}

function resolvePhysicsForElement(category, element) {
  const defaults = defaultPhysicsByCategory[category] ?? { bounce: 0.0, friction: 1.0 }
  const bounce = typeof element.bounce === 'number' ? element.bounce : defaults.bounce
  const friction = typeof element.friction === 'number' ? element.friction : defaults.friction
  return { bounce, friction }
}

function isRecord(v) {
  return typeof v === 'object' && v !== null
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

async function listJsonFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => path.join(dir, e.name))
    .sort((a, b) => a.localeCompare(b))
  return files
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function parseColorU32Hex(s, ctx) {
  assert(typeof s === 'string', `${ctx}: color must be string`) 
  assert(/^0x[0-9A-Fa-f]{8}$/.test(s), `${ctx}: color must match 0xAARRGGBB`) 
  return Number.parseInt(s.slice(2), 16) >>> 0
}

function normalizeElementRef(ref, packId) {
  if (typeof ref !== 'string') return null
  if (ref.includes(':')) return ref
  return `${packId}:${ref}`
}

function normalizeElementFlags(flags) {
  const f = isRecord(flags) ? flags : {}
  return {
    flammable: !!f.flammable,
    conductive: !!f.conductive,
    corrosive: !!f.corrosive,
    hot: !!f.hot,
    cold: !!f.cold,
    ignoreGravity: !!f.ignoreGravity,
    rigid: !!f.rigid,
  }
}

function normalizeDensity(v) {
  if (v === 'Infinity') return Number.POSITIVE_INFINITY
  return v
}

async function loadLegacyBase() {
  // This is a transitional bridge. We keep it so the new packs system can ship
  // incrementally while we move definitions/* into content/packs/*.
  const elementsData = await readJson(legacyElementsPath)
  const reactionsData = await readJson(legacyReactionsPath)

  assert(isRecord(elementsData), `${path.relative(repoRoot, legacyElementsPath)}: must be object`)
  assert(isRecord(reactionsData), `${path.relative(repoRoot, legacyReactionsPath)}: must be object`)
  assert(Array.isArray(elementsData.elements), `${path.relative(repoRoot, legacyElementsPath)}: elements must be array`)
  assert(Array.isArray(reactionsData.reactions), `${path.relative(repoRoot, legacyReactionsPath)}: reactions must be array`)

  const packId = 'base'

  const elements = elementsData.elements.map((el, idx) => {
    assert(isRecord(el), `${path.relative(repoRoot, legacyElementsPath)}: elements[${idx}] must be object`)
    assert(typeof el.name === 'string' && el.name.length > 0, `${path.relative(repoRoot, legacyElementsPath)}: elements[${idx}].name must be string`)

    const flags = normalizeElementFlags({
      flammable: el.flammable,
      conductive: el.conductive,
      corrosive: el.corrosive,
      hot: el.hot,
      cold: el.cold,
      ignoreGravity: el.ignoreGravity,
      rigid: el.rigid,
    })

    const { bounce, friction } = resolvePhysicsForElement(el.category, el)

    return {
      id: el.id,
      key: `${packId}:${el.name}`,
      name: el.name,
      pack: packId,
      category: el.category,
      color: parseColorU32Hex(el.color, `${path.relative(repoRoot, legacyElementsPath)}: elements[${idx}]`),
      density: normalizeDensity(el.density),
      dispersion: el.dispersion,
      lifetime: el.lifetime,
      defaultTemp: el.defaultTemp,
      heatConductivity: el.heatConductivity,
      bounce,
      friction,
      flags,
      behavior: el.behaviorKind ?? null,
      phaseChange: el.phaseChange ?? null,
      hidden: el.hidden ?? false,
      ui: el.ui ?? null,
      _src: path.relative(repoRoot, legacyElementsPath),
    }
  })

  const reactions = reactionsData.reactions.map((r, idx) => {
    assert(isRecord(r), `${path.relative(repoRoot, legacyReactionsPath)}: reactions[${idx}] must be object`)
    assert(typeof r.id === 'string' && r.id.length > 0, `${path.relative(repoRoot, legacyReactionsPath)}: reactions[${idx}].id must be string`)

    // Legacy semantics:
    // - result_aggressor: null => unchanged
    // - result_victim: null => destroyed
    // We normalize to new bundle semantics:
    // - resultAggressor: null => unchanged
    // - resultVictim: null => base:empty (destroy)
    const resultVictim = r.result_victim === null ? `${packId}:empty` : r.result_victim

    return {
      id: `${packId}:${r.id}`,
      pack: packId,
      aggressor: normalizeElementRef(r.aggressor, packId),
      victim: normalizeElementRef(r.victim, packId),
      resultAggressor: r.result_aggressor === null ? null : normalizeElementRef(r.result_aggressor, packId),
      resultVictim: resultVictim === null ? null : normalizeElementRef(resultVictim, packId),
      spawn: r.spawn === null ? null : normalizeElementRef(r.spawn, packId),
      chance: r.chance,
      comment: typeof r.comment === 'string' ? r.comment : undefined,
      _src: path.relative(repoRoot, legacyReactionsPath),
    }
  })

  return { elements, reactions }
}

async function loadPack(packDir) {
  const packPath = path.join(packDir, 'pack.json')
  const pack = await readJson(packPath)
  assert(isRecord(pack), `${packPath}: must be object`)
  assert(pack.formatVersion === 1, `${packPath}: unsupported formatVersion`) 
  assert(typeof pack.id === 'string' && pack.id.length > 0, `${packPath}: id must be string`) 

  const elementsDir = path.join(packDir, 'elements')
  const reactionsDir = path.join(packDir, 'reactions')

  const elementFiles = await listJsonFiles(elementsDir).catch(() => [])
  const reactionFiles = await listJsonFiles(reactionsDir).catch(() => [])

  const elements = []
  for (const file of elementFiles) {
    const el = await readJson(file)
    assert(isRecord(el), `${file}: must be object`)
    assert(el.kind === 'element', `${file}: kind must be 'element'`) 
    assert(typeof el.key === 'string' && el.key.length > 0, `${file}: key must be string`) 

    if (el.id !== undefined) {
      assert(Number.isInteger(el.id), `${file}: id must be integer when present`)
      assert(el.id >= 0 && el.id <= 255, `${file}: id must be in range 0..255`)
    }
    const fullKey = `${pack.id}:${el.key}`

    const { bounce, friction } = resolvePhysicsForElement(el.category, el)

    elements.push({
      id: el.id ?? -1,
      key: fullKey,
      name: el.key,
      pack: pack.id,
      category: el.category,
      color: parseColorU32Hex(el.color, `${file}`),
      density: normalizeDensity(el.density),
      dispersion: el.dispersion,
      lifetime: el.lifetime,
      defaultTemp: el.defaultTemp,
      heatConductivity: el.heatConductivity,
      bounce,
      friction,
      flags: normalizeElementFlags(el.flags),
      behavior: el.behavior ?? null,
      phaseChange: el.phaseChange ?? null,
      hidden: el.hidden ?? false,
      ui: el.ui ?? null,
      _src: path.relative(repoRoot, file),
    })
  }

  const reactions = []
  for (const file of reactionFiles) {
    const r = await readJson(file)
    assert(isRecord(r), `${file}: must be object`)
    assert(r.kind === 'reaction', `${file}: kind must be 'reaction'`) 
    assert(typeof r.id === 'string' && r.id.length > 0, `${file}: id must be string`) 
    const normalizedResultVictim = r.resultVictim === null ? 'base:empty' : r.resultVictim

    reactions.push({
      id: `${pack.id}:${r.id}`,
      pack: pack.id,
      aggressor: normalizeElementRef(r.aggressor, pack.id),
      victim: normalizeElementRef(r.victim, pack.id),
      resultAggressor: r.resultAggressor === null ? null : normalizeElementRef(r.resultAggressor, pack.id),
      resultVictim: normalizedResultVictim === null ? null : normalizeElementRef(normalizedResultVictim, pack.id),
      spawn: r.spawn === null ? null : normalizeElementRef(r.spawn, pack.id),
      chance: r.chance,
      comment: typeof r.comment === 'string' ? r.comment : undefined,
      _src: path.relative(repoRoot, file),
    })
  }

  return {
    pack,
    elements,
    reactions,
  }
}

async function main() {
  const packEntries = await readdir(packsRoot, { withFileTypes: true }).catch(() => [])
  const packDirs = packEntries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(packsRoot, e.name))
    .sort((a, b) => a.localeCompare(b))

  assert(packDirs.length > 0, `No packs found in ${packsRoot}`)

  const includeLegacy = process.env.CONTENT_INCLUDE_LEGACY === '1' || process.env.CONTENT_INCLUDE_LEGACY === 'true'
  const legacy = includeLegacy ? await loadLegacyBase().catch(() => ({ elements: [], reactions: [] })) : { elements: [], reactions: [] }

  const loaded = []
  for (const dir of packDirs) {
    loaded.push(await loadPack(dir))
  }

  // Merge strategy (deterministic):
  // - Preserve numeric IDs from legacy definitions (so empty stays 0, etc)
  // - Packs may override existing elements by key (keeping the same id)
  // - New elements get the next free ID
  // - Output is sorted by id
  const elementsByKey = new Map()
  const usedIds = new Set()
  for (const el of legacy.elements) {
    elementsByKey.set(el.key, el)
    if (Number.isInteger(el.id)) usedIds.add(el.id)
  }

  function allocId() {
    for (let id = 0; id <= 255; id++) {
      if (!usedIds.has(id)) {
        usedIds.add(id)
        return id
      }
    }
    throw new Error('ElementId space exhausted (0..255). Increase capacity or switch engine to u16.')
  }

  for (const { elements: packElements } of loaded) {
    for (const el of packElements) {
      const prev = elementsByKey.get(el.key)
      if (prev) {
        if (Number.isInteger(el.id) && el.id !== prev.id) {
          throw new Error(`element id mismatch for override ${el.key}: file=${el.id} existing=${prev.id}`)
        }
        el.id = prev.id
      } else {
        if (Number.isInteger(el.id) && el.id >= 0) {
          if (usedIds.has(el.id)) {
            throw new Error(`duplicate element id: ${el.id} (key=${el.key})`)
          }
          usedIds.add(el.id)
        } else {
          el.id = allocId()
        }
      }
      elementsByKey.set(el.key, el)
    }
  }

  const elements = Array.from(elementsByKey.values()).sort((a, b) => a.id - b.id)
  const elementKeyToId = {}
  for (const el of elements) {
    elementKeyToId[el.key] = el.id
  }

  // Resolve phaseChange refs now that IDs are known.
  for (const el of elements) {
    const pc = el.phaseChange
    if (!pc) continue

    if (pc.high?.to) {
      const ref = normalizeElementRef(pc.high.to, el.pack)
      assert(elementKeyToId[ref] !== undefined, `Unknown element ref in phaseChange.high.to: ${pc.high.to} (in ${el.key})`)
      pc.high.to = ref
      pc.high.toId = elementKeyToId[ref]
    }
    if (pc.low?.to) {
      const ref = normalizeElementRef(pc.low.to, el.pack)
      assert(elementKeyToId[ref] !== undefined, `Unknown element ref in phaseChange.low.to: ${pc.low.to} (in ${el.key})`)
      pc.low.to = ref
      pc.low.toId = elementKeyToId[ref]
    }
  }

  // Reaction merge strategy:
  // - Reactions are keyed by (aggressor, victim)
  // - Later packs override earlier definitions for the same pair
  const reactionsByPair = new Map()
  const allReactions = [...legacy.reactions]
  for (const { reactions: packReactions } of loaded) {
    for (const r of packReactions) allReactions.push(r)
  }

  for (const r of allReactions) {
      assert(typeof r.aggressor === 'string' && typeof r.victim === 'string', `Invalid reaction refs in ${r.id}`)
      assert(elementKeyToId[r.aggressor] !== undefined, `Unknown aggressor element: ${r.aggressor} (in ${r.id})`)
      assert(elementKeyToId[r.victim] !== undefined, `Unknown victim element: ${r.victim} (in ${r.id})`)

      const pairKey = `${r.aggressor}::${r.victim}`
      const out = {
        ...r,
        aggressorId: elementKeyToId[r.aggressor],
        victimId: elementKeyToId[r.victim],
        resultAggressorId: r.resultAggressor === null ? null : elementKeyToId[r.resultAggressor],
        resultVictimId: r.resultVictim === null ? null : elementKeyToId[r.resultVictim],
        spawnId: r.spawn === null ? null : elementKeyToId[r.spawn],
      }

      if (r.resultAggressor !== null) {
        assert(out.resultAggressorId !== undefined, `Unknown resultAggressor element: ${r.resultAggressor} (in ${r.id})`)
      }
      if (r.resultVictim !== null) {
        assert(out.resultVictimId !== undefined, `Unknown resultVictim element: ${r.resultVictim} (in ${r.id})`)
      }
      if (r.spawn !== null) {
        assert(out.spawnId !== undefined, `Unknown spawn element: ${r.spawn} (in ${r.id})`)
      }

      assert(typeof r.chance === 'number' && Number.isFinite(r.chance) && r.chance >= 0 && r.chance <= 1, `Invalid chance in ${r.id}`)

      reactionsByPair.set(pairKey, out)
  }

  const reactions = Array.from(reactionsByPair.values()).sort((a, b) => {
    if (a.aggressorId !== b.aggressorId) return a.aggressorId - b.aggressorId
    return a.victimId - b.victimId
  })

  const bundle = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    packs: loaded.map(({ pack }) => pack),
    elements,
    elementKeyToId,
    reactions,
  }

  await mkdir(webPublicOutDir, { recursive: true })
  await writeFile(webBundleJsonPath, JSON.stringify(bundle, null, 2) + '\n', 'utf8')

  process.stdout.write(`Wrote ${path.relative(repoRoot, webBundleJsonPath)} (elements=${elements.length}, reactions=${reactions.length})\n`)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})
