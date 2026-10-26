import type { RestaurantTourStep } from './restaurantPosTour'

export const RESTAURANT_TOUR_TARGET_WAIT_MS = 650

export type RestaurantTourTargetResolution =
  | { status: 'primary' }
  | { status: 'fallback'; selector: string; description: string }
  | { status: 'missing' }
  | { status: 'invalid-selector' }

export function resolveRestaurantTourStepIndex<T extends { id: string }>(steps: T[], currentStepId: string) {
  const index = steps.findIndex((step) => step.id === currentStepId)
  return index >= 0 ? index : 0
}

export function resolveRestaurantTourTarget(
  step: RestaurantTourStep,
  availability: { primaryFound: boolean; fallbackFound: boolean; selectorInvalid?: boolean },
): RestaurantTourTargetResolution {
  if (availability.selectorInvalid) return { status: 'invalid-selector' }
  if (availability.primaryFound) return { status: 'primary' }

  if (step.missingTarget && availability.fallbackFound) {
    return {
      status: 'fallback',
      selector: step.missingTarget.fallbackTarget,
      description: step.missingTarget.description,
    }
  }

  return { status: 'missing' }
}
