import { useCallback, useEffect, useState } from 'react'

/**
 * Charge des données une seule fois au montage (ou quand deps change).
 * Pas de polling ni de requêtes en arrière-plan.
 */
export function useFetch(fetcher, deps = [], { enabled = true } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(enabled))
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      setData(result)
    } catch (err) {
      setError(err.message ?? 'Une erreur est survenue')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [fetcher, enabled])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return undefined
    }

    let cancelled = false

    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetcher()
        if (!cancelled) setData(result)
      } catch (err) {
        if (!cancelled) {
          setError(err.message ?? 'Une erreur est survenue')
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [...deps, enabled])

  return { data, loading, error, reload }
}
