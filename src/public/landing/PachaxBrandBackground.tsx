interface PachaxBrandBackgroundProps {
  activeIndex?: number
}

/**
 * PachaxBrandBackground
 * 
 * Fondo arquitectónico de identidad visual para PACHAX Platform.
 * Inspirado directamente en el lenguaje geométrico del isotipo PACHAX y atmósfera portal:
 * - Retícula técnica blueprint de precisión extremadamente tenue.
 * - Grandes trazos angulares y chevrons diagonales abstractos a 55 grados.
 * - Portal atmosférico con volumetría azul profunda (navy #030C1A, PACHAX blue #0066FF, celeste #0284C7).
 * - Totalmente sobrio, elegante, sin blobs genéricos de IA, respetando prefers-reduced-motion.
 */
export function PachaxBrandBackground({ activeIndex = 0 }: PachaxBrandBackgroundProps) {
  // Desplazamiento sutil del gradiente ambiental según el índice activo (-10px a +10px)
  const shiftX = (activeIndex - 2) * 12

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none bg-[#FAF9F6]"
    >
      {/* 1. Portal Volumétrico Superior Central (Profundidad azul tecnológica) */}
      <div
        className="absolute -top-[20%] left-1/2 w-[1100px] h-[680px] -translate-x-1/2 rounded-full blur-[150px] opacity-45 transition-transform duration-700 ease-out motion-reduce:transition-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0, 102, 255, 0.22) 0%, rgba(2, 132, 199, 0.12) 40%, rgba(9, 23, 40, 0.05) 70%, transparent 85%)',
          transform: `translateX(calc(-50% + ${shiftX}px))`,
        }}
      />

      {/* Resplandor lateral derecho para balance compositivo */}
      <div
        className="absolute top-[35%] -right-[12%] w-[700px] h-[700px] rounded-full blur-[170px] opacity-30"
        style={{
          background: 'radial-gradient(circle, rgba(2, 132, 199, 0.18) 0%, rgba(0, 102, 255, 0.08) 50%, transparent 75%)',
        }}
      />

      {/* Resplandor inferior izquierdo para fluidez en scroll */}
      <div
        className="absolute bottom-[8%] -left-[12%] w-[800px] h-[800px] rounded-full blur-[190px] opacity-25"
        style={{
          background: 'radial-gradient(circle, rgba(0, 102, 255, 0.15) 0%, rgba(9, 23, 40, 0.04) 60%, transparent 80%)',
        }}
      />

      {/* 2. Retícula técnica blueprint de precisión geométrica */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.038]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="pachax-grid-pattern"
            width="64"
            height="64"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 64 0 L 0 0 0 64"
              fill="none"
              stroke="#091728"
              strokeWidth="0.75"
            />
            {/* Pequeña cruz de intersección técnica */}
            <circle cx="0" cy="0" r="1.5" fill="#0066FF" opacity="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#pachax-grid-pattern)" />
      </svg>

      {/* 3. Trazos geométricos diagonales y fragmentos abstractos del chevron PACHAX */}
      <svg
        className="absolute inset-0 w-full h-full overflow-visible"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="pachax-chevron-line-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0066FF" stopOpacity="0.0" />
            <stop offset="35%" stopColor="#0066FF" stopOpacity="0.14" />
            <stop offset="70%" stopColor="#091728" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#091728" stopOpacity="0.0" />
          </linearGradient>

          <linearGradient id="pachax-chevron-solid-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0066FF" stopOpacity="0.025" />
            <stop offset="50%" stopColor="#0284C7" stopOpacity="0.045" />
            <stop offset="100%" stopColor="#091728" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Gran chevron abstracto superior derecho */}
        <path
          d="M 950 -80 L 1280 280 L 1190 340 L 910 20 Z"
          fill="url(#pachax-chevron-solid-grad)"
          className="motion-safe:animate-[pulse_10s_ease-in-out_infinite]"
        />
        <path
          d="M 1080 -120 L 1450 300 L 1360 360 L 1040 -20 Z"
          stroke="url(#pachax-chevron-line-grad)"
          strokeWidth="1.25"
          fill="none"
          strokeDasharray="8 6"
        />

        {/* Líneas angulares técnicas laterales (a 55 grados) */}
        <line
          x1="-100"
          y1="380"
          x2="550"
          y2="-60"
          stroke="url(#pachax-chevron-line-grad)"
          strokeWidth="1"
        />
        <line
          x1="-50"
          y1="440"
          x2="600"
          y2="0"
          stroke="url(#pachax-chevron-line-grad)"
          strokeWidth="0.75"
        />
        <line
          x1="800"
          y1="950"
          x2="1550"
          y2="50"
          stroke="url(#pachax-chevron-line-grad)"
          strokeWidth="1"
        />

        {/* Chevron inferior izquierdo */}
        <path
          d="M -120 780 L 220 540 L 290 600 L -20 860 Z"
          fill="url(#pachax-chevron-solid-grad)"
        />
        <path
          d="M -60 840 L 280 600"
          stroke="#0066FF"
          strokeOpacity="0.1"
          strokeWidth="1"
        />
      </svg>
    </div>
  )
}
