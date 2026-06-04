import { useCallback, useMemo } from 'react'
import { LoadingBlock, ErrorBlock, EmptyBlock } from '../../components/DataState'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { fetchLessonsInRange } from '../../services/lessons'
import { endOfWeek, formatWeekRange, startOfWeek, toISODate } from '../../utils/format'

const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export default function PlanningPage() {
  const { user } = useAuth()
  const weekStart = useMemo(() => startOfWeek(), [])

  const load = useCallback(() => {
    const start = startOfWeek()
    const end = endOfWeek()
    return fetchLessonsInRange({
      teacherId: user.id,
      from: toISODate(start),
      to: toISODate(end),
    })
  }, [user.id])

  const { data: lessons, loading, error, reload } = useFetch(load, [user.id])

  const weekDays = useMemo(() => {
    return days.map((label, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      const iso = toISODate(d)
      const isToday = iso === toISODate(new Date())
      const count = (lessons ?? []).filter((l) => l.lessonDate === iso).length
      return { label, dayNum: d.getDate(), iso, isToday, count }
    })
  }, [weekStart, lessons])

  if (loading) return <LoadingBlock label="Chargement du planning…" />
  if (error) return <ErrorBlock message={error} onRetry={reload} />

  const weekLessons = lessons ?? []

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Planning</h1>
        <p className="text-muted-foreground mt-1">{formatWeekRange()}</p>
      </header>

      <div className="grid grid-cols-7 gap-2 mb-8">
        {weekDays.map(({ label, dayNum, isToday, count }) => (
          <div
            key={label}
            className={`text-center py-3 rounded-xl text-sm font-medium ${
              isToday ? 'guitar-gradient text-white' : 'glass-panel text-muted-foreground'
            }`}
          >
            {label}
            <span className="block text-lg mt-0.5 font-semibold">{dayNum}</span>
            {count > 0 && (
              <span
                className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                  isToday ? 'bg-white/20' : 'bg-guitar-600/20 text-guitar-400'
                }`}
              >
                {count} cours
              </span>
            )}
          </div>
        ))}
      </div>

      {weekLessons.length === 0 ? (
        <EmptyBlock message="Aucun cours cette semaine dans Supabase." />
      ) : (
        <div className="space-y-3">
          {weekLessons.map((lesson) => (
            <article
              key={lesson.id}
              className="glass-panel rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 border-l-4 border-l-guitar-600"
            >
              <div className="sm:w-32 shrink-0">
                <p className="font-medium text-guitar-400">{lesson.dateLabel}</p>
                <p className="text-2xl font-semibold">{lesson.timeLabel}</p>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{lesson.studentName || 'Élève'}</h3>
                <p className="text-muted-foreground mt-1">{lesson.topic}</p>
              </div>
              <span className="inline-flex self-start sm:self-center px-3 py-1 rounded-full text-xs font-medium bg-guitar-600/15 text-guitar-400 border border-guitar-600/25">
                {lesson.durationMinutes} min
              </span>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
