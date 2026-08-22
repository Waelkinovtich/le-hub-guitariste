import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { fetchCancelledLessons } from '../../services/lessons'
import { LoadingBlock, ErrorBlock, EmptyBlock } from '../../components/DataState'
import { getRaisonLabel } from '../../utils/lessonStatus'
import { minutesToLabel } from '../../utils/format'
import ScoreBadge from '../../components/ScoreBadge'
import { RotateCcw, CalendarDays, Search, Check, Loader2, AlertCircle, X } from 'lucide-react'
import { usePeriod, filterLessonsByPeriod } from '../../context/PeriodContext'
import { supabase } from '../../lib/supabase'
import { computeProposals } from '../../utils/scoringCreneaux'
import HelpTooltip from '../../components/HelpTooltip'

// minutesToLabel et ScoreBadge importés depuis utils/format.js et components/ScoreBadge.jsx.

/** Date ISO de la semaine prochaine au même jour qu'une date ISO donnée. */
function nextWeekSameDay(isoDate) {
  if (!isoDate) return ''
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + 7)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ─── Composant : badge de score ───────────────────────────────────────────────


// ─── Panel de recherche de créneau de rattrapage ──────────────────────────────

/**
 * Affiché sous une ligne de cours annulé.
 * Recherche les disponibilités de l'élève via ses réponses au sondage,
 * applique le moteur de score partagé, propose les meilleurs créneaux.
 * Si aucune disponibilité connue : fallback vers un sélecteur manuel.
 *
 * onConfirmed() : appelé après création du rattrapage pour déclencher un reload.
 * onClose()     : ferme le panel sans action.
 */
function RattrapagePanel({ lesson, teacherId, zone, onConfirmed, onClose }) {
  const [loading, setLoading]         = useState(true)
  const [surveyResponse, setSurvey]   = useState(null) // null = non trouvé
  const [proposals, setProposals]     = useState([])
  const [confirming, setConfirming]   = useState(false)
  const [error, setError]             = useState('')

  // Fallback manuel : sélecteur de date + heure
  const [manualDate, setManualDate]   = useState(nextWeekSameDay(lesson.lessonDate))
  const [manualTime, setManualTime]   = useState(lesson.lessonTime ?? '09:00')

  // Chargement à la montée du panel
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const today       = new Date().toISOString().slice(0, 10)
      const inFourWeeks = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10)

      const [respRes, lessonsRes, schoolsRes] = await Promise.all([
        // Dernière réponse de sondage pour cet élève (toutes statuts confondus)
        supabase
          .from('survey_responses')
          .select('*')
          .eq('student_id', lesson.studentId)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('lessons')
          .select('id, lesson_date, lesson_time, duration_minutes, students(school_name, level)')
          .eq('teacher_id', teacherId)
          .gte('lesson_date', today)
          .lte('lesson_date', inFourWeeks),
        supabase
          .from('schools')
          .select('id, name, current_weekly_hours, desired_weekly_hours')
          .eq('teacher_id', teacherId),
      ])

      const resp = respRes.data
      setSurvey(resp)

      if (resp?.availabilities) {
        const mappedLessons = (lessonsRes.data ?? []).map((l) => ({
          ...l,
          schoolName:       l.students?.school_name ?? null,
          lessonDate:       l.lesson_date,
          lessonTime:       l.lesson_time,
          durationMinutes:  l.duration_minutes,
        }))
        const computed = computeProposals({
          response:       resp,
          existingLessons: mappedLessons,
          schools:        schoolsRes.data ?? [],
          zone,
          maxResults:     3,
        })
        setProposals(computed)
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [lesson.studentId, lesson.lessonDate, lesson.lessonTime, teacherId, zone])

  // Déclenche le chargement une seule fois à la montée du composant.
  // useEffect (et non useMemo) est correct ici : c'est un effet de bord réseau,
  // pas un calcul mémoïsé. useMemo peut s'exécuter plusieurs fois en Strict Mode.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const confirmRattrapage = async ({ lessonDate, lessonTime }) => {
    setConfirming(true)
    setError('')
    try {
      // 1. Créer le cours de rattrapage
      const { data: newLesson, error: insErr } = await supabase
        .from('lessons')
        .insert({
          teacher_id:       teacherId,
          student_id:       lesson.studentId,
          lesson_date:      lessonDate,
          lesson_time:      lessonTime,
          duration_minutes: lesson.durationMinutes,
          topic:            'Rattrapage — ' + (lesson.topic || 'Cours de guitare'),
          status:           'planifie',
        })
        .select('id')
        .single()

      if (insErr) throw new Error(insErr.message)

      // 2. Lier le cours annulé à son rattrapage et le passer en statut "rattrapé"
      const { error: updErr } = await supabase
        .from('lessons')
        .update({ rattrapage_de_lesson_id: newLesson.id, status: 'rattrape' })
        .eq('id', lesson.id)

      if (updErr) throw new Error(updErr.message)

      onConfirmed()
    } catch (e) {
      setError(e.message)
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <div className="mt-3 pt-3 border-t border-border-subtle flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Analyse des disponibilités…
      </div>
    )
  }

  return (
    <div className="mt-3 pt-3 border-t border-border-subtle space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Planifier un rattrapage</p>
        <button type="button" onClick={onClose} className="text-muted hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {error && (
        <p className="text-xs text-guitar-400 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
        </p>
      )}

      {/* ── Cas 1 : disponibilités trouvées → propositions scorées ── */}
      {surveyResponse?.availabilities && proposals.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Créneaux compatibles avec les disponibilités déclarées par {lesson.studentName} :
          </p>
          {proposals.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-surface border border-border-subtle">
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.day} {p.candidateDate} à {p.startTime}</p>
                <p className="text-xs text-muted-foreground">{p.durationMinutes} min</p>
                {p.reasons.length > 0 && (
                  <p className="text-xs text-muted mt-0.5 italic">{p.reasons[0]}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ScoreBadge score={p.score} />
                <button
                  type="button"
                  onClick={() => confirmRattrapage({ lessonDate: p.candidateDate, lessonTime: p.startTime })}
                  disabled={confirming}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg guitar-gradient text-white text-xs font-medium disabled:opacity-50"
                >
                  {confirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Confirmer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Cas 2 : pas de disponibilité connue ou aucune proposition compatible ── */}
      {(!surveyResponse?.availabilities || proposals.length === 0) && (
        <div className="space-y-3">
          {!surveyResponse?.availabilities ? (
            <p className="text-xs text-muted-foreground italic px-3 py-2 rounded-xl bg-surface border border-border-subtle">
              Aucune disponibilité connue pour {lesson.studentName} — choisissez un créneau manuellement.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic px-3 py-2 rounded-xl bg-surface border border-border-subtle">
              Aucun créneau compatible trouvé dans les disponibilités — choisissez un créneau manuellement.
            </p>
          )}

          {/* Sélecteur manuel : date + heure, pré-rempli sur la semaine suivante */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Date du rattrapage</label>
              <input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Heure</label>
              <input
                type="time"
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => confirmRattrapage({ lessonDate: manualDate, lessonTime: manualTime })}
            disabled={confirming || !manualDate || !manualTime}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-50"
          >
            {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Confirmer ce rattrapage
          </button>
        </div>
      )}

      {/* ── Fallback : propositions scorées ET sélecteur manuel complémentaire ── */}
      {surveyResponse?.availabilities && proposals.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground transition-colors">
            Choisir un autre créneau manuellement…
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Date</label>
              <input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Heure</label>
              <input
                type="time"
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => confirmRattrapage({ lessonDate: manualDate, lessonTime: manualTime })}
            disabled={confirming || !manualDate || !manualTime}
            className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-xs font-medium hover:bg-surface-overlay transition-colors disabled:opacity-50"
          >
            {confirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Confirmer ce créneau
          </button>
        </details>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function RattrapagePage() {
  const { user } = useAuth()
  const { period: periodCtx } = usePeriod()
  // Id du cours dont le panel de rattrapage est ouvert (null = aucun)
  const [openPanelId, setOpenPanelId] = useState(null)

  const zone = user?.schoolZone ?? 'B'

  const load = useCallback(() => fetchCancelledLessons({ teacherId: user.id }), [user.id])
  const { data: rawLessons, loading, error, reload } = useFetch(load, [user.id])

  const lessons = filterLessonsByPeriod(rawLessons ?? [], periodCtx)

  const { global: globalStats, parÉcole, parÉlève } = useMemo(() => {
    const all = lessons ?? []
    // Exclut les cours CESU : pas d'obligation de rattrapage contractuelle pour CESU.
    // lessonType (type global de l'élève) OU contextType (contexte spécifique du cours)
    // peuvent signaler un cours CESU, notamment pour les élèves à double casquette.
    const annulés   = all.filter((l) => l.status === 'annule_prof' && l.lessonType !== 'cesu' && l.contextType !== 'cesu')
    const rattrapés = all.filter((l) => l.status === 'rattrape'    && l.lessonType !== 'cesu' && l.contextType !== 'cesu')

    let totalAnnulé  = 0
    let totalRattrapé = 0
    const écoles  = {}
    const élèves  = {}

    annulés.forEach((l) => {
      totalAnnulé += l.durationMinutes ?? 0
      const école = l.lessonType === 'cesu' ? 'Cours particuliers (CESU)' : (l.schoolName || 'École de musique')
      if (!écoles[école]) écoles[école] = { annulé: 0, rattrapé: 0 }
      écoles[école].annulé += l.durationMinutes ?? 0
      const nom = l.studentName || 'Élève'
      if (!élèves[nom]) élèves[nom] = { annulé: 0, rattrapé: 0, studentId: l.studentId }
      élèves[nom].annulé += l.durationMinutes ?? 0
    })

    rattrapés.forEach((l) => {
      totalRattrapé += l.durationMinutes ?? 0
      const école = l.student?.schoolName || 'Cours particuliers'
      if (!écoles[école]) écoles[école] = { annulé: 0, rattrapé: 0 }
      écoles[école].rattrapé += l.durationMinutes ?? 0
      const nom = l.studentName || 'Élève'
      if (!élèves[nom]) élèves[nom] = { annulé: 0, rattrapé: 0, studentId: l.studentId }
      élèves[nom].rattrapé += l.durationMinutes ?? 0
    })

    return {
      global:  { annulé: totalAnnulé, rattrapé: totalRattrapé, restant: totalAnnulé - totalRattrapé },
      parÉcole: Object.entries(écoles).map(([nom, v]) => ({ nom, ...v, restant: v.annulé - v.rattrapé })),
      parÉlève: Object.entries(élèves).map(([nom, v]) => ({ nom, ...v, restant: v.annulé - v.rattrapé })),
    }
  }, [lessons])

  const handleConfirmed = () => {
    setOpenPanelId(null)
    reload()
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-guitar-600/15 flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-guitar-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Heures à rattraper</h1>
              <HelpTooltip texte="Cours annulés remontés automatiquement depuis l'Émargement. Sélectionnez-en un et proposez un créneau : le rattrapage s'ajoute au planning comme un cours normal." />
            </div>
            <p className="text-muted-foreground mt-1">Cours annulés par le professeur</p>
          </div>
        </div>
      </header>



      {periodCtx.mode !== 'toutes' && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-guitar-600/10 border border-guitar-600/20 text-xs text-guitar-400">
          <CalendarDays className="w-3.5 h-3.5 shrink-0" />
          Filtre temporel global actif — seuls les cours correspondant à la période sélectionnée dans la barre latérale sont affichés.
        </div>
      )}

      {loading ? <LoadingBlock label="Chargement" /> : error ? <ErrorBlock message={error} onRetry={reload} /> : (
        <>
          {/* Compteur global */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="glass-panel rounded-2xl p-5 text-center">
              <p className="text-3xl font-bold text-guitar-400">{minutesToLabel(globalStats.annulé)}</p>
              <p className="text-sm text-muted-foreground mt-1">Total annulé</p>
            </div>
            <div className="glass-panel rounded-2xl p-5 text-center">
              <p className="text-3xl font-bold text-green-400">{minutesToLabel(globalStats.rattrapé)}</p>
              <p className="text-sm text-muted-foreground mt-1">Déjà rattrapé</p>
            </div>
            <div className="glass-panel rounded-2xl p-5 text-center">
              <p className="text-3xl font-bold text-amber-400">{minutesToLabel(globalStats.restant)}</p>
              <p className="text-sm text-muted-foreground mt-1">Restant à rattraper</p>
            </div>
          </div>

          {/* Par école */}
          {parÉcole.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Par école</h2>
              <div className="space-y-3">
                {parÉcole.map((e) => (
                  <div key={e.nom} className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <p className="font-medium">{e.nom}</p>
                    <div className="flex gap-4 text-sm">
                      <span className="text-guitar-400">{minutesToLabel(e.annulé)} annulés</span>
                      <span className="text-green-400">{minutesToLabel(e.rattrapé)} rattrapés</span>
                      <span className="text-amber-400 font-semibold">{minutesToLabel(e.restant)} restants</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Par élève */}
          {parÉlève.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-3">Par élève</h2>
              <div className="space-y-3">
                {parÉlève.map((e) => (
                  <div key={e.nom} className="glass-panel rounded-xl p-4 flex items-center justify-between gap-4">
                    <p className="font-medium">{e.nom}</p>
                    <div className="flex gap-4 text-sm">
                      <span className="text-guitar-400">{minutesToLabel(e.annulé)} annulés</span>
                      <span className="text-green-400">{minutesToLabel(e.rattrapé)} rattrapés</span>
                      <span className="text-amber-400 font-semibold">{minutesToLabel(e.restant)} restants</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {parÉlève.length === 0 && <EmptyBlock message="Aucun cours annulé pour le moment." />}

          {/* Détail des cours annulés avec bouton de rattrapage */}
          {(lessons ?? []).length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">Détail des cours annulés</h2>
              <div className="space-y-2">
                {(lessons ?? []).map((l) => {
                  const raison     = getRaisonLabel(l.cancelReason)
                  const isPanelOpen = openPanelId === l.id
                  // Un cours avec rattrapage_de_lesson_id est déjà rattrapé
                  const déjàRattrapé = Boolean(l.rattrapageDeLessonId) || l.status === 'rattrape'

                  return (
                    <div key={l.id} className="glass-panel rounded-xl p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium">{l.studentName}</p>
                          <p className="text-sm text-muted-foreground">
                            {l.dateLabel} {l.timeLabel} — {l.durationMinutes} min
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {raison && (
                            <span className="text-sm px-3 py-1 rounded-full bg-guitar-600/15 text-guitar-400 border border-guitar-600/25">
                              {raison.emoji} {raison.label}
                            </span>
                          )}
                          {déjàRattrapé ? (
                            <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-500/15 text-green-400">
                              Rattrapé
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setOpenPanelId(isPanelOpen ? null : l.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                            >
                              <Search className="w-3.5 h-3.5" />
                              Chercher un créneau
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Panel de rattrapage — s'affiche sous la ligne du cours */}
                      {isPanelOpen && (
                        <RattrapagePanel
                          lesson={l}
                          teacherId={user.id}
                          zone={zone}
                          onConfirmed={handleConfirmed}
                          onClose={() => setOpenPanelId(null)}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
