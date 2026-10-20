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
import { fetchUpcomingLessons, fetchLessonsInRange, fetchRattrapageStats } from '../../services/lessons'
import { endOfWeek, startOfWeek, toISODate } from '../../utils/format'
import { calculerTauxAbsence } from '../../utils/absenceStats'
import { isSuspendedByHolidays } from '../../utils/suspendedByHolidays'

const statIcons = [Users, Calendar, BookOpen, TrendingUp]
const fmtH = (m) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m}min`

// Cause incohérence "Cours semaine" vs "Prochains cours" :
//   weekLessons = tous statuts sur lun-dim courant (y compris annulé/émargé).
//   upcomingPlanifie = planifié à partir d'aujourd'hui, sans borne sup (peut dépasser la semaine).
// Solution : fonction partagée qui calcule les cours de la semaine par statut.
function countSemaine(lessons, zone) {
  const visible   = lessons.filter((l) => !isSuspendedByHolidays(l, zone))
  const planifie  = visible.filter((l) => l.status === 'planifie').length
  const emargees  = visible.filter((l) => ['present','absent','excuse'].includes(l.status)).length
  const total     = visible.length
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

    const [students, upcoming, weekLessons, rattrapageStats] = await Promise.all([
      fetchTeacherStudents(user.id),
      fetchUpcomingLessons({ teacherId: user.id, limit: 10 }),
      fetchLessonsInRange({ teacherId: user.id, from: weekStart, to: weekEnd }),
      fetchRattrapageStats(user.id),
    ])
    const rattrapageCount = rattrapageStats.count

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

    const lessonsToday = weekLessons.filter((l) => l.lessonDate === today).length
    // Cours planifiés restants cette semaine (depuis aujourd'hui)
    const weekRemaining = weekLessons.filter((l) => l.lessonDate >= today && l.status === 'planifie').length

    return { students, upcoming, weekLessons, lessonsToday, weekRemaining, newAbsences, newCancellations, rattrapageCount, rattrapageMinutes: rattrapageStats.minutesRestant }
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
    const zone = user.schoolZone ?? 'B'
    const semaine = countSemaine(data.weekLessons, zone)

    const STATUTS_EMARGEMENT = new Set(['present', 'absent', 'excuse'])
    const minsWorked = data.weekLessons
      .filter((l) => STATUTS_EMARGEMENT.has(l.status) && !isSuspendedByHolidays(l, zone))
      .reduce((s, l) => s + (l.durationMinutes ?? 0), 0)
    const minsRemaining = data.weekLessons
      .filter((l) => l.status === 'planifie' && !isSuspendedByHolidays(l, zone))
      .reduce((s, l) => s + (l.durationMinutes ?? 0), 0)
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

  // T4d : filtrer les prochains cours sur status=planifie uniquement, hors suspendus vacances
  const upcomingPlanifie = (data.upcoming ?? []).filter((l) => l.status === 'planifie' && !isSuspendedByHolidays(l, user.schoolZone ?? 'B'))
  const upcomingVisible = showAllUpcoming ? upcomingPlanifie : upcomingPlanifie.slice(0, 2)

  // Calcul du taux d'absence de la semaine (cours émargés uniquement)
  const absenceSemaine = calculerTauxAbsence(data.weekLessons)

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl space-y-5">
      <header>
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Tableau de bord</h1>
          <HelpTooltip texte="Vue d'ensemble de votre activité : élèves actifs, cours de la semaine et prochains cours. Alimentez les pages Élèves et Planning pour que ces chiffres restent à jour." />
        </div>
        <p className="text-muted-foreground mt-1">Vue d&apos;ensemble de votre activité pédagogique</p>
      </header>

      {/* 1 — Alertes absences / annulations */}
      {(data.newAbsences > 0 || data.newCancellations > 0) && (
        <section className="space-y-2">
          {data.newAbsences > 0 && (
            <Link
              to="/admin/absences"
              className="flex items-center gap-3 glass-panel rounded-2xl px-5 py-3 hover:border-guitar-600/30 transition-colors border border-orange-500/20 bg-orange-500/5"
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
              className="flex items-center gap-3 glass-panel rounded-2xl px-5 py-3 hover:border-guitar-600/30 transition-colors border border-emerald-500/20 bg-emerald-500/5"
            >
              <Bell className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-sm">
                <span className="font-semibold text-emerald-400">{data.newCancellations} annulation{data.newCancellations > 1 ? 's' : ''} d&apos;absence</span>
                {' '}— {data.newCancellations > 1 ? 'des élèves seront' : 'un élève sera'} finalement présent{data.newCancellations > 1 ? 's' : ''}
              </p>
            </Link>
          )}
        </section>
      )}

      {/* 2 — Prochains cours (aujourd'hui) */}
      <section className="glass-panel rounded-2xl p-5 sm:p-6">
        <h2 className="text-base font-semibold mb-3">Prochains cours</h2>
        {upcomingPlanifie.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucun cours planifié</p>
        ) : (
          <>
            <ul className="space-y-2">
              {upcomingVisible.map((lesson) => (
                <Link
                  key={lesson.id}
                  to={`/professeur/planning?date=${lesson.lessonDate}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-surface/50 border border-border-subtle hover:border-guitar-600/20 transition-colors"
                >
                  <div className="w-20 shrink-0">
                    <p className="text-xs font-medium text-guitar-400">{lesson.dateLabel}</p>
                    <p className="text-xs text-muted">{lesson.timeLabel}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{lesson.studentName}</p>
                    <p className="text-xs text-muted-foreground truncate">{lesson.topic}</p>
                  </div>
                </Link>
              ))}
            </ul>
            {upcomingPlanifie.length > 2 && (
              <button
                type="button"
                onClick={() => setShowAllUpcoming((v) => !v)}
                className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-2 rounded-xl hover:bg-surface-overlay transition-colors"
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

      {/* 3 — Chiffres clés cliquables */}
      <section>
        <h2 className="text-base font-semibold mb-3">Cette semaine</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((stat, i) => (
            <Link key={stat.label} to={stat.href} className="block hover:scale-[1.01] transition-transform">
              <StatCard {...stat} icon={statIcons[i]} />
            </Link>
          ))}
        </div>
      </section>

      {/* 4 — Heures à rattraper (toujours visible) */}
      <section>
        <h2 className="text-base font-semibold mb-3">Heures à rattraper</h2>
        <Link to="/professeur/rattrapage" className="block glass-panel rounded-2xl p-5 hover:scale-[1.01] transition-transform">
          {data.rattrapageMinutes > 0 ? (
            <>
              <p className="text-3xl font-bold text-guitar-400">{fmtH(data.rattrapageMinutes)}</p>
              <p className="text-sm text-muted-foreground mt-1">{data.rattrapageCount} cours annulé{data.rattrapageCount > 1 ? 's' : ''} — voir le détail →</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun cours à rattraper — voir la page Rattrapage →</p>
          )}
        </Link>
      </section>

      {/* 5 — Absences hebdomadaires (le reste) */}
      {absenceSemaine.nbCours > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">Absences cette semaine</h2>
          <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                <UserX className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Absents</p>
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
            <p className="text-xs text-muted-foreground">
              Sur {absenceSemaine.nbCours} cours émargé{absenceSemaine.nbCours > 1 ? 's' : ''} cette semaine
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
