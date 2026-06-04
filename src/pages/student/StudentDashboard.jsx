import { useCallback } from 'react'
import { Calendar, TrendingUp, Music } from 'lucide-react'
import StatCard from '../../components/StatCard'
import { LoadingBlock, ErrorBlock, EmptyBlock } from '../../components/DataState'
import { useStudentRecord } from '../../hooks/useStudentRecord'
import { useFetch } from '../../hooks/useFetch'
import { fetchStudentTeacherName } from '../../services/profiles'
import { fetchUpcomingLessons, fetchPastLessons } from '../../services/lessons'
import { formatDateFr } from '../../utils/format'

export default function StudentDashboard() {
  const { data: student, loading: studentLoading, error: studentError, reload: reloadStudent } =
    useStudentRecord()

  const loadLessons = useCallback(async () => {
    if (!student?.id) return { upcoming: [], past: [], teacherName: null }
    const [upcoming, past, teacherName] = await Promise.all([
      fetchUpcomingLessons({ studentId: student.id, limit: 1 }),
      fetchPastLessons({ studentId: student.id, limit: 5 }),
      fetchStudentTeacherName(student.teacherId),
    ])
    return { upcoming, past, teacherName }
  }, [student?.id, student?.teacherId])

  const {
    data: lessonsData,
    loading: lessonsLoading,
    error: lessonsError,
    reload: reloadLessons,
  } = useFetch(loadLessons, [student?.id], { enabled: Boolean(student?.id) })

  const loading = studentLoading || (student?.id && lessonsLoading)
  const error = studentError || lessonsError

  if (loading) return <LoadingBlock />
  if (error) {
    return (
      <ErrorBlock
        message={error}
        onRetry={() => {
          reloadStudent()
          reloadLessons()
        }}
      />
    )
  }

  if (!student) {
    return (
      <ErrorBlock message="Aucune fiche élève liée à votre compte. Associez profile_id dans la table students." />
    )
  }

  const nextLesson = lessonsData?.upcoming?.[0]
  const pastLessons = lessonsData?.past ?? []
  const teacherName = lessonsData?.teacherName ?? '—'

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Bonjour, {student.firstName} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Professeur : {teacherName} · Niveau {student.level ?? '—'}
        </p>
      </header>

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Progression"
          value={`${student.progress}%`}
          change="Globale"
          icon={TrendingUp}
        />
        <StatCard
          label="Prochain cours"
          value={nextLesson ? nextLesson.dateLabel : '—'}
          change={nextLesson ? nextLesson.timeLabel : 'Rien de planifié'}
          icon={Calendar}
        />
        <StatCard
          label="Instrument"
          value={student.instrument?.split(' ')[0] ?? '—'}
          change={student.instrument ?? 'Non renseigné'}
          icon={Music}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Prochain cours</h2>
          {nextLesson ? (
            <div className="p-4 rounded-xl border border-guitar-600/20 bg-guitar-600/5">
              <p className="font-medium">{nextLesson.topic}</p>
              <p className="text-sm text-muted-foreground mt-2">
                {nextLesson.dateLabel} à {nextLesson.timeLabel} · {nextLesson.durationMinutes} min
              </p>
            </div>
          ) : (
            <EmptyBlock message="Aucun cours à venir." />
          )}
        </section>

        <section className="glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Ma progression</h2>
          <div className="flex justify-between text-sm mb-1.5">
            <span className="font-medium">Global</span>
            <span className="text-muted">{student.progress}%</span>
          </div>
          <div className="h-3 rounded-full bg-surface-overlay overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-guitar-700 to-guitar-500"
              style={{ width: `${student.progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Instrument : {student.instrument ?? '—'}
          </p>
        </section>
      </div>

      <section className="glass-panel rounded-2xl p-6 mt-6">
        <h2 className="text-lg font-semibold mb-4">Derniers cours</h2>
        {pastLessons.length === 0 ? (
          <EmptyBlock message="Aucun cours passé enregistré." />
        ) : (
          <ul className="space-y-4">
            {pastLessons.map((lesson) => (
              <li key={lesson.id} className="border-b border-border-subtle last:border-0 pb-4 last:pb-0">
                <p className="text-xs text-guitar-400 mb-1">{formatDateFr(lesson.lessonDate)}</p>
                <p className="font-medium">{lesson.topic}</p>
                {lesson.notes && (
                  <p className="text-sm text-muted-foreground mt-1">{lesson.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
