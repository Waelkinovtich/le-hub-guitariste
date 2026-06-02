import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { DEMO_ACCOUNTS } from '../data/mockData'

const AuthContext = createContext(null)

const STORAGE_KEY = 'hub-guitariste-auth'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setUser(JSON.parse(stored))
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    } finally {
      setLoading(false)
    }
  }, [])

  const login = useCallback((email, password, role) => {
    const demo = role === 'teacher' ? DEMO_ACCOUNTS.teacher : DEMO_ACCOUNTS.student

    const isDemoMatch =
      email.toLowerCase() === demo.email.toLowerCase() && password === demo.password

    if (!isDemoMatch && (!email.trim() || !password.trim())) {
      return { success: false, error: 'Veuillez renseigner votre email et mot de passe.' }
    }

    const sessionUser = isDemoMatch
      ? { ...demo }
      : {
          email: email.trim(),
          name: role === 'teacher' ? 'Professeur' : 'Élève',
          role,
        }

    setUser(sessionUser)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionUser))
    return { success: true }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isTeacher: user?.role === 'teacher' }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}
