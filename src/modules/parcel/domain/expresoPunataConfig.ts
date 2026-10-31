import { EXPRESO_PUNATA_LOGO_DATA_URL, EXPRESO_PUNATA_LOGO_PATH } from '../assets/expresoPunataLogo.ts'
import type { DocumentCompanyContext, ParcelTariffConfig } from '../types.ts'

export { EXPRESO_PUNATA_LOGO_DATA_URL, EXPRESO_PUNATA_LOGO_PATH }

/**
 * Identidad institucional canónica y editable de S.M.T. EXPRESO PUNATA.
 * Tomada de los registros de fachada, logotipo oficial y operaciones reales.
 */
export const EXPRESO_PUNATA_COMPANY: DocumentCompanyContext & {
  acronym: string
  slogan: string
  serviceHours: string
  commercialServices: string[]
  registrationNote: string
} = {
  name: 'S.M.T. EXPRESO PUNATA',
  tradeName: 'S.M.T. EXPRESO PUNATA',
  legalName: 'Sindicato Mixto de Transporte Expreso Punata',
  acronym: 'S.M.T.',
  slogan: 'Servicio Ejecutivo — "Somos los Pioneros"',
  serviceHours: 'Atención 24 Horas',
  phone: '4-4571234 / 71798765',
  address: 'Av. Heroínas del Coronel esq. Sucre (Parada Punata)',
  city: 'Punata, Cochabamba - Bolivia',
  taxId: '1098472023', // Demo / Pendiente de confirmación legal definitiva
  logoUrl: EXPRESO_PUNATA_LOGO_DATA_URL,
  commercialServices: [
    'Envío de Encomiendas & Paquetería 24 Horas',
    'Courier Express Interdepartamental',
    'Auxilio de Chofer & Mecánica Ligera',
    'Servicio de Traslados a Terminal & Aeropuertos',
    'Paseos Nupciales & Caravana de Bodas',
    'Turismo a Delegaciones & Viajes Especiales',
    'Contratos Interdepartamentales de Pasajeros & Carga',
  ],
  registrationNote: 'Año de fundación en letrero como referencia visual (pendiente de acta legal definitiva).',
}

/**
 * Tarifario base de encomiendas adaptado al Valle Alto y rutas interdepartamentales de Expreso Punata.
 */
export const EXPRESO_PUNATA_TARIFF_CONFIG: ParcelTariffConfig = {
  baseFee: 15, // Tarifa base Bs. 15 por sobre o paquete chico
  freeWeightKg: 3, // Hasta 3 kg incluidos en tarifa base
  extraKgRate: 2, // Bs. 2 por cada kg adicional
  homeDeliveryFee: 12, // Recargo por entrega a domicilio en destino
}

/**
 * Reglas de aportes sindicales y cuotas mensuales para S.M.T. Expreso Punata.
 */
export const EXPRESO_PUNATA_DUES_CONFIG = {
  monthlyDueAmount: 120,
  defaultMonthlyFee: 120, // Cuota regular mensual socios propietarios (Bs. 120)
  driverMonthlyDueAmount: 90,
  conductorMonthlyFee: 90, // Cuota mensual para choferes afiliados (Bs. 90)
  honoraryMonthlyFee: 40, // Aporte simbólico socios honorarios / ex-dirigentes (Bs. 40)
  dueDayOfMonth: 31, // Vencimiento al fin de mes
  lateFeeRate: 0.10, // 10% de recargo por mora si se abona en periodo posterior vencido
}

/**
 * Paleta cromática corporativa institucional de S.M.T. Expreso Punata.
 */
export const EXPRESO_PUNATA_THEME = {
  primary: '#064e3b',
  accent: '#facc15',
  darkGreen: '#064e3b', // Verde bosque oscuro (fondo de barra y elementos principales)
  accentGreen: '#065f46',
  yellow: '#facc15', // Amarillo intenso (detalles, insignias y botones de acento)
  yellowDark: '#ca8a04',
  white: '#ffffff',
  slateDark: '#0f172a',
}
