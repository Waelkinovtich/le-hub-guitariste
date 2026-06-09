import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, requiredRole }) {
  const { user } = useAuth()

  if (!user) return <Navigate to="/" replace />

  if (requiredRole && user.role !== requiredRole) {
    const redirect = user.role === 'teacher' ? '/professeur' : '/élève'
    return <Navigate to={redirect} replace />
  }

  return children
}
