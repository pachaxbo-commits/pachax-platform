import React from 'react'

export interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'dark' | 'light'
  href?: string
  className?: string
  subtitle?: string
  showTagline?: boolean
  onClick?: (e: React.MouseEvent<HTMLAnchorElement | HTMLDivElement>) => void
}

/**
 * BrandMark - Identidad visual provisional de PACHAX.
 *
 * NOTA DE ARQUITECTURA:
 * PACHAX aún no tiene un logo ni isotipo definitivo.
 * Este componente encapsula exclusivamente el wordmark tipográfico provisional
 * para que en el futuro sea reemplazado por <PachaxLogo /> en un único punto
 * sin alterar la estructura de Header, Login, Register, Demo o Landing.
 */
export function BrandMark({
  size = 'md',
  variant = 'dark',
  href = '/',
  className = '',
  subtitle,
  showTagline = false,
  onClick,
}: BrandMarkProps) {
  const sizeClasses = {
    sm: 'text-base tracking-[0.16em]',
    md: 'text-xl tracking-[0.18em]',
    lg: 'text-2xl tracking-[0.20em]',
    xl: 'text-3xl sm:text-4xl tracking-[0.22em]',
  }[size]

  const colorClass = variant === 'light' ? 'text-white' : 'text-slate-950'

  const content = (
    <div className={`inline-flex flex-col select-none ${className}`}>
      <div className="flex items-center gap-1.5">
        <span
          className={`font-black uppercase ${colorClass} font-sans transition-colors ${sizeClasses}`}
        >
          PACHAX
        </span>
      </div>
      {subtitle && (
        <span className="text-[10px] font-medium tracking-normal text-slate-400 -mt-0.5">
          {subtitle}
        </span>
      )}
      {showTagline && !subtitle && (
        <span className="text-[10px] font-medium tracking-wide uppercase text-slate-400 -mt-0.5">
          Software Empresarial
        </span>
      )}
    </div>
  )

  if (href) {
    return (
      <a
        href={href}
        onClick={onClick}
        className="inline-flex items-center no-underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-900 rounded-md transition-opacity hover:opacity-90"
        aria-label="PACHAX Inicio"
      >
        {content}
      </a>
    )
  }

  return (
    <div onClick={onClick} className="inline-flex items-center">
      {content}
    </div>
  )
}
