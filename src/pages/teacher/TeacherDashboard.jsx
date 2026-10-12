import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Calendar, BookOpen, TrendingUp, UserX, Bell, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import HelpTooltip from '../../components/HelpTooltip'
import StatCard from '../../components/StatCard'
import { LoadingBlock, ErrorBlock } from '../../components/DataState'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useRegisterRefresh } from '../../contexts/RefreshContext'
import { supabase } from '../../lib/supabase'
import { fetchTeacherStudents } from '../../services/students'
import { fetchUpcomingLessons, fetchLessonsInRange, countRattrapageLessons } from '../../services/lessons'
import { endOfWeek, startOfWeek, toISODate } from '../../utils/format'
import { calculerTauxAbsence } from '../../utils/absenceStats'

const statIcons = [Users, Calendar, BookOpen, TrendingUp]

// Cause incohérence "Cours semaine" vs "Prochains cours" :
//   weekLessons = tous statuts sur lun-dim courant (y compris annulé/émargé).
//   upcomingPlanifie = planifié à partir d'aujourd'hui, sans borne sup (peut dépasser la semaine).
// Solution : fonction partagée qui calcule les cours de la semaine par statut.
function countSemaine(lessons) {
  const planifie  = lessons.filter((l) => l.status === 'planifie').length
  const emargees  = lessons.filter((l) => ['present','absent','excuse'].includes(l.status)).length
  const total     = lessons.length
  return { total, planifie, emargees }
}

// Clés localStorage : dernière visite AbsencesPage
const LS_KEY_ABSENCES     = 'dashboard_absences_last_seen'
const LS_KEY_CANCELLATIONS = 'dashboard_cancellations_last_seen'

export default function TeacherDashboard() {
  const { user } = useAuth()

  const loadDashboard = useCallback(async () => {
    const weekStart = toISODate(startOfWeek())
    const weekEnd = toISODate(endOfWeek())
    const today = toISODate(new Date())

    // Dernières consultations
    let lastSeenAbs = null
    let lastSeenCancels = null
    try { lastSeenAbs = localStorage.getItem(LS_KEY_ABSENCES) } catch { /* localStorage indisponible */ }
    try { lastSeenCancels = localStorage.getItem(LS_KEY_CANCELLATIONS) } catch { /* localStorage indisponible */ }

    const [students, upcoming, weekLessons, rattrapageCount] = await Promise.all([
      fetchTeacherStudents(user.id),
      fetchUpcomingLessons({ teacherId: user.id, limit: 10 }),
      fetchLessonsInRange({ teacherId: user.id, from: weekStart, to: weekEnd }),
      countRattrapageLessons(user.id),
    ])

    // Nouvelles déclarations depuis la dernière visite
    let newAbsences = 0
    try {
      let q = supabase.from('absence_declarations')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', user.id)
        .is('cancelled_at', null)
      if (lastSeenAbs) q = q.gt('declared_at', lastSeenAbs)
      const { count } = await q
      newAbsences = count ?? 0
    } catch { /* réseau indisponible */ }

    // Nouvelles annulations depuis la dernière visite
    let newCancellations = 0
    try {
      let q = supabase.from('absence_declarations')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', user.id)
        .not('cancelled_at', 'is', null)
      if (lastSeenCancels) q = q.gt('cancelled_at', lastSeenCancels)
      const { count } = await q
      newCancellations = count ?? 0
    } catch { /* réseau indisponible */ }

    const studentsToday = weekLessons
      .filter((l) => l.lessonDate === today && !l.isGroup)
      .map((l) => ({ id: l.studentId, name: l.studentName, time: l.lessonTime ?? l.timeLabel, status: l.status }))
    const lessonsToday = weekLessons.filter((l) => l.lessonDate === today).length
    // Cours planifiés restants cette semaine (depuis aujourd'hui)
    const weekRemaining = weekLessons.filter((l) => l.lessonDate >= today && l.status === 'planifie').length

    return { students, upcoming, weekLessons, lessonsToday, weekRemaining, newAbsences, newCancellations, studentsToday, rattrapageCount }
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
    const abs = calculerTauxAbsence(data.weekLessons)
    const semaine = countSemaine(data.weekLessons)

    const STATUTS_EMARGEMENT = new Set(['present', 'absent', 'excuse'])
    const minsWorked = data.weekLessons
      .filter((l) => STATUTS_EMARGEMENT.has(l.status))
      .reduce((s, l) => s + (l.durationMinutes ?? 0), 0)
    const minsRemaining = data.weekLessons
      .filter((l) => l.status === 'planifie')
      .reduce((s, l) => s + (l.durationMinutes ?? 0), 0)
    const fmtH = (m) => m >= 60 ? `${Math.floor(m/60)}h${m%60 ? String(m%60).padStart(2,'0') : ''}` : `${m}min`

    return [
      {
        label: 'Élèves actifs',
        value: String(data.students.length),
        change: data.students.length ? 'Liste à jour' : 'Aucun élève',
        href: '/professeur/eleves',
      },
      {
        label: 'Cours cette semaine',
        value: String(semaine.planifie + semaine.emargees),
        change: minsWorked + minsRemaining > 0
          ? `${fmtH(minsWorked)} faites · ${fmtH(minsRemaining)} à venir`
          : `${semaine.planifie} planifiés · ${semaine.emargees} émargés`,
        href: '/professeur/planning',
      },
      {
        label: 'Absences cette semaine',
        value: String(abs.nbAbsences),
        change: abs.taux !== null ? `${abs.taux}% taux d'absence` : 'Aucun cours émargé',
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
  // T4d : filtrer les prochains cours sur status=planifie uniquement
  const upcomingPlanifie = (data.upcoming ?? []).filter((l) => l.status === 'planifie')
  const upcomingVisible = showAllUpcoming ? upcomingPlanifie : upcomingPlanifie.slice(0, 2)

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

      {/* Bandeaux notifications absences / annulations */}
      {data.newAbsences > 0 && (
        <Link
          to="/admin/absences"
          className="flex items-center gap-3 glass-panel rounded-2xl px-5 py-3 mb-3 hover:border-guitar-600/30 transition-colors border border-orange-500/20 bg-orange-500/5"
        >
          <Bell className="w-4 h-4 text-orange-400 shrink-0" />
          <p className="text-sm">
            <span className="font-semibold text-orange-400">{data.newAbsences} nouvelle{data.newAbsences > 1 ? 's' : ''} absence{data.newAbsences > 1 ? 's' : ''}</span>
            {' '}déclarée{data.newAbsences > 1 ? 's' : ''} depuis votre dernière visite
          </p>
        </Link>
      )}
      {data.newCancellations > 0 && (
        <Link
          to="/admin/absences"
          className="flex items-center gap-3 glass-panel rounded-2xl px-5 py-3 mb-3 hover:border-guitar-600/30 transition-colors border border-emerald-500/20 bg-emerald-500/5"
        >
          <Bell className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-sm">
            <span className="font-semibold text-emerald-400">{data.newCancellations} annulation{data.newCancellations > 1 ? 's' : ''} d&apos;absence</span>
            {' '}depuis votre dernière visite — {data.newCancellations > 1 ? 'des élèves seront' : 'un élève sera'} finalement présent{data.newCancellations > 1 ? 's' : ''}
          </p>
        </Link>
      )}
      {data.rattrapageCount > 0 && (
        <Link
          to="/professeur/rattrapage"
          className="flex items-center gap-3 glass-panel rounded-2xl px-5 py-3 mb-3 hover:border-guitar-600/30 transition-colors border border-guitar-600/20 bg-guitar-600/5"
        >
          <RefreshCw className="w-4 h-4 text-guitar-400 shrink-0" />
          <p className="text-sm">
            <span className="font-semibold text-guitar-400">{data.rattrapageCount} cours à rattraper</span>
            {' '}— voir la page Rattrapage
          </p>
        </Link>
      )}
      {(data.newAbsences > 0 || data.newCancellations > 0 || data.rattrapageCount > 0) && <div className="mb-3" />}

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
        <section className="lg:col-span-3 order-2 lg:order-1 glass-panel rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Prochains cours</h2>
          {upcomingPlanifie.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Aucun cours planifié</p>
          ) : (
            <>
              <ul className="space-y-3">
                {upcomingVisible.map((lesson) => (
                  <Link
                    key={lesson.id}
                    to={`/professeur/planning?date=${lesson.lessonDate}`}
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
                  </Link>
                ))}
              </ul>
              {upcomingPlanifie.length > 2 && (
                <button
                  type="button"
                  onClick={() => setShowAllUpcoming((v) => !v)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-2 rounded-xl hover:bg-surface-overlay transition-colors"
                >
                  {showAllUpcoming
                    ? <><ChevronUp className="w-3.5 h-3.5" /> Réduire</>
                    : <><ChevronDown className="w-3.5 h-3.5" /> {upcomingPlanifie.length - 2} de plus</>
                  }
                </button>
              )}
            </>
          )}
        </section>

        <section className="lg:col-span-2 order-1 lg:order-2 space-y-6">
          {data.studentsToday.length > 0 && (
            <div className="glass-panel rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">Élèves du jour</h2>
              <ul className="space-y-3">
                {data.studentsToday.map((s, i) => (
                  <li key={s.id ?? i}>
                    {s.id ? (
                      <Link to={`/professeur/eleves/${s.id}`} className="flex items-center gap-3 hover:bg-surface-overlay rounded-xl px-1 py-0.5 -mx-1 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-guitar-600/20 flex items-center justify-center text-xs font-medium text-guitar-400 shrink-0">
                          {(s.name ?? '?')[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.time ? s.time.slice(0, 5) : '—'}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
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
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-guitar-600/20 flex items-center justify-center text-xs font-medium text-guitar-400 shrink-0">
                          {(s.name ?? '?')[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.time ? s.time.slice(0, 5) : '—'}</p>
                        </div>
                      </div>
                    )}
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
