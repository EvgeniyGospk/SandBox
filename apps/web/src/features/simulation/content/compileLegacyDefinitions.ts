type ElementsDefinitions = {
  version?: string
  elements: Array<{
    id: number
    name: string
    category: string
    color: string
    density?: number | 'Infinity'
    dispersion: number
    lifetime: number
    defaultTemp: number
    heatConductivity: number
    bounce?: number
    friction?: number
    flammable?: boolean
    conductive?: boolean
    corrosive?: boolean
    hot?: boolean
    cold?: boolean
    ignoreGravity?: boolean
    rigid?: boolean
    hidden?: boolean
    behaviorKind?: string
    phaseChange?: {
      high?: { temp: number; to: string }
      low?: { temp: number; to: string }
    }
    ui?: {
      category: string
      displayName?: string
      description?: string
      sort?: number
      hidden?: boolean
    }
  }>
}

type ReactionsDefinitions = {
  version?: string
  reactions: Array<{
    id: string
    aggressor: string
    victim: string
    result_aggressor: string | null
    result_victim: string | null
    chance: number
    spawn: string | null
    comment?: string
  }>
}

type RuntimeBundle = {
  formatVersion: 1
  generatedAt: string
  packs: Array<{ formatVersion: 1; id: string; title: string; version: string; dependencies: string[] }>
  elements: Array<{
    id: number
    key: string
    name: string
    pack: string
    category: string
    color: number
    density: number | null
    dispersion: number
    lifetime: number
    defaultTemp: number
    heatConductivity: number
    bounce: number
    friction: number
    flags: {
      flammable: boolean
      conductive: boolean
      corrosive: boolean
      hot: boolean
      cold: boolean
      ignoreGravity: boolean
      rigid: boolean
    }
    behavior: string | null
    phaseChange: null | {
      high?: { temp: number; to: string; toId: number }
      low?: { temp: number; to: string; toId: number }
    }
    hidden: boolean
    ui: null | {
      category: string
      displayName: string
      description: string
      sort: number
      hidden: boolean
    }
    _src?: string
  }>
  elementKeyToId: Record<string, number>
  reactions: Array<{
    id?: string
    pack?: string
    aggressor?: string
    victim?: string
    resultAggressor?: string | null
    resultVictim?: string | null
    spawn?: string | null
    chance: number
    aggressorId: number
    victimId: number
    resultAggressorId: number | null
    resultVictimId: number
    spawnId: number | null
    comment?: string
    _src?: string
  }>
}

const defaultPhysicsByCategory: Record<string, { bounce: number; friction: number }> = {
  solid: { bounce: 0.0, friction: 0.0 },
  powder: { bounce: 0.2, friction: 0.9 },
  liquid: { bounce: 0.0, friction: 0.95 },
  gas: { bounce: 0.0, friction: 0.99 },
  energy: { bounce: 0.0, friction: 1.0 },
  utility: { bounce: 0.0, friction: 1.0 },
  bio: { bounce: 0.1, friction: 0.85 },
}

function resolvePhysicsForElement(category: string, element: { bounce?: number; friction?: number }): {
  bounce: number
  friction: number
} {
  const defaults = defaultPhysicsByCategory[category] ?? { bounce: 0.0, friction: 1.0 }
  const bounce = typeof element.bounce === 'number' ? element.bounce : defaults.bounce
  const friction = typeof element.friction === 'number' ? element.friction : defaults.friction
  return { bounce, friction }
}

function parseColorU32Hex(s: string, ctx: string): number {
  if (typeof s !== 'string') throw new Error(`${ctx}: color must be string`)
  if (!/^0x[0-9A-Fa-f]{8}$/.test(s)) throw new Error(`${ctx}: color must match 0xAARRGGBB`)
  return Number.parseInt(s.slice(2), 16) >>> 0
}

function normalizeElementRef(ref: string | null, packId: string): string | null {
  if (typeof ref !== 'string') return null
  if (ref.includes(':')) return ref
  return `${packId}:${ref}`
}

export function compileLegacyDefinitionsToBundle(args: {
  elementsJson: string
  reactionsJson: string
  packId?: string
}): RuntimeBundle {
  const packId = args.packId ?? 'base'

  const elementsData = JSON.parse(args.elementsJson) as ElementsDefinitions
  const reactionsData = JSON.parse(args.reactionsJson) as ReactionsDefinitions

  if (!elementsData || typeof elementsData !== 'object' || !Array.isArray(elementsData.elements)) {
    throw new Error('elements.json: expected object with elements[]')
  }
  if (!reactionsData || typeof reactionsData !== 'object' || !Array.isArray(reactionsData.reactions)) {
    throw new Error('reactions.json: expected object with reactions[]')
  }

  const elements: RuntimeBundle['elements'] = elementsData.elements.map((el, idx) => {
    if (!el || typeof el !== 'object') throw new Error(`elements.json: elements[${idx}] must be object`)
    if (typeof el.name !== 'string' || el.name.length === 0) {
      throw new Error(`elements.json: elements[${idx}].name must be string`)
    }

    const { bounce, friction } = resolvePhysicsForElement(el.category, el)

    const flags = {
      flammable: !!el.flammable,
      conductive: !!el.conductive,
      corrosive: !!el.corrosive,
      hot: !!el.hot,
      cold: !!el.cold,
      ignoreGravity: !!el.ignoreGravity,
      rigid: !!el.rigid,
    }

    const ui = el.ui
      ? {
          category: el.ui.category,
          displayName: typeof el.ui.displayName === 'string' ? el.ui.displayName : el.name,
          description: typeof el.ui.description === 'string' ? el.ui.description : '',
          sort: typeof el.ui.sort === 'number' ? el.ui.sort : 0,
          hidden: !!el.ui.hidden,
        }
      : null

    return {
      id: el.id,
      key: `${packId}:${el.name}`,
      name: el.name,
      pack: packId,
      category: el.category,
      color: parseColorU32Hex(el.color, `elements.json: elements[${idx}]`),
      density: el.density === 'Infinity' ? Number.POSITIVE_INFINITY : (typeof el.density === 'number' ? el.density : null),
      dispersion: el.dispersion,
      lifetime: el.lifetime,
      defaultTemp: el.defaultTemp,
      heatConductivity: el.heatConductivity,
      bounce,
      friction,
      flags,
      behavior: typeof el.behaviorKind === 'string' ? el.behaviorKind : null,
      phaseChange: el.phaseChange
        ? {
            ...(el.phaseChange.high ? { high: { temp: el.phaseChange.high.temp, to: el.phaseChange.high.to, toId: -1 } } : {}),
            ...(el.phaseChange.low ? { low: { temp: el.phaseChange.low.temp, to: el.phaseChange.low.to, toId: -1 } } : {}),
          }
        : null,
      hidden: !!el.hidden,
      ui,
      _src: 'definitions/elements.json',
    }
  })

  const elementKeyToId: Record<string, number> = {}
  for (const el of elements) {
    elementKeyToId[el.key] = el.id
  }

  if (elementKeyToId[`${packId}:empty`] !== 0) {
    throw new Error(`elements.json: expected ${packId}:empty to have id 0`)
  }

  for (const el of elements) {
    const pc = el.phaseChange
    if (!pc) continue

    if (pc.high) {
      const ref = normalizeElementRef(pc.high.to, packId)
      if (!ref || elementKeyToId[ref] === undefined) {
        throw new Error(`Unknown element ref in phaseChange.high.to: ${pc.high.to} (in ${el.key})`)
      }
      pc.high.to = ref
      pc.high.toId = elementKeyToId[ref]
    }

    if (pc.low) {
      const ref = normalizeElementRef(pc.low.to, packId)
      if (!ref || elementKeyToId[ref] === undefined) {
        throw new Error(`Unknown element ref in phaseChange.low.to: ${pc.low.to} (in ${el.key})`)
      }
      pc.low.to = ref
      pc.low.toId = elementKeyToId[ref]
    }
  }

  const reactions: RuntimeBundle['reactions'] = reactionsData.reactions.map((r, idx) => {
    if (!r || typeof r !== 'object') throw new Error(`reactions.json: reactions[${idx}] must be object`)
    if (typeof r.id !== 'string' || r.id.length === 0) throw new Error(`reactions.json: reactions[${idx}].id must be string`)

    const aggressor = normalizeElementRef(r.aggressor, packId)
    const victim = normalizeElementRef(r.victim, packId)
    if (!aggressor || elementKeyToId[aggressor] === undefined) {
      throw new Error(`Unknown aggressor element: ${r.aggressor} (in ${r.id})`)
    }
    if (!victim || elementKeyToId[victim] === undefined) {
      throw new Error(`Unknown victim element: ${r.victim} (in ${r.id})`)
    }

    const resultAggressor = r.result_aggressor === null ? null : normalizeElementRef(r.result_aggressor, packId)

    const resultVictimKey = r.result_victim === null ? `${packId}:empty` : r.result_victim
    const resultVictim = normalizeElementRef(resultVictimKey, packId)
    if (!resultVictim) {
      throw new Error(`Invalid resultVictim in ${r.id}`)
    }

    const spawn = r.spawn === null ? null : normalizeElementRef(r.spawn, packId)

    const out = {
      id: `${packId}:${r.id}`,
      pack: packId,
      aggressor,
      victim,
      resultAggressor,
      resultVictim,
      spawn,
      chance: r.chance,
      aggressorId: elementKeyToId[aggressor],
      victimId: elementKeyToId[victim],
      resultAggressorId: resultAggressor === null ? null : elementKeyToId[resultAggressor],
      resultVictimId: elementKeyToId[resultVictim],
      spawnId: spawn === null ? null : elementKeyToId[spawn],
      comment: typeof r.comment === 'string' ? r.comment : undefined,
      _src: 'definitions/reactions.json',
    }

    if (resultAggressor !== null && out.resultAggressorId === undefined) {
      throw new Error(`Unknown resultAggressor element: ${r.result_aggressor} (in ${r.id})`)
    }
    if (out.resultVictimId === undefined) {
      throw new Error(`Unknown resultVictim element: ${resultVictimKey} (in ${r.id})`)
    }
    if (spawn !== null && out.spawnId === undefined) {
      throw new Error(`Unknown spawn element: ${r.spawn} (in ${r.id})`)
    }

    if (typeof out.chance !== 'number' || !Number.isFinite(out.chance) || out.chance < 0 || out.chance > 1) {
      throw new Error(`Invalid chance in ${out.id}`)
    }

    return out
  })

  const bundle: RuntimeBundle = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    packs: [
      {
        formatVersion: 1,
        id: packId,
        title: packId === 'base' ? 'Base Pack' : packId,
        version: elementsData.version ?? reactionsData.version ?? '0.0.0',
        dependencies: [],
      },
    ],
    elements,
    elementKeyToId,
    reactions,
  }

  return bundle
}
