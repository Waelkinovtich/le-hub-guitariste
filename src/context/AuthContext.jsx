import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { fetchProfile, mapProfileToUser } from '../services/profiles'

const AuthContext = createContext(null)

async function resolveUserFromSession(session) {
  if (!session?.user) return null

  const profile = await fetchProfile(session.user.id)
  if (!profile) {
    throw new Error(
      'Profil introuvable. Vérifiez la table profiles et que l’id correspond à auth.users.',
    )
  }
  return mapProfileToUser(profile)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const initialisedRef = useRef(false)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      setAuthError('Configuration Supabase manquante (.env.local).')
      return undefined
    }

    let mounted = true

    const applySession = async (session) => {
      if (!session) {
        if (mounted) setUser(null)
        return
      }
      try {
        const appUser = await resolveUserFromSession(session)
        if (mounted) {
          setUser(appUser)
          setAuthError(null)
        }
      } catch (err) {
        console.error('[Auth]', err)
        await supabase.auth.signOut()
        if (mounted) {
          setUser(null)
          setAuthError(err.message)
        }
      }
    }

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        await applySession(data.session)
      } catch (err) {
        console.error('[Auth] getSession', err)
        if (mounted) setAuthError(err.message ?? 'Erreur de connexion Supabase')
      } finally {
        if (mounted) {
          setLoading(false)
          initialisedRef.current = true
        }
      }
    }

    init()

    // Callback synchrone : ne pas await ici (bloque le client Supabase)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || !initialisedRef.current) return
      if (event === 'INITIAL_SESSION') return

      void applySession(session)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const login = useCallback(async (email, password, expectedRole) => {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Supabase non configuré.' }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      return { success: false, error: 'Email ou mot de passe incorrect.' }
    }

    try {
      const profile = await fetchProfile(data.user.id)
      if (!profile) {
        await supabase.auth.signOut()
        return {
          success: false,
          error: 'Compte sans profil. Ajoutez une ligne dans public.profiles.',
        }
      }

      if (profile.role !== expectedRole) {
        await supabase.auth.signOut()
        const label = expectedRole === 'teacher' ? 'professeur' : 'élève'
        return {
          success: false,
          error: `Ce compte n’est pas un compte ${label}.`,
        }
      }

      const appUser = mapProfileToUser(profile)
      setUser(appUser)
      setAuthError(null)
      return { success: true }
    } catch (err) {
      await supabase.auth.signOut()
      return { success: false, error: err.message }
    }
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        login,
        logout,
        isTeacher: user?.role === 'teacher',
        isSupabaseConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}
