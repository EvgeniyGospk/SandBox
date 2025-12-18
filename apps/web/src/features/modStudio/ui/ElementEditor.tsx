import { useMemo, useId, useState, useCallback } from 'react'

import type { PackElementFile } from '@/features/simulation/content/compilePacksToBundle'

const BEHAVIOR_OPTIONS = [
  '',
  'bio_plant',
  'bio_seed',
  'energy_electricity',
  'energy_fire',
  'energy_spark',
  'utility_clone',
  'utility_void',
]

const CATEGORY_OPTIONS = ['solid', 'powder', 'liquid', 'gas', 'energy', 'utility', 'bio'] as const
type Category = (typeof CATEGORY_OPTIONS)[number]

type FieldErrors = Record<string, string>

function isColorU32Hex(v: string): boolean {
  return /^0x[0-9A-Fa-f]{8}$/.test(v)
}

function parseColorU32Hex(v: string): { a: number; r: number; g: number; b: number } | null {
  if (!isColorU32Hex(v)) return null
  const u = Number.parseInt(v.slice(2), 16) >>> 0
  return {
    a: (u >>> 24) & 0xff,
    r: (u >>> 16) & 0xff,
    g: (u >>> 8) & 0xff,
    b: u & 0xff,
  }
}

function toCssRgba(v: string): string {
  const c = parseColorU32Hex(v)
  if (!c) return 'rgba(0,0,0,0)'
  const a = c.a / 255
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`
}

function toRgbPickerHex(v: string): string {
  const c = parseColorU32Hex(v)
  if (!c) return '#000000'
  const to2 = (n: number) => n.toString(16).padStart(2, '0')
  return `#${to2(c.r)}${to2(c.g)}${to2(c.b)}`
}

function composeColorFromRgb(args: { prev: string; rgbHex: string }): string {
  const prev = parseColorU32Hex(args.prev)
  const a = prev ? prev.a : 0xff
  const raw = args.rgbHex.trim().replace(/^#/, '')
  if (!/^[0-9A-Fa-f]{6}$/.test(raw)) return args.prev
  const r = Number.parseInt(raw.slice(0, 2), 16) & 0xff
  const g = Number.parseInt(raw.slice(2, 4), 16) & 0xff
  const b = Number.parseInt(raw.slice(4, 6), 16) & 0xff
  const u = (((a & 0xff) << 24) | (r << 16) | (g << 8) | b) >>> 0
  return `0x${u.toString(16).padStart(8, '0').toUpperCase()}`
}

function validateElementFile(args: {
  element: PackElementFile
  packId: string
  elementRefOptions: string[]
}): FieldErrors {
  const { element, packId, elementRefOptions } = args
  const errors: FieldErrors = {}

  const refSet = new Set(elementRefOptions)

  const suggestRefs = (shortKey: string): string[] => {
    const suffix = `:${shortKey}`
    const matches = elementRefOptions.filter((k) => k.endsWith(suffix))
    return matches.slice(0, 3)
  }

  const validateRef = (raw: string, field: string) => {
    const trimmed = raw.trim()
    if (trimmed.length === 0) {
      errors[field] = 'to is required'
      return
    }

    if (trimmed.includes(':')) {
      if (!refSet.has(trimmed)) {
        errors[field] = 'unknown element ref'
      }
      return
    }

    const normalized = `${packId}:${trimmed}`
    if (!refSet.has(normalized)) {
      const suggestions = suggestRefs(trimmed)
      if (suggestions.length > 0) {
        errors[field] = `unknown element ref (will resolve to ${normalized}). Did you mean ${suggestions.join(' or ')}?`
      } else {
        errors[field] = `unknown element ref (will resolve to ${normalized})`
      }
    }
  }

  if (element.id !== undefined) {
    if (!Number.isInteger(element.id)) errors.id = 'id must be integer'
    else if (element.id < 0 || element.id > 255) errors.id = 'id must be in range 0..255'
  }

  if (!element.key || element.key.length === 0) errors.key = 'key is required'

  if (!element.category || element.category.length === 0) errors.category = 'category is required'
  else if (!CATEGORY_OPTIONS.includes(element.category as Category)) errors.category = 'unknown category'

  if (!isColorU32Hex(element.color)) errors.color = 'color must match 0xAARRGGBB'

  // Engine expects density null ONLY for energy/utility/bio (normalized to 0.0).
  // For other categories it is a compile-time error.
  if (element.density === null) {
    if (!['energy', 'utility', 'bio'].includes(element.category)) {
      errors.density = 'density cannot be null for this category'
    }
  } else if (element.density !== 'Infinity') {
    if (typeof element.density !== 'number' || !Number.isFinite(element.density)) {
      errors.density = 'density must be number, Infinity, or null'
    }
  }

  if (typeof element.dispersion !== 'number' || !Number.isFinite(element.dispersion)) {
    errors.dispersion = 'dispersion must be number'
  } else if (!Number.isInteger(element.dispersion) || element.dispersion < 0 || element.dispersion > 255) {
    errors.dispersion = 'dispersion must be integer in range 0..255'
  }

  if (typeof element.lifetime !== 'number' || !Number.isFinite(element.lifetime)) {
    errors.lifetime = 'lifetime must be number'
  } else if (!Number.isInteger(element.lifetime) || element.lifetime < 0 || element.lifetime > 65535) {
    errors.lifetime = 'lifetime must be integer in range 0..65535'
  }

  if (typeof element.defaultTemp !== 'number' || !Number.isFinite(element.defaultTemp)) errors.defaultTemp = 'defaultTemp must be number'

  if (typeof element.heatConductivity !== 'number' || !Number.isFinite(element.heatConductivity)) {
    errors.heatConductivity = 'heatConductivity must be number'
  } else if (!Number.isInteger(element.heatConductivity) || element.heatConductivity < 0 || element.heatConductivity > 255) {
    errors.heatConductivity = 'heatConductivity must be integer in range 0..255'
  }

  if (element.bounce !== undefined && (typeof element.bounce !== 'number' || !Number.isFinite(element.bounce))) {
    errors.bounce = 'bounce must be number'
  } else if (typeof element.bounce === 'number' && (element.bounce < 0 || element.bounce > 1)) {
    errors.bounce = 'bounce must be in range 0..1'
  }
  if (element.friction !== undefined && (typeof element.friction !== 'number' || !Number.isFinite(element.friction))) {
    errors.friction = 'friction must be number'
  } else if (typeof element.friction === 'number' && (element.friction < 0 || element.friction > 1)) {
    errors.friction = 'friction must be in range 0..1'
  }

  if (element.behavior !== null && element.behavior !== undefined) {
    if (typeof element.behavior !== 'string') {
      errors.behavior = 'behavior must be string or null'
    } else if (element.behavior.length > 0 && !BEHAVIOR_OPTIONS.includes(element.behavior)) {
      errors.behavior = 'unknown behavior kind'
    }
  }

  const pc = element.phaseChange
  if (pc) {
    if (pc.high) {
      if (typeof pc.high.temp !== 'number' || !Number.isFinite(pc.high.temp)) errors['phaseChange.high.temp'] = 'temp must be number'
      validateRef(pc.high.to, 'phaseChange.high.to')
    }

    if (pc.low) {
      if (typeof pc.low.temp !== 'number' || !Number.isFinite(pc.low.temp)) errors['phaseChange.low.temp'] = 'temp must be number'
      validateRef(pc.low.to, 'phaseChange.low.to')
    }
  }

  if (element.ui) {
    if (!element.ui.category || element.ui.category.length === 0) errors['ui.category'] = 'ui.category is required'
    if (typeof element.ui.sort !== 'number' || !Number.isFinite(element.ui.sort)) errors['ui.sort'] = 'ui.sort must be number'
  }

  return errors
}

export function ElementEditor(args: {
  element: PackElementFile
  packId: string
  elementRefOptions: string[]
  onPatch: (patch: Partial<PackElementFile>) => void
}) {
  const { element, packId, elementRefOptions, onPatch } = args

  const [palette, setPalette] = useState<string[]>([])

  const addColorToPalette = useCallback(() => {
    const c = element.color
    if (!isColorU32Hex(c)) return
    setPalette((prev: string[]) => {
      const next = prev.filter((x) => x !== c)
      next.unshift(c)
      return next.slice(0, 16)
    })
  }, [element.color])

  const removeColorFromPalette = useCallback((c: string) => {
    setPalette((prev: string[]) => prev.filter((x) => x !== c))
  }, [])

  const datalistId = useId()

  const errors = useMemo(
    () => validateElementFile({ element, packId, elementRefOptions }),
    [element, elementRefOptions, packId]
  )

  const ui = element.ui ?? null
  const flags = element.flags ?? {}

  const inputBase = 'px-3 py-2 rounded-lg bg-black/30 border border-white/10 focus:outline-none focus:ring-2 focus:ring-purple-500/40'
  const inputMono = `${inputBase} font-mono`

  const fieldClass = (key: string, base: string) => {
    if (!errors[key]) return base
    return `${base} border-red-500/50 focus:ring-red-500/30`
  }

  const errorText = (key: string) => {
    const msg = errors[key]
    if (!msg) return null
    return <div className="text-xs text-red-300 mt-1">{msg}</div>
  }

  const errorEntries = Object.entries(errors)

  const applyPreset = (preset: {
    category: Category
    density: PackElementFile['density']
    dispersion: number
    heatConductivity: number
    flags: NonNullable<PackElementFile['flags']>
  }) => {
    onPatch({
      category: preset.category,
      density: preset.density,
      dispersion: preset.dispersion,
      heatConductivity: preset.heatConductivity,
      flags: {
        ...(element.flags ?? {}),
        ...preset.flags,
      },
    })
  }

  return (
    <div className="space-y-5">
      {errorEntries.length > 0 ? (
        <div className="rounded-xl border border-red-500/20 bg-red-950/20 p-4">
          <div className="text-sm font-semibold text-red-200">Validation errors ({errorEntries.length})</div>
          <div className="mt-2 space-y-1">
            {errorEntries.slice(0, 8).map(([k, v]) => (
              <div key={k} className="text-xs text-red-200">
                <span className="font-mono text-red-100">{k}</span>: {v}
              </div>
            ))}
            {errorEntries.length > 8 ? <div className="text-xs text-red-300">…and {errorEntries.length - 8} more</div> : null}
          </div>
        </div>
      ) : null}

      <div>
        <div className="text-xs text-gray-400">Key</div>
        <div className="text-sm font-mono">draft:{element.key}</div>
        {errorText('key')}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="text-sm font-semibold">Quick presets</div>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() =>
              applyPreset({
                category: 'solid',
                density: 2500,
                dispersion: 0,
                heatConductivity: 10,
                flags: { flammable: false, conductive: false, corrosive: false, hot: false, cold: false, ignoreGravity: false, rigid: true },
              })
            }
            className="px-3 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-sm"
          >
            Solid
          </button>
          <button
            onClick={() =>
              applyPreset({
                category: 'powder',
                density: 1600,
                dispersion: 0,
                heatConductivity: 15,
                flags: { flammable: false, conductive: false, corrosive: false, hot: false, cold: false, ignoreGravity: false, rigid: false },
              })
            }
            className="px-3 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-sm"
          >
            Powder
          </button>
          <button
            onClick={() =>
              applyPreset({
                category: 'liquid',
                density: 1000,
                dispersion: 0,
                heatConductivity: 20,
                flags: { flammable: false, conductive: false, corrosive: false, hot: false, cold: false, ignoreGravity: false, rigid: false },
              })
            }
            className="px-3 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-sm"
          >
            Liquid
          </button>
          <button
            onClick={() =>
              applyPreset({
                category: 'gas',
                density: 1,
                dispersion: 0,
                heatConductivity: 10,
                flags: { flammable: false, conductive: false, corrosive: false, hot: false, cold: false, ignoreGravity: false, rigid: false },
              })
            }
            className="px-3 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-sm"
          >
            Gas
          </button>
          <button
            onClick={() =>
              applyPreset({
                category: 'energy',
                density: null,
                dispersion: 0,
                heatConductivity: 0,
                flags: { flammable: false, conductive: false, corrosive: false, hot: false, cold: false, ignoreGravity: true, rigid: false },
              })
            }
            className="px-3 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-sm"
          >
            Energy
          </button>
          <button
            onClick={() =>
              applyPreset({
                category: 'utility',
                density: null,
                dispersion: 0,
                heatConductivity: 0,
                flags: { flammable: false, conductive: false, corrosive: false, hot: false, cold: false, ignoreGravity: true, rigid: false },
              })
            }
            className="px-3 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-sm"
          >
            Utility
          </button>
          <button
            onClick={() =>
              applyPreset({
                category: 'bio',
                density: null,
                dispersion: 0,
                heatConductivity: 0,
                flags: { flammable: false, conductive: false, corrosive: false, hot: false, cold: false, ignoreGravity: false, rigid: false },
              })
            }
            className="px-3 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-sm"
          >
            Bio
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Id (optional)</span>
          <input
            type="number"
            value={element.id ?? ''}
            onChange={(e) => {
              const raw = e.target.value
              if (raw.trim().length === 0) return onPatch({ id: undefined })
              const n = Number(raw)
              if (!Number.isFinite(n)) return
              onPatch({ id: Math.floor(n) })
            }}
            className={fieldClass('id', inputMono)}
            placeholder="0..255"
          />
          {errorText('id')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Category</span>
          <select
            value={element.category}
            onChange={(e) => onPatch({ category: e.target.value })}
            className={fieldClass('category', inputBase)}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {errorText('category')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Color (0xAARRGGBB)</span>
          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-lg border border-white/10 bg-black/30"
              style={{ backgroundColor: toCssRgba(element.color) }}
              title={element.color}
            />
            <input
              value={element.color}
              onChange={(e) => onPatch({ color: e.target.value })}
              className={fieldClass('color', inputMono)}
            />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <input
              type="color"
              value={toRgbPickerHex(element.color)}
              onChange={(e) => onPatch({ color: composeColorFromRgb({ prev: element.color, rgbHex: e.target.value }) })}
              className="h-9 w-12 rounded-lg border border-white/10 bg-black/30"
              title="Pick RGB (alpha preserved)"
            />
            <button
              type="button"
              onClick={addColorToPalette}
              className="px-3 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-xs"
              title="Save to palette"
            >
              Save
            </button>
          </div>

          {palette.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-2">
              {palette.map((c) => (
                <div key={c} className="relative">
                  <button
                    type="button"
                    onClick={() => onPatch({ color: c })}
                    className="w-9 h-9 rounded-lg border border-white/10"
                    style={{ backgroundColor: toCssRgba(c) }}
                    title={c}
                  />
                  <button
                    type="button"
                    onClick={() => removeColorFromPalette(c)}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/80 border border-white/10 text-[10px] leading-5 text-center hover:bg-black"
                    title="Remove from palette"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {errorText('color')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Density</span>
          <div className="flex items-center gap-2">
            <input
              value={element.density === null ? '' : String(element.density)}
              onChange={(e) => {
                const raw = e.target.value.trim()
                if (raw.length === 0) return onPatch({ density: null })
                if (raw === 'Infinity') return onPatch({ density: 'Infinity' })
                const n = Number(raw)
                if (!Number.isFinite(n)) return
                onPatch({ density: n })
              }}
              className={fieldClass('density', inputMono)}
              placeholder="number | Infinity | empty"
            />
            <button
              type="button"
              onClick={() => onPatch({ density: 'Infinity' })}
              className="px-2 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-xs font-mono"
              title="Set Infinity"
            >
              ∞
            </button>
            <button
              type="button"
              onClick={() => onPatch({ density: null })}
              className="px-2 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-xs font-mono"
              title="Set null"
            >
              null
            </button>
          </div>
          {errorText('density')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Dispersion</span>
          <input
            type="number"
            value={element.dispersion}
            onChange={(e) => onPatch({ dispersion: Number(e.target.value) })}
            className={fieldClass('dispersion', inputMono)}
          />
          {errorText('dispersion')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Lifetime</span>
          <input
            type="number"
            value={element.lifetime}
            onChange={(e) => onPatch({ lifetime: Number(e.target.value) })}
            className={fieldClass('lifetime', inputMono)}
          />
          {errorText('lifetime')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Default temp</span>
          <input
            type="number"
            value={element.defaultTemp}
            onChange={(e) => onPatch({ defaultTemp: Number(e.target.value) })}
            className={fieldClass('defaultTemp', inputMono)}
          />
          {errorText('defaultTemp')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Heat conductivity</span>
          <input
            type="number"
            value={element.heatConductivity}
            onChange={(e) => onPatch({ heatConductivity: Number(e.target.value) })}
            className={fieldClass('heatConductivity', inputMono)}
          />
          {errorText('heatConductivity')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Bounce (optional)</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={element.bounce ?? ''}
            onChange={(e) => {
              const raw = e.target.value
              if (raw.trim().length === 0) return onPatch({ bounce: undefined })
              const n = Number(raw)
              if (!Number.isFinite(n)) return
              onPatch({ bounce: n })
            }}
            className={fieldClass('bounce', inputMono)}
          />
          {errorText('bounce')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Friction (optional)</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={element.friction ?? ''}
            onChange={(e) => {
              const raw = e.target.value
              if (raw.trim().length === 0) return onPatch({ friction: undefined })
              const n = Number(raw)
              if (!Number.isFinite(n)) return
              onPatch({ friction: n })
            }}
            className={fieldClass('friction', inputMono)}
          />
          {errorText('friction')}
        </label>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="text-sm font-semibold">Flags</div>
        <div className="grid grid-cols-2 gap-2">
          {([
            'flammable',
            'conductive',
            'corrosive',
            'hot',
            'cold',
            'ignoreGravity',
            'rigid',
          ] as const).map((k) => (
            <label key={k} className="inline-flex items-center gap-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={!!(flags as any)[k]}
                onChange={(e) => onPatch({ flags: { ...flags, [k]: e.target.checked } })}
              />
              {k}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Behavior</span>
          <select
            value={element.behavior ?? ''}
            onChange={(e) => onPatch({ behavior: e.target.value.length === 0 ? null : e.target.value })}
            className={fieldClass('behavior', inputBase)}
          >
            {BEHAVIOR_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v.length === 0 ? '(none)' : v}
              </option>
            ))}
          </select>
          {errorText('behavior')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Hidden</span>
          <div className="h-10 flex items-center">
            <input type="checkbox" checked={!!element.hidden} onChange={(e) => onPatch({ hidden: e.target.checked })} />
          </div>
        </label>
      </div>

      <datalist id={datalistId}>
        {elementRefOptions.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Phase Change</div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              checked={element.phaseChange !== null}
              onChange={(e) => onPatch({ phaseChange: e.target.checked ? {} : null })}
            />
            Enabled
          </label>
        </div>

        {element.phaseChange ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">High temp</span>
                <input
                  type="number"
                  value={element.phaseChange.high?.temp ?? ''}
                  onChange={(e) => {
                    const temp = Number(e.target.value)
                    if (!Number.isFinite(temp)) return
                    onPatch({
                      phaseChange: {
                        ...(element.phaseChange ?? {}),
                        high: { temp, to: element.phaseChange?.high?.to ?? 'base:empty' },
                      },
                    })
                  }}
                  className={fieldClass('phaseChange.high.temp', inputMono)}
                  placeholder="temp"
                />
                {errorText('phaseChange.high.temp')}
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">High → to</span>
                <input
                  value={element.phaseChange.high?.to ?? ''}
                  onChange={(e) => {
                    const to = e.target.value
                    if (to.trim().length === 0) {
                      onPatch({ phaseChange: { ...(element.phaseChange ?? {}), high: null } })
                      return
                    }
                    const temp = element.phaseChange?.high?.temp ?? 0
                    onPatch({ phaseChange: { ...(element.phaseChange ?? {}), high: { temp, to } } })
                  }}
                  list={datalistId}
                  className={fieldClass('phaseChange.high.to', inputMono)}
                  placeholder="base:water or water"
                />
                {errorText('phaseChange.high.to')}
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">Low temp</span>
                <input
                  type="number"
                  value={element.phaseChange.low?.temp ?? ''}
                  onChange={(e) => {
                    const temp = Number(e.target.value)
                    if (!Number.isFinite(temp)) return
                    onPatch({
                      phaseChange: {
                        ...(element.phaseChange ?? {}),
                        low: { temp, to: element.phaseChange?.low?.to ?? 'base:empty' },
                      },
                    })
                  }}
                  className={fieldClass('phaseChange.low.temp', inputMono)}
                  placeholder="temp"
                />
                {errorText('phaseChange.low.temp')}
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">Low → to</span>
                <input
                  value={element.phaseChange.low?.to ?? ''}
                  onChange={(e) => {
                    const to = e.target.value
                    if (to.trim().length === 0) {
                      onPatch({ phaseChange: { ...(element.phaseChange ?? {}), low: null } })
                      return
                    }
                    const temp = element.phaseChange?.low?.temp ?? 0
                    onPatch({ phaseChange: { ...(element.phaseChange ?? {}), low: { temp, to } } })
                  }}
                  list={datalistId}
                  className={fieldClass('phaseChange.low.to', inputMono)}
                  placeholder="base:ice or ice"
                />
                {errorText('phaseChange.low.to')}
              </label>
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-400">Disabled</div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">UI</div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              checked={ui !== null}
              onChange={(e) =>
                onPatch({
                  ui: e.target.checked
                    ? {
                        category: 'draft',
                        displayName: element.key,
                        description: '',
                        sort: 0,
                        hidden: false,
                      }
                    : null,
                })
              }
            />
            Enabled
          </label>
        </div>

        {ui ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">UI category</span>
              <input
                value={ui.category}
                onChange={(e) => onPatch({ ui: { ...ui, category: e.target.value } })}
                className={fieldClass('ui.category', inputBase)}
              />
              {errorText('ui.category')}
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">Display name</span>
              <input
                value={ui.displayName ?? ''}
                onChange={(e) => onPatch({ ui: { ...ui, displayName: e.target.value } })}
                className={inputBase}
              />
            </label>

            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-xs text-gray-400">Description</span>
              <textarea
                value={ui.description ?? ''}
                onChange={(e) => onPatch({ ui: { ...ui, description: e.target.value } })}
                className={`${inputBase} min-h-20`}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">Sort</span>
              <input
                type="number"
                value={ui.sort ?? 0}
                onChange={(e) => onPatch({ ui: { ...ui, sort: Number(e.target.value) } })}
                className={fieldClass('ui.sort', inputMono)}
              />
              {errorText('ui.sort')}
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">UI hidden</span>
              <div className="h-10 flex items-center">
                <input type="checkbox" checked={!!ui.hidden} onChange={(e) => onPatch({ ui: { ...ui, hidden: e.target.checked } })} />
              </div>
            </label>
          </div>
        ) : (
          <div className="text-xs text-gray-400">Disabled</div>
        )}
      </div>
    </div>
  )
}
