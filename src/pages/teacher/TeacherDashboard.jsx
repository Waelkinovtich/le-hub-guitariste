import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Calendar, BookOpen, TrendingUp, UserX, Bell, ChevronDown, ChevronUp } from 'lucide-react'
import HelpTooltip from '../../components/HelpTooltip'
import StatCard from '../../components/StatCard'
import { LoadingBlock, ErrorBlock } from '../../components/DataState'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useRegisterRefresh } from '../../contexts/RefreshContext'
import { supabase } from '../../lib/supabase'
import { fetchTeacherStudents } from '../../services/students'
import { fetchUpcomingLessons, fetchLessonsInRange } from '../../services/lessons'
import { endOfWeek, startOfWeek, toISODate } from '../../utils/format'
import { calculerTauxAbsence } from '../../utils/absenceStats'

const statIcons = [Users, Calendar, BookOpen, TrendingUp]

// Clé localStorage : dernière visite AbsencesPage
const LS_KEY_ABSENCES = 'dashboard_absences_last_seen'

export default function TeacherDashboard() {
  const { user } = useAuth()

  const loadDashboard = useCallback(async () => {
    const weekStart = toISODate(startOfWeek())
    const weekEnd = toISODate(endOfWeek())
    const today = toISODate(new Date())

    // Dernière consultation de la page absences
    let lastSeen = null
    try { lastSeen = localStorage.getItem(LS_KEY_ABSENCES) } catch {}

    const [students, upcoming, weekLessons] = await Promise.all([
      fetchTeacherStudents(user.id),
      fetchUpcomingLessons({ teacherId: user.id, limit: 10 }),
      fetchLessonsInRange({ teacherId: user.id, from: weekStart, to: weekEnd }),
    ])

    // Nouvelles déclarations depuis la dernière visite
    let newAbsences = 0
    try {
      let q = supabase.from('absence_declarations')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', user.id)
        .is('cancelled_at', null)
      if (lastSeen) q = q.gt('declared_at', lastSeen)
      const { count } = await q
      newAbsences = count ?? 0
    } catch {}

    const studentsToday = weekLessons
      .filter((l) => l.lessonDate === today && !l.isGroup)
      .map((l) => ({ id: l.studentId, name: l.studentName, time: l.lessonTime ?? l.timeLabel, status: l.status }))
    const lessonsToday = weekLessons.filter((l) => l.lessonDate === today).length
    // Cours planifiés restants cette semaine (depuis aujourd'hui)
    const weekRemaining = weekLessons.filter((l) => l.lessonDate >= today && l.status === 'planifie').length

    return { students, upcoming, weekLessons, lessonsToday, weekRemaining, newAbsences, studentsToday }
  }, [user.id])

  const { data, loading, error, reload } = useFetch(loadDashboard, [user.id])
  useRegisterRefresh(reload)

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
        href: '/professeur/eleves',
      },
      {
        label: 'Cours cette semaine',
        value: String(data.weekLessons.length),
        change: `${data.lessonsToday} aujourd'hui`,
        href: '/professeur/planning',
      },
      {
        label: 'Cours restants cette semaine',
        value: String(data.weekRemaining),
        change: 'Cours planifiés restants',
        href: '/professeur/emargement',
      },
      {
        label: 'Progression moyenne',
        value: `${avgProgress}%`,
        change: 'Tous élèves',
        href: '/professeur/eleves',
      },
    ]
  }, [data])

  const [showAllUpcoming, setShowAllUpcoming] = useState(false)

  if (loading) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={reload} />

  const recentStudents = data.students.slice(0, 4)
  const upcomingVisible = showAllUpcoming ? data.upcoming : data.upcoming.slice(0, 2)

  // Calcul du taux d'absence de la semaine (cours émargés uniquement)
  const absenceSemaine = calculerTauxAbsence(data.weekLessons)

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <header className="mb-8">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Tableau de bord</h1>
          <HelpTooltip texte="Vue d'ensemble de votre activité : élèves actifs, cours de la semaine et prochains cours. Alimentez les pages Élèves et Planning pour que ces chiffres restent à jour." />
        </div>
        <p className="text-muted-foreground mt-1">Vue d&apos;ensemble de votre activité pédagogique</p>
      </header>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        {stats.map((stat, i) => (
          <Link key={stat.label} to={stat.href} className="block hover:scale-[1.01] transition-transform">
            <StatCard {...stat} icon={statIcons[i]} />
          </Link>
        ))}
      </div>

      {/* Badge nouvelles absences */}
      {data.newAbsences > 0 && (
        <Link
          to="/admin/absences"
          className="flex items-center gap-3 glass-panel rounded-2xl px-5 py-3 mb-6 hover:border-guitar-600/30 transition-colors border border-orange-500/20 bg-orange-500/5"
        >
          <Bell className="w-4 h-4 text-orange-400 shrink-0" />
          <p className="text-sm">
            <span className="font-semibold text-orange-400">{data.newAbsences} nouvelle{data.newAbsences > 1 ? 's' : ''} absence{data.newAbsences > 1 ? 's' : ''}</span>
            {' '}déclarée{data.newAbsences > 1 ? 's' : ''} depuis votre dernière visite
          </p>
        </Link>
      )}

      {/* ── Encart absences hebdomadaires ──────────────────────────────────── */}
      {/* N'apparaît que si au moins un cours est émargé cette semaine */}
      {absenceSemaine.nbCours > 0 && (
        <div className="glass-panel rounded-2xl p-5 mb-8 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <UserX className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Absences cette semaine</p>
              <p className="text-xl font-bold text-foreground">{absenceSemaine.nbAbsences}</p>
            </div>
          </div>
          <div className="h-8 w-px bg-border-subtle hidden sm:block" />
          <div>
            <p className="text-xs text-muted-foreground">Taux d'absence</p>
            <p className={`text-xl font-bold ${
              absenceSemaine.taux === null ? 'text-muted-foreground'
              : absenceSemaine.taux >= 30 ? 'text-orange-400'
              : absenceSemaine.taux >= 15 ? 'text-yellow-400'
              : 'text-emerald-400'
            }`}>
              {absenceSemaine.taux === null ? '—' : `${absenceSemaine.taux} %`}
            </p>
          </div>
          <div className="h-8 w-px bg-border-subtle hidden sm:block" />
          <p className="text-xs text-muted-foreground">
            Sur {absenceSemaine.nbCours} cours émargé{absenceSemaine.nbCours > 1 ? 's' : ''} cette semaine
          </p>
        </div>
      )}


      <div className="grid lg:grid-cols-5 gap-6">
        <section className="lg:col-span-3 glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Prochains cours</h2>
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Aucun cours planifié</p>
          ) : (
            <>
              <ul className="space-y-3">
                {upcomingVisible.map((lesson) => (
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
              {data.upcoming.length > 2 && (
                <button
                  onClick={() => setShowAllUpcoming((v) => !v)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-2 rounded-xl hover:bg-surface-overlay transition-colors"
                >
                  {showAllUpcoming
                    ? <><ChevronUp className="w-3.5 h-3.5" /> Réduire</>
                    : <><ChevronDown className="w-3.5 h-3.5" /> {data.upcoming.length - 2} de plus</>
                  }
                </button>
              )}
            </>
          )}
        </section>

        <section className="lg:col-span-2 space-y-6">
          {data.studentsToday.length > 0 && (
            <div className="glass-panel rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">Élèves du jour</h2>
              <ul className="space-y-3">
                {data.studentsToday.map((s, i) => (
                  <li key={s.id ?? i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-guitar-600/20 flex items-center justify-center text-xs font-medium text-guitar-400 shrink-0">
                      {(s.name ?? '?')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.time ? s.time.slice(0, 5) : '—'}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      s.status === 'planifie' ? 'bg-surface-overlay text-muted-foreground'
                      : s.status === 'present' ? 'bg-emerald-500/15 text-emerald-400'
                      : s.status === 'absent' || s.status === 'excuse' ? 'bg-orange-500/15 text-orange-400'
                      : 'bg-surface-overlay text-muted-foreground'
                    }`}>
                      {s.status === 'planifie' ? 'À venir'
                        : s.status === 'present' ? 'Présent'
                        : s.status === 'absent' ? 'Absent'
                        : s.status === 'excuse' ? 'Excusé'
                        : s.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="glass-panel rounded-2xl p-6">
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
          </div>
        </section>
      </div>
    </div>
  )
}
