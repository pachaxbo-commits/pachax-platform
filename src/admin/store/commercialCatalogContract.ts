import { PUBLIC_TEMPLATES } from '../../core/publicTemplates.ts'

const commercialTemplateIds = new Set<string>(PUBLIC_TEMPLATES.map((template) => template.id))
export const COMMERCIAL_PLAN_TEMPLATE_IDS = Object.freeze([...commercialTemplateIds])

type PublishedRecord = {
  id?: unknown
  status?: unknown
  applicableTemplates?: unknown
  templateId?: unknown
}

export function filterPublishedCommercialRecords<T extends PublishedRecord>(records: T[]): T[] {
  return records.filter((record) => record.status === 'published' && typeof record.id === 'string' && record.id.length > 0)
}

type PublicPlan = PublishedRecord & {
  name?: unknown
  templateId?: unknown
  planKind?: unknown
  monthlyPriceUSD?: unknown
  annualPriceUSD?: unknown
  annualPriceUnit?: unknown
  currency?: unknown
  includedFeatures?: unknown
  technicalEntitlements?: unknown
  priceApproval?: unknown
  adsRequired?: unknown
}

export function filterPublicCommercialPlans<T extends PublicPlan>(plans: T[]): T[] {
  return plans.flatMap((plan) => {
    if (plan.status !== 'published' || typeof plan.id !== 'string' || !plan.id.trim()) return []
    if (typeof plan.templateId !== 'string' || !commercialTemplateIds.has(plan.templateId)) return []
    if (typeof plan.name !== 'string' || !plan.name.trim()) return []
    if (plan.priceApproval !== 'approved') return []
    if (Array.isArray(plan.technicalEntitlements) && plan.technicalEntitlements.length > 0) return []
    if (!Array.isArray(plan.includedFeatures) || plan.includedFeatures.length === 0
      || !plan.includedFeatures.every((feature) => typeof feature === 'string' && feature.trim())) return []
    if (plan.currency !== 'USD' && plan.currency !== 'BOB') return []

    const monthly = Number(plan.monthlyPriceUSD)
    const annual = Number(plan.annualPriceUSD)
    if (!Number.isFinite(monthly) || monthly < 0) return []

    if (plan.planKind === 'free') return monthly === 0 && Number.isFinite(annual) && annual === 0 && plan.adsRequired === true ? [plan] : []
    if (plan.planKind !== 'paid' || monthly <= 0) return []

    // Old catalog rows may contain an annual field whose unit was never recorded.
    // Keep the approved monthly offer, but never expose or infer the ambiguous annual amount.
    const annualConfirmed = plan.annualPriceUnit === 'annual_total_12_months' && Number.isFinite(annual) && annual > 0
    return [{
      ...plan,
      annualPriceUSD: annualConfirmed ? annual : 0,
      annualPriceUnit: annualConfirmed ? 'annual_total_12_months' : null,
    } as T]
  })
}
