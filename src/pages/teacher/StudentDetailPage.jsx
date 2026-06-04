import { useParams, useNavigate } from 'react-router-dom'
import { useCallback } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { fetchTeacherStudents } from '../../services/students'
import { LoadingBlock, ErrorBlock } from '../../components/DataState'

export default function StudentDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    const students = await fetchTeacherStudents(user.id)
    return students.find((s) => s.id === id) ?? null
  }, [user.id, id])

  const { data: student, loading, error } = useFetch(load, [id])

  if (loading) return <LoadingBlock label="Chargement de la fiche" />
  if (error) return <ErrorBlock message={error} />
  if (!student) return <ErrorBlock message="Eleve introuvable." />

  return (
    <div className="p-6 sm:p-8 max-w-3xl">
      <button
        onClick={() => navigate('/professeur/eleves')}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour aux eleves
      </button>

      <h1 className="text-2xl sm:text-3xl font-semibold mb-8">{student.name}</h1>

      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Email</p>
            <p className="text-sm">{student.email ?? '--'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Telephone</p>
            <p className="text-sm">{student.phone ?? '--'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Niveau</p>
            <p className="text-sm">{student.level ?? '--'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Instrument</p>
            <p className="text-sm">{student.instrument ?? '--'}</p>
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Progression</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-surface-overlay overflow-hidden">
              <div
                className="h-full rounded-full bg-guitar-600"
                style={{ width: student.progress + '%' }}
              />
            </div>
            <span className="text-sm font-medium">{student.progress}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
