const prefixes = [
  { publicPrefix: 'pachax:restaurant-demo:', studioPrefix: 'pachax:restaurant-studio:' },
  { publicPrefix: 'pachax:hamburger-demo:', studioPrefix: 'pachax:hamburger-studio:' },
] as const

export const restaurantStorageKey = (key: string) => {
  const studio = new URLSearchParams(window.location.search).get('embed') === 'studio'
  if (!studio) {
    if (key === 'cocina-tickets-impresos') return 'pachax:restaurant-demo:cocina-tickets-impresos'
    return key
  }
  const prefix = prefixes.find((item) => key.startsWith(item.publicPrefix))
  if (prefix) return prefix.studioPrefix + key.slice(prefix.publicPrefix.length)
  if (key === 'cocina-tickets-impresos') return 'pachax:restaurant-studio:cocina-tickets-impresos'
  return key
}

function isStudioStorage() {
  return new URLSearchParams(window.location.search).get('embed') === 'studio'
}

function selectedStorage(): Storage {
  return isStudioStorage() ? window.localStorage : window.sessionStorage
}

const memoryFallback = new Map<string, string>()

function readStorage(key: string) {
  const scopedKey = restaurantStorageKey(key)
  try {
    return selectedStorage().getItem(scopedKey)
  } catch {
    return memoryFallback.get(scopedKey) ?? null
  }
}

function writeStorage(key: string, value: string) {
  const scopedKey = restaurantStorageKey(key)
  try {
    selectedStorage().setItem(scopedKey, value)
  } catch {
    memoryFallback.set(scopedKey, value)
  }
}

function deleteStorage(key: string) {
  const scopedKey = restaurantStorageKey(key)
  try {
    selectedStorage().removeItem(scopedKey)
  } catch { /* Storage may be unavailable in private mode. */ }
  memoryFallback.delete(scopedKey)
}

/** Public demo state is tab-scoped; Studio keeps its separate saved workspace state. */
export const restaurantStorage = {
  getItem: readStorage,
  setItem: writeStorage,
  removeItem: deleteStorage,
  keys: () => {
    const studio = isStudioStorage()
    const storage = selectedStorage()
    const allKeys = new Set<string>()
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key) allKeys.add(key)
      }
    } catch { /* Storage may be unavailable in private mode. */ }
    for (const key of memoryFallback.keys()) allKeys.add(key)
    return Array.from(allKeys).map(key => {
      const prefix = prefixes.find((item) => key.startsWith(item.studioPrefix))
      return prefix && studio ? prefix.publicPrefix + key.slice(prefix.studioPrefix.length) : key
    }).filter(key => prefixes.some((item) => key.startsWith(item.publicPrefix)))
  },
}

export function clearRestaurantDemoStorage(templateId: 'restaurant' | 'hamburger') {
  const prefix = templateId === 'hamburger' ? 'pachax:hamburger-demo:' : 'pachax:restaurant-demo:'
  for (const key of restaurantStorage.keys()) {
    if (key.startsWith(prefix)) restaurantStorage.removeItem(key)
  }
  if (templateId === 'restaurant') restaurantStorage.removeItem('cocina-tickets-impresos')
}
