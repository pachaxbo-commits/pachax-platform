import { useCallback, useEffect, useState } from 'react'
import { listRestaurantMembers } from '../../../lib/firebase'
import type { RestaurantMember } from '../../../types'

/**
 * Miembros del tenant activo. Reutiliza el listado seguro ya existente
 * (subcoleccion members del restaurante) en vez de duplicar usuarios.
 */
export function useTenantMembers() {
  const [members, setMembers] = useState<RestaurantMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      const rows = await listRestaurantMembers()
      setMembers(rows)
      setError(null)
    } catch (loadError) {
      setError((loadError as Error).message || 'No se pudieron cargar los usuarios.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false
    listRestaurantMembers()
      .then((rows) => {
        if (isCancelled) return
        setMembers(rows)
        setError(null)
      })
      .catch((loadError) => {
        if (isCancelled) return
        setError((loadError as Error).message || 'No se pudieron cargar los usuarios.')
      })
      .finally(() => {
        if (isCancelled) return
        setIsLoading(false)
      })
    return () => {
      isCancelled = true
    }
  }, [])

  return { members, isLoading, error, reload }
}
