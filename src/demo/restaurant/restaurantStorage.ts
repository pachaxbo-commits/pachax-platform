const publicPrefix = 'pachax:restaurant-demo:'
const studioPrefix = 'pachax:restaurant-studio:'

export const restaurantStorageKey = (key: string) => {
  const studio = new URLSearchParams(window.location.search).get('embed') === 'studio'
  if (!studio) return key
  if (key.startsWith(publicPrefix)) return studioPrefix + key.slice(publicPrefix.length)
  if (key === 'cocina-tickets-impresos') return 'pachax:restaurant-studio:cocina-tickets-impresos'
  return key
}

/** Logical keys stay stable for the Restaurant demo code; the browser stores Studio separately. */
export const restaurantStorage = {
  getItem: (key: string) => localStorage.getItem(restaurantStorageKey(key)),
  setItem: (key: string, value: string) => localStorage.setItem(restaurantStorageKey(key), value),
  removeItem: (key: string) => localStorage.removeItem(restaurantStorageKey(key)),
  keys: () => Object.keys(localStorage).map(key => key.startsWith(studioPrefix) && new URLSearchParams(window.location.search).get('embed') === 'studio' ? publicPrefix + key.slice(studioPrefix.length) : key).filter(key => key.startsWith(publicPrefix)),
}
