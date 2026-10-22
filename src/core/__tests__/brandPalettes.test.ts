import { BRAND_PALETTES } from '../brandPalettes.ts'
import { readableForeground, contrastRatio } from '../../lib/tenantTheme.ts'
import { onboardingErrorMessage } from '../onboardingErrorMessage.ts'

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

check(BRAND_PALETTES.length === 4, 'Se esperan cuatro paletas oficiales')
check(BRAND_PALETTES.find(palette => palette.id === 'emerald')?.primary === '#0F766E', 'Esmeralda usa el primario AA corregido')
for (const palette of BRAND_PALETTES) {
  check(contrastRatio(palette.primary, '#ffffff') >= 4.5, `${palette.name}: primario legible con texto blanco`)
  check(contrastRatio(palette.accent, readableForeground(palette.accent)) >= 4.5, `${palette.name}: acento con foreground AA`)
}
check(/rubro y la paleta/i.test(onboardingErrorMessage({ code: 'functions/invalid-argument' })), 'Error de datos comprensible')
check(/activación pendiente/i.test(onboardingErrorMessage({ code: 'functions/failed-precondition' })), 'Error de estado previo comprensible')
console.log(`PASS ${BRAND_PALETTES.length} paletas cumplen contraste WCAG AA`)
