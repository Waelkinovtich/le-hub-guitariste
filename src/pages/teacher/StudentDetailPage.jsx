import { useParams, useNavigate } from 'react-router-dom'
import { useCallback, useState } from 'react'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { fetchTeacherStudents, updateStudent, deleteStudent } from '../../services/students'
import { LoadingBlock, ErrorBlock } from '../../components/DataState'
import AddStudentModal from '../../components/AddStudentModal'

export default function StudentDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [showEdit, setShowEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const students = await fetchTeacherStudents(user.id)
    return students.find((s) => s.id === id) ?? null
  }, [user.id, id])

  const { data: student, loading, error, reload } = useFetch(load, [id])

  const handleDelete = async () => {
    if (!window.confirm('Supprimer cet eleve ? Cette action est irreversible.')) return
    setDeleting(true)
    try {
      await deleteStudent(id)
      navigate('/professeur/eleves')
    } catch (err) {
      alert('Erreur : ' + err.message)
      setDeleting(false)
    }
  }

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

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold">{student.name}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors"
          >
            <Pencil className="w-4 h-4" />
            Modifier
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-guitar-600/40 text-guitar-400 text-sm font-medium hover:bg-guitar-600/10 transition-colors disabled:opacity-60"
          >
            <Trash2 className="w-4 h-4" />
            Supprimer
          </button>
        </div>
      </div>

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

      {showEdit && (
        <AddStudentModal
          teacherId={user.id}
          student={student}
          onClose={() => setShowEdit(false)}
          onCreated={() => { reload(); setShowEdit(false) }}
          updateFn={updateStudent}
        />
      )}
    </div>
  )
}
