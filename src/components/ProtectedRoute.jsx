import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, requiredRole }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace />

  if (requiredRole && user.role !== requiredRole) {
    const redirect = user.role === 'teacher' ? '/professeur' : '/eleve'
    return <Navigate to={redirect} replace />
  }

  return children
}
