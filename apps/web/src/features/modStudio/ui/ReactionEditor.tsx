import { useId, useMemo } from 'react'

import type { PackReactionFile } from '@/features/simulation/content/compilePacksToBundle'

type FieldErrors = Record<string, string>

function validateReactionFile(args: {
  reaction: PackReactionFile
  packId: string
  elementRefOptions: string[]
}): FieldErrors {
  const { reaction, packId, elementRefOptions } = args
  const errors: FieldErrors = {}

  const refSet = new Set(elementRefOptions)

  const suggestRefs = (shortKey: string): string[] => {
    const suffix = `:${shortKey}`
    const matches = elementRefOptions.filter((k) => k.endsWith(suffix))
    return matches.slice(0, 3)
  }

  const validateRequiredRef = (raw: string, field: string) => {
    const trimmed = raw.trim()
    if (trimmed.length === 0) {
      errors[field] = 'required'
      return
    }

    if (trimmed.includes(':')) {
      if (!refSet.has(trimmed)) errors[field] = 'unknown element ref'
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

  const validateOptionalRef = (raw: string | null, field: string) => {
    if (raw === null) return
    validateRequiredRef(raw, field)
  }

  if (!reaction.id || reaction.id.trim().length === 0) errors.id = 'id is required'

  validateRequiredRef(reaction.aggressor, 'aggressor')
  validateRequiredRef(reaction.victim, 'victim')
  validateOptionalRef(reaction.resultAggressor, 'resultAggressor')
  validateOptionalRef(reaction.resultVictim, 'resultVictim')
  validateOptionalRef(reaction.spawn, 'spawn')

  if (typeof reaction.chance !== 'number' || !Number.isFinite(reaction.chance)) {
    errors.chance = 'chance must be a number'
  } else if (reaction.chance < 0 || reaction.chance > 1) {
    errors.chance = 'chance must be in range 0..1'
  }

  return errors
}

export function ReactionEditor(args: {
  reaction: PackReactionFile
  packId: string
  elementRefOptions: string[]
  onPatch: (patch: Partial<PackReactionFile>) => void
  onTest?: {
    clear: () => void
    spawnAggressor: () => void
    spawnVictim: () => void
    spawnBoth: () => void
  }
}) {
  const { reaction, packId, elementRefOptions, onPatch, onTest } = args

  const datalistId = useId()

  const errors = useMemo(
    () => validateReactionFile({ reaction, packId, elementRefOptions }),
    [elementRefOptions, packId, reaction]
  )

  const errorEntries = Object.entries(errors)

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

  return (
    <div className="space-y-5">
      {onTest ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold mb-2">Test in preview</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onTest.clear()}
              className="px-3 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-sm"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => onTest.spawnBoth()}
              className="px-3 py-2 rounded-lg bg-purple-600/25 hover:bg-purple-600/35 border border-purple-500/40 text-sm"
            >
              Spawn both
            </button>
            <button
              type="button"
              onClick={() => onTest.spawnAggressor()}
              className="px-3 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-sm"
            >
              Spawn aggressor
            </button>
            <button
              type="button"
              onClick={() => onTest.spawnVictim()}
              className="px-3 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-sm"
            >
              Spawn victim
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            The preview must have the applied bundle loaded (Auto-apply or Apply).
          </div>
        </div>
      ) : null}

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
        <div className="text-xs text-gray-400">Id</div>
        <div className="text-sm font-mono">{packId}:{reaction.id}</div>
        {errorText('id')}
      </div>

      <datalist id={datalistId}>
        {elementRefOptions.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Aggressor</span>
          <input
            value={reaction.aggressor}
            onChange={(e) => onPatch({ aggressor: e.target.value })}
            list={datalistId}
            className={fieldClass('aggressor', inputMono)}
            placeholder="base:water or water"
          />
          {errorText('aggressor')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Victim</span>
          <input
            value={reaction.victim}
            onChange={(e) => onPatch({ victim: e.target.value })}
            list={datalistId}
            className={fieldClass('victim', inputMono)}
            placeholder="base:lava or lava"
          />
          {errorText('victim')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Result aggressor</span>
          <div className="flex items-center gap-2">
            <input
              value={reaction.resultAggressor ?? ''}
              onChange={(e) => {
                const raw = e.target.value
                onPatch({ resultAggressor: raw.trim().length === 0 ? null : raw })
              }}
              list={datalistId}
              className={fieldClass('resultAggressor', inputMono)}
              placeholder="(empty = unchanged)"
            />
            <button
              type="button"
              onClick={() => onPatch({ resultAggressor: null })}
              className="px-2 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-xs"
              title="Unchanged"
            >
              null
            </button>
          </div>
          {errorText('resultAggressor')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Result victim</span>
          <div className="flex items-center gap-2">
            <input
              value={reaction.resultVictim ?? ''}
              onChange={(e) => {
                const raw = e.target.value
                onPatch({ resultVictim: raw.trim().length === 0 ? null : raw })
              }}
              list={datalistId}
              className={fieldClass('resultVictim', inputMono)}
              placeholder="(empty = destroy)"
            />
            <button
              type="button"
              onClick={() => onPatch({ resultVictim: null })}
              className="px-2 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-xs"
              title="Destroy (base:empty)"
            >
              null
            </button>
          </div>
          {errorText('resultVictim')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Spawn</span>
          <div className="flex items-center gap-2">
            <input
              value={reaction.spawn ?? ''}
              onChange={(e) => {
                const raw = e.target.value
                onPatch({ spawn: raw.trim().length === 0 ? null : raw })
              }}
              list={datalistId}
              className={fieldClass('spawn', inputMono)}
              placeholder="(optional)"
            />
            <button
              type="button"
              onClick={() => onPatch({ spawn: null })}
              className="px-2 py-2 rounded-lg bg-black/20 hover:bg-white/5 border border-white/10 text-xs"
              title="No spawn"
            >
              null
            </button>
          </div>
          {errorText('spawn')}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Chance</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={reaction.chance}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (!Number.isFinite(n)) return
              onPatch({ chance: n })
            }}
            className={fieldClass('chance', inputMono)}
          />
          {errorText('chance')}
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-400">Comment</span>
        <textarea
          value={reaction.comment ?? ''}
          onChange={(e) => onPatch({ comment: e.target.value })}
          className={`${inputBase} min-h-20`}
        />
      </label>

      <div className="text-xs text-gray-400">
        Hint: refs without prefix will resolve to <span className="font-mono">{packId}:name</span>.
      </div>
    </div>
  )
}
