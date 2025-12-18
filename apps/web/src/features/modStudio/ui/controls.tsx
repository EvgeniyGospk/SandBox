import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

export type ModSelectOption<T extends string> = {
  value: T
  label: string
  disabled?: boolean
}

export function ModSelect<T extends string>(args: {
  value: T
  options: ReadonlyArray<ModSelectOption<T>>
  placeholder?: string
  onChange: (value: T) => void
  className?: string
  buttonClassName?: string
  menuClassName?: string
  disabled?: boolean
}) {
  const { value, options, placeholder, onChange, className, buttonClassName, menuClassName, disabled } = args

  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value])

  const close = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
  }, [])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current
      if (!root) return
      if (e.target instanceof Node && root.contains(e.target)) return
      close()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [close, open])

  useEffect(() => {
    if (!open) return
    const idx = options.findIndex((o) => o.value === value)
    setActiveIndex(idx)
  }, [open, options, value])

  const selectIndex = useCallback(
    (idx: number) => {
      const opt = options[idx]
      if (!opt || opt.disabled) return
      onChange(opt.value)
      close()
    },
    [close, onChange, options]
  )

  const onButtonKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return

      if (!open) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setOpen(true)
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          setOpen(true)
        }
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((prev) => Math.min(options.length - 1, prev < 0 ? 0 : prev + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((prev) => Math.max(0, prev < 0 ? 0 : prev - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (activeIndex >= 0) selectIndex(activeIndex)
      }
    },
    [activeIndex, disabled, open, options.length, selectIndex]
  )

  const displayLabel = selected?.label ?? placeholder ?? ''
  const buttonLayoutClass = 'flex items-center justify-between gap-2 min-w-0'

  return (
    <div ref={rootRef} className={className ?? 'relative'}>
      <button
        type="button"
        data-typing-target="true"
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          setOpen((v) => !v)
        }}
        onKeyDown={onButtonKeyDown}
        className={`${
          buttonClassName ??
          'w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 focus:outline-none focus:ring-2 focus:ring-purple-500/40 text-left'
        } ${buttonLayoutClass}`}
      >
        <span className={`min-w-0 truncate ${selected ? 'text-white' : 'text-gray-400'}`}>{displayLabel}</span>
        <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div
          role="listbox"
          className={
            menuClassName ??
            'absolute z-50 mt-2 w-full rounded-xl border border-white/10 bg-[#0F0F0F] shadow-2xl overflow-hidden'
          }
        >
          <div className="max-h-64 overflow-auto p-1">
            {options.map((o, idx) => {
              const isSelected = o.value === value
              const isActive = idx === activeIndex
              const isDisabled = !!o.disabled
              return (
                <button
                  type="button"
                  data-typing-target="true"
                  key={o.value}
                  disabled={isDisabled}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => selectIndex(idx)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isDisabled
                      ? 'opacity-50 cursor-not-allowed'
                      : isActive
                        ? 'bg-purple-600/25 border border-purple-500/30'
                        : 'hover:bg-white/5'
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {isSelected ? <Check size={16} className="text-purple-300" /> : <span className="w-4" />}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function ModCheckbox(args: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  className?: string
  boxClassName?: string
}) {
  const { checked, onCheckedChange, label, disabled, className, boxClassName } = args

  return (
    <button
      type="button"
      data-typing-target="true"
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        onCheckedChange(!checked)
      }}
      className={
        className ??
        `inline-flex items-center gap-2 text-sm transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'text-gray-200'}`
      }
    >
      <span
        className={
          boxClassName ??
          `w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
            checked ? 'bg-purple-600/30 border-purple-500/50' : 'bg-black/30 border-white/10'
          }`
        }
      >
        {checked ? <Check size={14} className="text-purple-200" /> : null}
      </span>
      {label ? <span className="select-none">{label}</span> : null}
    </button>
  )
}

export function ModToggle(args: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  className?: string
}) {
  const { checked, onCheckedChange, label, disabled, className } = args

  return (
    <button
      type="button"
      data-typing-target="true"
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        onCheckedChange(!checked)
      }}
      className={
        className ??
        `inline-flex items-center gap-2 text-sm transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'text-gray-200'}`
      }
    >
      <span
        className={`w-10 h-6 rounded-full border transition-colors relative ${
          checked ? 'bg-purple-600/30 border-purple-500/50' : 'bg-black/30 border-white/10'
        }`}
      >
        <span
          className={`absolute left-1 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white/80 transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
      {label ? <span className="select-none">{label}</span> : null}
    </button>
  )
}

export function ModSlider(args: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  className?: string
}) {
  const { value, min, max, step, onChange, className } = args

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={
        className ??
        'w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500/30 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-purple-200/30 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-purple-400 [&::-moz-range-thumb]:border-0'
      }
    />
  )
}
