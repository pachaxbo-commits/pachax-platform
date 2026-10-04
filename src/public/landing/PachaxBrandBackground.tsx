interface PachaxBrandBackgroundProps {
  activeIndex?: number
}

/**
 * PachaxBrandBackground
 * 
 * Fondo arquitectónico de identidad visual para PACHAX Platform.
 * Inspirado directamente en el lenguaje geométrico del isotipo PACHAX:
 * - Retícula técnica de precisión extremadamente tenue.
 * - Grandes trazos angulares y chevrons diagonales abstractos a 55 grados.
 * - Luz ambiental sutil que acompaña con suavidad la vitrina central.
 * - Totalmente sobrio: paleta white/off-white, navy, PACHAX blue y slate suave.
 * - Sin blobs genéricos, sin efectos de arcoíris, respetando prefers-reduced-motion.
 */
export function PachaxBrandBackground({ activeIndex = 0 }: PachaxBrandBackgroundProps) {
  // Desplazamiento sutil del gradiente ambiental según el índice activo (-10px a +10px)
  const shiftX = (activeIndex - 2) * 8

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none bg-[#FAF9F6]"
    >
      {/* 1. Resplandores ambientales técnicos muy suaves */}
      <div
        className="absolute -top-[15%] left-1/2 w-[900px] h-[550px] -translate-x-1/2 rounded-full blur-[140px] opacity-40 transition-transform duration-700 ease-out motion-reduce:transition-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0, 102, 255, 0.18) 0%, rgba(9, 23, 40, 0.04) 65%, transparent 80%)',
          transform: `translateX(calc(-50% + ${shiftX}px))`,
        }}
      />
      <div
        className="absolute top-[40%] -right-[10%] w-[600px] h-[600px] rounded-full blur-[160px] opacity-25"
        style={{
          background: 'radial-gradient(circle, rgba(2, 132, 199, 0.15) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute bottom-[10%] -left-[10%] w-[700px] h-[700px] rounded-full blur-[180px] opacity-20"
        style={{
          background: 'radial-gradient(circle, rgba(0, 102, 255, 0.12) 0%, transparent 70%)',
        }}
      />

      {/* 2. Retícula técnica de precisión geométrica (Blueprint tenue) */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.035]"
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
            {/* Pequeña cruz de intersección */}
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
            <stop offset="35%" stopColor="#0066FF" stopOpacity="0.12" />
            <stop offset="70%" stopColor="#091728" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#091728" stopOpacity="0.0" />
          </linearGradient>

          <linearGradient id="pachax-chevron-solid-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0066FF" stopOpacity="0.02" />
            <stop offset="50%" stopColor="#0284C7" stopOpacity="0.04" />
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
          strokeOpacity="0.09"
          strokeWidth="1"
        />
      </svg>
    </div>
  )
}
