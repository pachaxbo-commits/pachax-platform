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
  currency?: unknown
  includedFeatures?: unknown
  technicalEntitlements?: unknown
  priceApproval?: unknown
  adsRequired?: unknown
}

export function filterPublicCommercialPlans<T extends PublicPlan>(plans: T[]): T[] {
  return plans.filter((plan) => {
    if (plan.status !== 'published' || typeof plan.id !== 'string' || !plan.id.trim()) return false
    if (typeof plan.templateId !== 'string' || !commercialTemplateIds.has(plan.templateId)) return false
    if (typeof plan.name !== 'string' || !plan.name.trim()) return false
    if (plan.priceApproval !== 'approved') return false
    if (Array.isArray(plan.technicalEntitlements) && plan.technicalEntitlements.length > 0) return false
    if (!Array.isArray(plan.includedFeatures) || plan.includedFeatures.length === 0
      || !plan.includedFeatures.every((feature) => typeof feature === 'string' && feature.trim())) return false
    if (plan.currency !== 'USD' && plan.currency !== 'BOB') return false

    const monthly = Number(plan.monthlyPriceUSD)
    const annual = Number(plan.annualPriceUSD)
    if (!Number.isFinite(monthly) || !Number.isFinite(annual) || monthly < 0 || annual < 0) return false

    if (plan.planKind === 'free') return monthly === 0 && annual === 0 && plan.adsRequired === true
    return plan.planKind === 'paid' && monthly > 0 && annual > 0
  })
}
