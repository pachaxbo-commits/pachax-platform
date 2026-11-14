/**
 * Configuración central del tipo de cambio referencial (Bs por 1 USD)
 * y utilidades puras para mostrar precios contractuales en Bolivianos (BOB)
 * con referencia informativa secundaria en USD.
 *
 * REGLA COMERCIAL:
 * - No usar valores fijos ocultos cuando no existe tasa aprobada.
 * - La referencia USD es estrictamente informativa (2 decimales) y nunca
 *   genera segunda deuda ni modifica cargos, contratos o conciliaciones.
 */

export type CommercialCurrency = 'BOB' | 'USD';

export type ExchangeRateStatus = 'valid' | 'outdated' | 'pending';

export interface PlatformExchangeRateConfig {
  rateBsPerUsd: number | null;
  source: string;
  effectiveAt: string | null;
  status: ExchangeRateStatus;
  updatedAt?: string | null;
  updatedBy?: string | null;
  updatedByEmail?: string | null;
  revision?: number;
}

export const DEFAULT_EXCHANGE_RATE_CONFIG: PlatformExchangeRateConfig = {
  rateBsPerUsd: null,
  source: '',
  effectiveAt: null,
  status: 'pending',
  updatedAt: null,
  updatedBy: null,
  updatedByEmail: null,
  revision: 0,
};

export function normalizeExchangeRateConfig(
  raw?: Partial<PlatformExchangeRateConfig> | null
): PlatformExchangeRateConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_EXCHANGE_RATE_CONFIG };
  }
  const status: ExchangeRateStatus =
    raw.status === 'valid' || raw.status === 'outdated' || raw.status === 'pending'
      ? raw.status
      : 'pending';
  const rateBsPerUsd =
    typeof raw.rateBsPerUsd === 'number' && Number.isFinite(raw.rateBsPerUsd) && raw.rateBsPerUsd > 0
      ? Number(raw.rateBsPerUsd.toFixed(4))
      : null;

  return {
    rateBsPerUsd,
    source: typeof raw.source === 'string' ? raw.source.trim() : '',
    effectiveAt: typeof raw.effectiveAt === 'string' && raw.effectiveAt.trim() ? raw.effectiveAt.trim() : null,
    status: rateBsPerUsd === null && status === 'valid' ? 'pending' : status,
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt.trim() ? raw.updatedAt.trim() : null,
    updatedBy: typeof raw.updatedBy === 'string' && raw.updatedBy.trim() ? raw.updatedBy.trim() : null,
    updatedByEmail:
      typeof raw.updatedByEmail === 'string' && raw.updatedByEmail.trim()
        ? raw.updatedByEmail.trim()
        : null,
    revision: typeof raw.revision === 'number' && Number.isFinite(raw.revision) ? raw.revision : 0,
  };
}

export function isExchangeRateUsable(
  config?: PlatformExchangeRateConfig | null
): boolean {
  if (!config) return false;
  return (
    config.status === 'valid' &&
    typeof config.rateBsPerUsd === 'number' &&
    Number.isFinite(config.rateBsPerUsd) &&
    config.rateBsPerUsd > 0 &&
    Boolean(config.source && config.source.trim()) &&
    Boolean(config.effectiveAt)
  );
}

export function calculateUsdReferenceFromBob(
  amountBob: number | null | undefined,
  config?: PlatformExchangeRateConfig | null
): number | null {
  if (
    typeof amountBob !== 'number' ||
    !Number.isFinite(amountBob) ||
    amountBob < 0 ||
    !isExchangeRateUsable(config)
  ) {
    return null;
  }
  const rate = config!.rateBsPerUsd!;
  return Number((amountBob / rate).toFixed(2));
}

export function formatPrimaryCommercialAmount(
  amount: number,
  currency: CommercialCurrency = 'BOB'
): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = Number.isInteger(safe)
    ? safe.toLocaleString('es-BO')
    : safe.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'BOB' ? `Bs ${formatted}` : `USD ${formatted}`;
}

export function formatExchangeDateLabel(isoDate?: string | null): string {
  if (!isoDate) return '';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('es-BO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatUsdReferenceText(
  amountBob: number | null | undefined,
  config?: PlatformExchangeRateConfig | null
): string | null {
  const usd = calculateUsdReferenceFromBob(amountBob, config);
  if (usd === null || !config) return null;
  const dateLabel = formatExchangeDateLabel(config.effectiveAt);
  const sourceLabel = config.source.trim();
  const dateSuffix = dateLabel ? ` actualizado ${dateLabel}` : '';
  return `≈ USD ${usd.toFixed(2)} · Tipo de cambio ${sourceLabel}${dateSuffix}`;
}
