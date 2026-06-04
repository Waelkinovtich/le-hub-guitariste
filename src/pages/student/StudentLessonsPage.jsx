import { useCallback } from 'react'
import { LoadingBlock, ErrorBlock, EmptyBlock } from '../../components/DataState'
import { useStudentRecord } from '../../hooks/useStudentRecord'
import { useFetch } from '../../hooks/useFetch'
import { fetchStudentTeacherName } from '../../services/profiles'
import { fetchUpcomingLessons, fetchPastLessons } from '../../services/lessons'
import { formatDateFr } from '../../utils/format'

export default function StudentLessonsPage() {
  const { data: student, loading: studentLoading, error: studentError } = useStudentRecord()

  const load = useCallback(async () => {
    if (!student?.id) return null
    const [upcoming, past, teacherName] = await Promise.all([
      fetchUpcomingLessons({ studentId: student.id, limit: 1 }),
      fetchPastLessons({ studentId: student.id, limit: 20 }),
      fetchStudentTeacherName(student.teacherId),
    ])
    return { next: upcoming[0] ?? null, past, teacherName }
  }, [student?.id, student?.teacherId])

  const { data, loading, error, reload } = useFetch(load, [student?.id], {
    enabled: Boolean(student?.id),
  })

  if (studentLoading || (student?.id && loading)) return <LoadingBlock />
  if (studentError || error) {
    return <ErrorBlock message={studentError || error} onRetry={reload} />
  }
  if (!student) {
    return <ErrorBlock message="Aucune fiche élève liée à votre compte." />
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Mes cours</h1>
        <p className="text-muted-foreground mt-1">Historique et prochain rendez-vous</p>
      </header>

      {data?.next ? (
        <article className="glass-panel rounded-2xl p-6 mb-8 border border-guitar-600/30 bg-guitar-600/5">
          <p className="text-xs font-medium text-guitar-400 uppercase tracking-wider mb-2">Prochain cours</p>
          <h2 className="text-xl font-semibold">{data.next.topic}</h2>
          <p className="text-muted-foreground mt-2">
            {data.next.dateLabel} à {data.next.timeLabel} · avec {data.teacherName ?? 'votre professeur'}
          </p>
        </article>
      ) : (
        <p className="text-sm text-muted-foreground mb-8">Aucun cours planifié.</p>
      )}

      <h2 className="text-lg font-semibold mb-4">Historique</h2>
      {!data?.past?.length ? (
        <EmptyBlock message="Aucun cours passé." />
      ) : (
        <div className="space-y-4">
          {data.past.map((lesson) => (
            <article key={lesson.id} className="glass-panel rounded-2xl p-5">
              <p className="text-sm text-guitar-400">{formatDateFr(lesson.lessonDate)}</p>
              <h3 className="font-semibold text-lg mt-1">{lesson.topic}</h3>
              {lesson.notes && (
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{lesson.notes}</p>
              )}
              <p className="text-xs text-muted mt-2">{lesson.durationMinutes} min</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
