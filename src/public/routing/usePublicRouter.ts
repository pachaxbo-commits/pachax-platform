import { useState, useEffect, useCallback } from 'react'

export type PublicRoute = '/' | '/login' | '/register' | '/demo'

export function usePublicRouter() {
  const [currentUrl, setCurrentUrl] = useState(() => {
    if (typeof window === 'undefined') return { path: '/', search: '' }
    return {
      path: window.location.pathname || '/',
      search: window.location.search || '',
    }
  })

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentUrl({
        path: window.location.pathname || '/',
        search: window.location.search || '',
      })
    }

    window.addEventListener('popstate', handleLocationChange)
    window.addEventListener('pachax:navigation', handleLocationChange)

    return () => {
      window.removeEventListener('popstate', handleLocationChange)
      window.removeEventListener('pachax:navigation', handleLocationChange)
    }
  }, [])

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    if (typeof window === 'undefined') return

    // Soporte para anclas (#soluciones, #personalizacion, etc.)
    if (to.startsWith('#')) {
      const element = document.querySelector(to)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      return
    }

    // Si navegamos a una ancla dentro de la home desde otra ruta
    if (to.startsWith('/#')) {
      if (window.location.pathname !== '/') {
        window.history.pushState({}, '', '/')
        window.dispatchEvent(new Event('pachax:navigation'))
        setTimeout(() => {
          const element = document.querySelector(to.replace('/', ''))
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }, 100)
        return
      } else {
        const element = document.querySelector(to.replace('/', ''))
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
        return
      }
    }

    if (options?.replace) {
      window.history.replaceState({}, '', to)
    } else {
      window.history.pushState({}, '', to)
    }

    window.dispatchEvent(new Event('pachax:navigation'))
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  const params = new URLSearchParams(currentUrl.search)
  const templateParam = params.get('template')

  return {
    path: currentUrl.path,
    search: currentUrl.search,
    templateParam,
    navigate,
  }
}
