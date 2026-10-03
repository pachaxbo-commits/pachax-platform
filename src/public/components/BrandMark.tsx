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
 * BrandMark - Identidad Oficial de PACHAX Platform.
 * 
 * Utiliza exactamente el logotipo oficial de producto (Imagen 1)
 * con el canvas transparente recortado para máxima nitidez y presencia.
 * Mantiene la relación de aspecto exacta con object-fit: contain.
 */
export function BrandMark({
  size = 'md',
  variant = 'dark',
  href = '/',
  className = '',
  onClick,
}: BrandMarkProps) {
  const sizeClass = {
    sm: 'h-5 sm:h-7 w-auto max-w-[95px] sm:max-w-[120px]',
    md: 'h-6 sm:h-8.5 w-auto max-w-[112px] sm:max-w-[175px]',
    lg: 'h-7 sm:h-10 w-auto max-w-[130px] sm:max-w-[200px]',
    xl: 'h-9 sm:h-12 w-auto max-w-[160px] sm:max-w-[240px]',
  }[size]

  const filterClass = variant === 'light' ? 'brightness-0 invert' : ''

  const content = (
    <div className={`inline-flex items-center select-none ${className}`}>
      <img
        src="/brand/pachax-platform-logo.png"
        alt="PACHAX Platform"
        className={`${sizeClass} object-contain transition-transform duration-150 ${filterClass}`}
        style={{ aspectRatio: '895 / 205' }}
        loading="eager"
        decoding="async"
      />
    </div>
  )

  if (href) {
    return (
      <a
        href={href}
        onClick={onClick}
        className="inline-flex items-center no-underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#0066FF] rounded-md transition-opacity hover:opacity-95"
        aria-label="PACHAX Platform Inicio"
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
