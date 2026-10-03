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
 * Utiliza exactamente el asset oficial de producto (Imagen 1)
 * con object-fit: contain y conservación estricta de relación de aspecto 3:1.
 * 
 * Preparado arquitectónicamente para sustituir el origen del asset por SVG
 * en el futuro sin alterar consumidores ni la estructura del Header.
 */
export function BrandMark({
  size = 'md',
  variant = 'dark',
  href = '/',
  className = '',
  onClick,
}: BrandMarkProps) {
  // Dimensiones calculadas manteniendo el aspect ratio nativo (3.003 : 1)
  const sizeClass = {
    sm: 'h-6 sm:h-7 w-auto max-w-[95px] sm:max-w-[110px]',
    md: 'h-7 sm:h-9 w-auto max-w-[115px] sm:max-w-[155px]',
    lg: 'h-8 sm:h-10 w-auto max-w-[140px] sm:max-w-[175px]',
    xl: 'h-10 sm:h-12 w-auto max-w-[170px] sm:max-w-[210px]',
  }[size]

  // En fondos oscuros se aplica una ligera luminosidad si es variante 'light'
  const filterClass = variant === 'light' ? 'brightness-0 invert' : ''

  const content = (
    <div className={`inline-flex items-center select-none ${className}`}>
      <img
        src="/brand/pachax-platform-logo.png"
        alt="PACHAX Platform"
        className={`${sizeClass} object-contain transition-transform duration-150 ${filterClass}`}
        style={{ aspectRatio: '1024 / 341' }}
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
