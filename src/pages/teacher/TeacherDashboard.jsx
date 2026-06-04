import { useCallback, useMemo } from 'react'
import { Users, Calendar, BookOpen, TrendingUp } from 'lucide-react'
import StatCard from '../../components/StatCard'
import { LoadingBlock, ErrorBlock } from '../../components/DataState'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { fetchTeacherStudents } from '../../services/students'
import { fetchUpcomingLessons, fetchLessonsInRange } from '../../services/lessons'
import { endOfWeek, startOfWeek, toISODate } from '../../utils/format'

const statIcons = [Users, Calendar, BookOpen, TrendingUp]

export default function TeacherDashboard() {
  const { user } = useAuth()

  const loadDashboard = useCallback(async () => {
    const weekStart = toISODate(startOfWeek())
    const weekEnd = toISODate(endOfWeek())

    const [students, upcoming, weekLessons] = await Promise.all([
      fetchTeacherStudents(user.id),
      fetchUpcomingLessons({ teacherId: user.id, limit: 8 }),
      fetchLessonsInRange({ teacherId: user.id, from: weekStart, to: weekEnd }),
    ])

    const today = toISODate(new Date())
    const lessonsToday = weekLessons.filter((l) => l.lessonDate === today).length

    return { students, upcoming, weekLessons, lessonsToday }
  }, [user.id])

  const { data, loading, error, reload } = useFetch(loadDashboard, [user.id])

  const stats = useMemo(() => {
    if (!data) return []
    const avgProgress =
      data.students.length > 0
        ? Math.round(
            data.students.reduce((s, st) => s + (st.progress ?? 0), 0) / data.students.length,
          )
        : 0

    return [
      {
        label: 'Élèves actifs',
        value: String(data.students.length),
        change: data.students.length ? 'Liste à jour' : 'Aucun élève',
      },
      {
        label: 'Cours cette semaine',
        value: String(data.weekLessons.length),
        change: `${data.lessonsToday} aujourd'hui`,
      },
      {
        label: 'Prochains cours',
        value: String(data.upcoming.length),
        change: 'À venir',
      },
      {
        label: 'Progression moyenne',
        value: `${avgProgress}%`,
        change: 'Tous élèves',
      },
    ]
  }, [data])

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={reload} />

  const recentStudents = data.students.slice(0, 4)
  const upcoming = data.upcoming.slice(0, 4)

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="text-muted-foreground mt-1">Vue d&apos;ensemble de votre activité pédagogique</p>
      </header>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, i) => (
          <StatCard key={stat.label} {...stat} icon={statIcons[i]} />
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <section className="lg:col-span-3 glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Prochains cours</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Aucun cours planifié</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((lesson) => (
                <li
                  key={lesson.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 rounded-xl bg-surface/50 border border-border-subtle hover:border-guitar-600/20 transition-colors"
                >
                  <div className="sm:w-28 shrink-0">
                    <p className="text-sm font-medium text-guitar-400">{lesson.dateLabel}</p>
                    <p className="text-xs text-muted">{lesson.timeLabel}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{lesson.studentName}</p>
                    <p className="text-sm text-muted-foreground truncate">{lesson.topic}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-2 glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Élèves</h2>
          {recentStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Ajoutez des élèves dans Supabase</p>
          ) : (
            <ul className="space-y-4">
              {recentStudents.map((student) => (
                <li key={student.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-guitar-600/20 flex items-center justify-center text-sm font-medium text-guitar-400">
                    {student.firstName[0]}
                    {student.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{student.name}</p>
                    <p className="text-xs text-muted">{student.level ?? '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{student.progress}%</p>
                    <div className="w-16 h-1.5 rounded-full bg-surface-overlay mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-guitar-600"
                        style={{ width: `${student.progress}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
