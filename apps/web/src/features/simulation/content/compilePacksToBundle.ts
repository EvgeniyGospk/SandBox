export type PackManifest = {
  formatVersion: 1
  id: string
  title: string
  version: string
  dependencies: string[]
}

export type PackElementFile = {
  kind: 'element'
  id?: number
  key: string
  category: string
  color: string
  density: number | 'Infinity' | null
  dispersion: number
  lifetime: number
  defaultTemp: number
  heatConductivity: number
  bounce?: number
  friction?: number
  flags?: {
    flammable?: boolean
    conductive?: boolean
    corrosive?: boolean
    hot?: boolean
    cold?: boolean
    ignoreGravity?: boolean
    rigid?: boolean
  }
  behavior?: string | null
  phaseChange?: null | {
    high?: { temp: number; to: string; toId?: number } | null
    low?: { temp: number; to: string; toId?: number } | null
  }
  hidden?: boolean
  ui?: null | {
    category: string
    displayName?: string
    description?: string
    sort?: number
    hidden?: boolean
  }
}

export type PackReactionFile = {
  kind: 'reaction'
  id: string
  aggressor: string
  victim: string
  resultAggressor: string | null
  resultVictim: string | null
  chance: number
  spawn: string | null
  comment?: string
}

export type RuntimeBundle = {
  formatVersion: 1
  generatedAt: string
  packs: PackManifest[]
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

export type PackInput = {
  rootPath: string
  manifest: PackManifest
  elementFiles: Array<{ relPath: string; data: PackElementFile }>
  reactionFiles: Array<{ relPath: string; data: PackReactionFile }>
}

export type UploadedFileEntry = {
  file: File
  relPath: string
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function resolvePhysicsForElement(category: string, element: { bounce?: unknown; friction?: unknown }): {
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

function normalizeDensity(v: PackElementFile['density']): number | null {
  if (v === 'Infinity') return Number.POSITIVE_INFINITY
  if (typeof v === 'number') return v
  return null
}

function normalizeElementFlags(flags: PackElementFile['flags']): RuntimeBundle['elements'][number]['flags'] {
  const f = isRecord(flags) ? (flags as Record<string, unknown>) : {}
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

function getRelPath(file: File): string {
  const maybe = file as unknown as { webkitRelativePath?: string }
  const rel = typeof maybe.webkitRelativePath === 'string' ? maybe.webkitRelativePath : ''
  return rel.length > 0 ? rel : file.name
}

function parsePackManifest(raw: unknown, ctx: string): PackManifest {
  if (!isRecord(raw)) throw new Error(`${ctx}: must be object`)
  const rec = raw as Record<string, unknown>
  if (rec.formatVersion !== 1) throw new Error(`${ctx}: unsupported formatVersion`)
  if (typeof rec.id !== 'string' || rec.id.length === 0) throw new Error(`${ctx}: id must be string`)
  if (typeof rec.title !== 'string' || rec.title.length === 0) throw new Error(`${ctx}: title must be string`)
  if (typeof rec.version !== 'string' || rec.version.length === 0) throw new Error(`${ctx}: version must be string`)
  const deps = Array.isArray(rec.dependencies) ? rec.dependencies : []
  for (const d of deps) {
    if (typeof d !== 'string') throw new Error(`${ctx}: dependencies must be string[]`)
  }
  return {
    formatVersion: 1,
    id: rec.id,
    title: rec.title,
    version: rec.version,
    dependencies: deps as string[],
  }
}

function parseElementFile(raw: unknown, ctx: string): PackElementFile {
  if (!isRecord(raw)) throw new Error(`${ctx}: must be object`)
  const rec = raw as Record<string, unknown>
  if (rec.kind !== 'element') throw new Error(`${ctx}: kind must be 'element'`)
  if (typeof rec.key !== 'string' || rec.key.length === 0) throw new Error(`${ctx}: key must be string`)
  if (typeof rec.category !== 'string' || rec.category.length === 0) throw new Error(`${ctx}: category must be string`)
  if (typeof rec.color !== 'string') throw new Error(`${ctx}: color must be string`)

  if (rec.id !== undefined) {
    if (!Number.isInteger(rec.id)) throw new Error(`${ctx}: id must be integer when present`)
    const id = rec.id as number
    if (id < 0 || id > 255) throw new Error(`${ctx}: id must be in range 0..255`)
  }

  return rec as unknown as PackElementFile
}

function parseReactionFile(raw: unknown, ctx: string): PackReactionFile {
  if (!isRecord(raw)) throw new Error(`${ctx}: must be object`)
  const rec = raw as Record<string, unknown>
  if (rec.kind !== 'reaction') throw new Error(`${ctx}: kind must be 'reaction'`)
  if (typeof rec.id !== 'string' || rec.id.length === 0) throw new Error(`${ctx}: id must be string`)
  if (typeof rec.aggressor !== 'string' || rec.aggressor.length === 0) throw new Error(`${ctx}: aggressor must be string`)
  if (typeof rec.victim !== 'string' || rec.victim.length === 0) throw new Error(`${ctx}: victim must be string`)
  if (typeof rec.chance !== 'number' || !Number.isFinite(rec.chance) || rec.chance < 0 || rec.chance > 1) {
    throw new Error(`${ctx}: chance must be number in range 0..1`)
  }

  return rec as unknown as PackReactionFile
}

function topoSortPacksStable(packs: PackInput[]): PackInput[] {
  const orderIndex = new Map<string, number>()
  for (let i = 0; i < packs.length; i++) {
    orderIndex.set(packs[i]?.manifest.id, i)
  }

  const byId = new Map<string, PackInput>()
  for (const p of packs) {
    if (byId.has(p.manifest.id)) throw new Error(`Duplicate pack id: ${p.manifest.id}`)
    byId.set(p.manifest.id, p)
  }

  const indeg = new Map<string, number>()
  const edges = new Map<string, string[]>()

  for (const p of packs) {
    indeg.set(p.manifest.id, 0)
    edges.set(p.manifest.id, [])
  }

  for (const p of packs) {
    for (const dep of p.manifest.dependencies) {
      if (!byId.has(dep)) throw new Error(`Pack ${p.manifest.id} depends on missing pack ${dep}`)
      edges.get(dep)?.push(p.manifest.id)
      indeg.set(p.manifest.id, (indeg.get(p.manifest.id) ?? 0) + 1)
    }
  }

  const queue = Array.from(indeg.entries())
    .filter(([, d]) => d === 0)
    .map(([id]) => id)
    .sort((a, b) => {
      const ia = orderIndex.get(a) ?? 0
      const ib = orderIndex.get(b) ?? 0
      return ia - ib
    })

  const out: PackInput[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    const p = byId.get(id)
    if (!p) continue
    out.push(p)

    const next = edges.get(id) ?? []
    for (const to of next) {
      indeg.set(to, (indeg.get(to) ?? 0) - 1)
      if ((indeg.get(to) ?? 0) === 0) {
        queue.push(to)
        queue.sort((a, b) => {
          const ia = orderIndex.get(a) ?? 0
          const ib = orderIndex.get(b) ?? 0
          return ia - ib
        })
      }
    }
  }

  if (out.length !== packs.length) {
    throw new Error('Pack dependency cycle detected')
  }

  return out
}

export async function parsePacksFromDirectoryUpload(args: { files: File[] }): Promise<PackInput[]> {
  const { files } = args
  const entries: UploadedFileEntry[] = files.map((f) => ({ file: f, relPath: getRelPath(f) }))
  return parsePacksFromFileEntries({ entries })
}

export async function parsePacksFromFileEntries(args: { entries: UploadedFileEntry[] }): Promise<PackInput[]> {
  const { entries } = args
  const packJsons = entries.filter((e) => e.relPath === 'pack.json' || e.relPath.endsWith('/pack.json'))
  if (packJsons.length === 0) {
    throw new Error(
      'No pack.json found. Select the pack root folder that contains pack.json (for example: content/packs/base). Selecting only elements/ or reactions/ will not work.'
    )
  }

  const packRoots = packJsons
    .map((e) => {
      const rel = e.relPath
      const root = rel === 'pack.json' ? '' : rel.slice(0, rel.length - '/pack.json'.length)
      return { rootPath: root, file: e.file, relPath: e.relPath }
    })
    .sort((a, b) => b.rootPath.length - a.rootPath.length)

  const rootToFiles = new Map<string, { packJson: { file: File; relPath: string } | null; files: UploadedFileEntry[] }>()
  for (const root of packRoots) {
    rootToFiles.set(root.rootPath, { packJson: { file: root.file, relPath: root.relPath }, files: [] })
  }

  for (const e of entries) {
    let chosen: string | null = null
    for (const root of packRoots) {
      const prefix = root.rootPath.length === 0 ? '' : `${root.rootPath}/`
      if (prefix.length === 0 || e.relPath.startsWith(prefix)) {
        chosen = root.rootPath
        break
      }
    }

    if (chosen === null) continue
    rootToFiles.get(chosen)?.files.push(e)
  }

  const packs: PackInput[] = []
  for (const [rootPath, group] of rootToFiles.entries()) {
    const packJson = group.packJson
    if (!packJson) continue

    const manifest = parsePackManifest(JSON.parse(await packJson.file.text()), packJson.relPath)

    const elementFiles: PackInput['elementFiles'] = []
    const reactionFiles: PackInput['reactionFiles'] = []

    for (const e of group.files) {
      const rel = e.relPath
      const within = rootPath.length === 0 ? rel : rel.slice(rootPath.length + 1)
      if (within === 'pack.json') continue

      if (within.startsWith('elements/') && within.endsWith('.json')) {
        const data = parseElementFile(JSON.parse(await e.file.text()), rel)
        elementFiles.push({ relPath: rel, data })
      }

      if (within.startsWith('reactions/') && within.endsWith('.json')) {
        const data = parseReactionFile(JSON.parse(await e.file.text()), rel)
        reactionFiles.push({ relPath: rel, data })
      }
    }

    packs.push({ rootPath, manifest, elementFiles, reactionFiles })
  }

  if (packs.length === 0) throw new Error('No packs detected in selected folder(s)')

  return packs
}

export function compilePacksToBundleFromParsedPacks(args: { packs: PackInput[] }): RuntimeBundle {
  const sortedPacks = topoSortPacksStable(args.packs)

  const elementsByKey = new Map<string, RuntimeBundle['elements'][number]>()
  const usedIds = new Set<number>()

  function allocId(): number {
    for (let id = 0; id <= 255; id++) {
      if (!usedIds.has(id)) {
        usedIds.add(id)
        return id
      }
    }
    throw new Error('ElementId space exhausted (0..255). Increase capacity or switch engine to u16.')
  }

  for (const p of sortedPacks) {
    for (const { relPath, data } of p.elementFiles) {
      const fullKey = data.key.includes(':') ? data.key : `${p.manifest.id}:${data.key}`

      const prev = elementsByKey.get(fullKey)
      if (prev) {
        if (Number.isInteger(data.id) && data.id !== prev.id) {
          throw new Error(`element id mismatch for override ${fullKey}: file=${data.id} existing=${prev.id}`)
        }
      }

      const idCandidate = Number.isInteger(data.id) ? (data.id as number) : null
      let id: number
      if (prev) {
        id = prev.id
      } else if (idCandidate !== null) {
        if (usedIds.has(idCandidate)) {
          throw new Error(`duplicate element id: ${idCandidate} (key=${fullKey})`)
        }
        usedIds.add(idCandidate)
        id = idCandidate
      } else {
        id = allocId()
      }

      const { bounce, friction } = resolvePhysicsForElement(data.category, data)
      const ui = data.ui
        ? {
            category: data.ui.category,
            displayName: typeof data.ui.displayName === 'string' ? data.ui.displayName : data.key,
            description: typeof data.ui.description === 'string' ? data.ui.description : '',
            sort: typeof data.ui.sort === 'number' ? data.ui.sort : 0,
            hidden: !!data.ui.hidden,
          }
        : null

      const out: RuntimeBundle['elements'][number] = {
        id,
        key: fullKey,
        name: data.key,
        pack: p.manifest.id,
        category: data.category,
        color: parseColorU32Hex(data.color, relPath),
        density: normalizeDensity(data.density),
        dispersion: data.dispersion,
        lifetime: data.lifetime,
        defaultTemp: data.defaultTemp,
        heatConductivity: data.heatConductivity,
        bounce,
        friction,
        flags: normalizeElementFlags(data.flags),
        behavior: typeof data.behavior === 'string' ? data.behavior : null,
        phaseChange: data.phaseChange
          ? {
              ...(data.phaseChange.high ? { high: { temp: data.phaseChange.high.temp, to: data.phaseChange.high.to, toId: -1 } } : {}),
              ...(data.phaseChange.low ? { low: { temp: data.phaseChange.low.temp, to: data.phaseChange.low.to, toId: -1 } } : {}),
            }
          : null,
        hidden: !!data.hidden,
        ui,
        _src: relPath,
      }

      elementsByKey.set(fullKey, out)
    }
  }

  const elements = Array.from(elementsByKey.values()).sort((a, b) => a.id - b.id)
  const elementKeyToId: Record<string, number> = {}
  for (const el of elements) {
    elementKeyToId[el.key] = el.id
  }

  if (elementKeyToId['base:empty'] !== 0) {
    throw new Error('Expected base:empty to have id 0')
  }

  for (const el of elements) {
    const pc = el.phaseChange
    if (!pc) continue

    if (pc.high) {
      const ref = normalizeElementRef(pc.high.to, el.pack)
      if (!ref || elementKeyToId[ref] === undefined) {
        throw new Error(`Unknown element ref in phaseChange.high.to: ${pc.high.to} (in ${el.key})`)
      }
      pc.high.to = ref
      pc.high.toId = elementKeyToId[ref]
    }

    if (pc.low) {
      const ref = normalizeElementRef(pc.low.to, el.pack)
      if (!ref || elementKeyToId[ref] === undefined) {
        throw new Error(`Unknown element ref in phaseChange.low.to: ${pc.low.to} (in ${el.key})`)
      }
      pc.low.to = ref
      pc.low.toId = elementKeyToId[ref]
    }
  }

  const reactionsByPair = new Map<string, RuntimeBundle['reactions'][number]>()

  for (const p of sortedPacks) {
    for (const { relPath, data } of p.reactionFiles) {
      const aggressor = normalizeElementRef(data.aggressor, p.manifest.id)
      const victim = normalizeElementRef(data.victim, p.manifest.id)

      if (!aggressor || elementKeyToId[aggressor] === undefined) {
        throw new Error(`Unknown aggressor element: ${data.aggressor} (in ${p.manifest.id}:${data.id})`)
      }
      if (!victim || elementKeyToId[victim] === undefined) {
        throw new Error(`Unknown victim element: ${data.victim} (in ${p.manifest.id}:${data.id})`)
      }

      const resultAggressor = data.resultAggressor === null ? null : normalizeElementRef(data.resultAggressor, p.manifest.id)
      const normalizedResultVictimKey = data.resultVictim === null ? 'base:empty' : data.resultVictim
      const resultVictim = normalizeElementRef(normalizedResultVictimKey, p.manifest.id)
      const spawn = data.spawn === null ? null : normalizeElementRef(data.spawn, p.manifest.id)

      const out: RuntimeBundle['reactions'][number] = {
        id: `${p.manifest.id}:${data.id}`,
        pack: p.manifest.id,
        aggressor,
        victim,
        resultAggressor,
        resultVictim,
        spawn,
        chance: data.chance,
        aggressorId: elementKeyToId[aggressor],
        victimId: elementKeyToId[victim],
        resultAggressorId: resultAggressor === null ? null : elementKeyToId[resultAggressor],
        resultVictimId: resultVictim ? elementKeyToId[resultVictim] : -1,
        spawnId: spawn === null ? null : elementKeyToId[spawn],
        comment: typeof data.comment === 'string' ? data.comment : undefined,
        _src: relPath,
      }

      if (resultAggressor !== null && out.resultAggressorId === undefined) {
        throw new Error(`Unknown resultAggressor element: ${data.resultAggressor} (in ${out.id})`)
      }
      if (!resultVictim || out.resultVictimId === undefined) {
        throw new Error(`Unknown resultVictim element: ${normalizedResultVictimKey} (in ${out.id})`)
      }
      if (spawn !== null && out.spawnId === undefined) {
        throw new Error(`Unknown spawn element: ${data.spawn} (in ${out.id})`)
      }

      const pairKey = `${aggressor}::${victim}`
      reactionsByPair.set(pairKey, out)
    }
  }

  const reactions = Array.from(reactionsByPair.values()).sort((a, b) => {
    if (a.aggressorId !== b.aggressorId) return a.aggressorId - b.aggressorId
    return a.victimId - b.victimId
  })

  return {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    packs: sortedPacks.map((p) => p.manifest),
    elements,
    elementKeyToId,
    reactions,
  }
}

export async function compilePacksToBundleFromDirectoryUpload(args: { files: File[] }): Promise<RuntimeBundle> {
  const packs = await parsePacksFromDirectoryUpload({ files: args.files })
  return compilePacksToBundleFromParsedPacks({ packs })
}
