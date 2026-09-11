import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: 'primary' | 'secondary' | 'ghost' | 'success'
    size?: 'sm' | 'md' | 'lg'
    fullWidth?: boolean
  }
>

const toneClasses = {
  primary: 'bg-accent text-white shadow-lg shadow-accent/15 hover:bg-accentStrong active:translate-y-px',
  secondary: 'bg-white text-ink ring-1 ring-line shadow-insetSoft hover:bg-accentWash active:translate-y-px',
  ghost: 'bg-transparent text-muted hover:bg-white/70 hover:text-ink active:translate-y-px',
  success: 'bg-success text-white shadow-lg shadow-success/15 hover:bg-[#315941] active:translate-y-px',
}

const sizeClasses = {
  sm: 'h-10 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-14 px-5 text-base',
}

export function Button({
  children,
  className = '',
  tone = 'primary',
  size = 'md',
  fullWidth,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50',
        toneClasses[tone],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}
