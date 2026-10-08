const prefixes = [
  { publicPrefix: 'pachax:restaurant-demo:', studioPrefix: 'pachax:restaurant-studio:' },
  { publicPrefix: 'pachax:hamburger-demo:', studioPrefix: 'pachax:hamburger-studio:' },
] as const

export const restaurantStorageKey = (key: string) => {
  const studio = new URLSearchParams(window.location.search).get('embed') === 'studio'
  if (!studio) return key
  const prefix = prefixes.find((item) => key.startsWith(item.publicPrefix))
  if (prefix) return prefix.studioPrefix + key.slice(prefix.publicPrefix.length)
  if (key === 'cocina-tickets-impresos') return 'pachax:restaurant-studio:cocina-tickets-impresos'
  return key
}

/** Logical keys stay stable for the Restaurant demo code; the browser stores Studio separately. */
export const restaurantStorage = {
  getItem: (key: string) => localStorage.getItem(restaurantStorageKey(key)),
  setItem: (key: string, value: string) => localStorage.setItem(restaurantStorageKey(key), value),
  removeItem: (key: string) => localStorage.removeItem(restaurantStorageKey(key)),
  keys: () => Object.keys(localStorage).map(key => {
    const prefix = prefixes.find((item) => key.startsWith(item.studioPrefix))
    return prefix && new URLSearchParams(window.location.search).get('embed') === 'studio' ? prefix.publicPrefix + key.slice(prefix.studioPrefix.length) : key
  }).filter(key => prefixes.some((item) => key.startsWith(item.publicPrefix))),
}
