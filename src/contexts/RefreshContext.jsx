import { createContext, useContext, useRef, useCallback, useEffect } from 'react'

const RefreshContext = createContext(null)

export function RefreshProvider({ children }) {
  const reloadRef = useRef(null)

  // Enregistre la fonction de rechargement de la page active — remplacée à chaque navigation
  const registerReload = useCallback((fn) => {
    reloadRef.current = fn
    return () => { if (reloadRef.current === fn) reloadRef.current = null }
  }, [])

  const triggerReload = useCallback(() => { reloadRef.current?.() }, [])

  return (
    <RefreshContext.Provider value={{ registerReload, triggerReload }}>
      {children}
    </RefreshContext.Provider>
  )
}

// Chaque page appellera ce hook pour exposer son reload au bouton global
export function useRegisterRefresh(reloadFn) {
  const ctx = useContext(RefreshContext)
  useEffect(() => {
    if (!ctx || !reloadFn) return
    return ctx.registerReload(reloadFn)
  }, [ctx, reloadFn])
}

export function useRefreshContext() {
  return useContext(RefreshContext)
}
