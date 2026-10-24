import { useEffect, useRef, useState } from 'react'

/** Keeps an editable number as text until blur so controlled numeric fields can be cleared. */
export function NightclubNumberInput({ value, onChange, min = 0, max, step = 1, className, ...props }: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'>) {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(String(value))
  }, [value])

  const normalize = (raw: string) => {
    const parsed = Number(raw)
    let next = Number.isFinite(parsed) ? parsed : min
    next = Math.max(min, max === undefined ? next : Math.min(max, next))
    const decimals = Math.max(0, (String(step).split('.')[1] || '').length)
    const units = Math.round((next - min) / step)
    next = min + units * step
    next = Math.max(min, max === undefined ? next : Math.min(max, next))
    return Number(next.toFixed(Math.min(decimals + 2, 10)))
  }

  return <input
    {...props}
    type="number"
    min={min}
    max={max}
    step={step}
    value={text}
    className={className}
    onFocus={event => { focused.current = true; props.onFocus?.(event) }}
    onChange={event => {
      const raw = event.target.value
      setText(raw)
      if (raw !== '' && Number.isFinite(Number(raw))) onChange(Number(raw))
    }}
    onBlur={event => {
      focused.current = false
      const next = normalize(text)
      setText(String(next))
      onChange(next)
      props.onBlur?.(event)
    }}
  />
}
