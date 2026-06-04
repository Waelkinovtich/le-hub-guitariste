import { LoadingBlock, ErrorBlock } from '../../components/DataState'
import { useStudentRecord } from '../../hooks/useStudentRecord'
import { formatDateFr } from '../../utils/format'

export default function StudentProgressPage() {
  const { data: student, loading, error, reload } = useStudentRecord()

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={reload} />
  if (!student) {
    return (
      <ErrorBlock message="Aucune fiche élève liée à votre compte." />
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Ma progression</h1>
        <p className="text-muted-foreground mt-1">
          Inscrit depuis {formatDateFr(student.createdAt?.slice(0, 10))}
        </p>
      </header>

      <div className="glass-panel rounded-2xl p-8 mb-8 text-center">
        <p className="text-sm text-muted-foreground mb-2">Progression globale</p>
        <p className="text-6xl font-semibold text-gradient-guitar">{student.progress}%</p>
        <p className="text-muted-foreground mt-2">Niveau {student.level ?? '—'}</p>
      </div>

      <div className="glass-panel rounded-2xl p-6 max-w-md mx-auto">
        <h3 className="font-semibold mb-4 text-center">Détail</h3>
        <div className="relative w-40 h-40 mx-auto">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-surface-overlay" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              className="text-guitar-600"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${student.progress * 2.64} 264`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold">
            {student.progress}%
          </span>
        </div>
        <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
          <li>Instrument : {student.instrument ?? '—'}</li>
          <li>Email : {student.email ?? '—'}</li>
          <li>Téléphone : {student.phone ?? '—'}</li>
        </ul>
      </div>
    </div>
  )
}
