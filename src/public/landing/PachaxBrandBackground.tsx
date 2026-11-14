export function PachaxBrandBackground() {
  return (
    <div className="pachax-landing-background" aria-hidden="true">
      <div className="pachax-background-glow pachax-background-glow-hero" />
      <div className="pachax-background-glow pachax-background-glow-lower" />
      <svg className="pachax-background-lines" viewBox="0 0 1440 1200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="pachax-curve-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0066FF" stopOpacity="0" />
            <stop offset=".45" stopColor="#0066FF" stopOpacity=".14" />
            <stop offset="1" stopColor="#38BDF8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="pachax-curve-b" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#38BDF8" stopOpacity="0" />
            <stop offset=".5" stopColor="#0066FF" stopOpacity=".1" />
            <stop offset="1" stopColor="#0066FF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M-80 480 C 220 420, 380 560, 650 430 S 1100 230, 1520 390" fill="none" stroke="url(#pachax-curve-a)" strokeWidth="1.2" />
        <path d="M-100 535 C 180 480, 410 600, 680 470 S 1120 280, 1520 430" fill="none" stroke="url(#pachax-curve-b)" strokeWidth=".8" />
        <path d="M-60 930 C 260 790, 410 1060, 760 900 S 1200 700, 1510 850" fill="none" stroke="url(#pachax-curve-a)" strokeWidth=".8" />
      </svg>
      <div className="pachax-background-fade" />
    </div>
  )
}
