import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Loader2, CalendarDays, AlertCircle, Check, Brain, Clock, School, LayoutGrid, List, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import HelpTooltip from '../components/HelpTooltip'
import ScoreBadge from '../components/ScoreBadge'
import WeekGridPlanning from '../components/WeekGridPlanning'
import { computeProposals, scoreCandidate, JOURS_FR, timeToMinutes } from '../utils/scoringCreneaux'
import { currentSchoolYear } from '../services/schools'
import { fetchReservedSlots } from '../services/reservedSlots'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Charge le profil du professeur depuis Supabase.
// userId est fourni par useAuth() — on n'appelle plus supabase.auth.getUser() ici
// pour rester cohérent avec AuthContext (gestion centralisée des sessions expirées).
async function fetchTeacherProfile(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('id, school_zone, preferred_days_off, preferred_proximity_day, preferred_proximity_days, home_latitude, home_longitude')
    .eq('id', userId)
    .single()
  // Rétrocompat : preferred_proximity_days (tableau) remplace l'ancien champ texte.
  const newDays = Array.isArray(data?.preferred_proximity_days) && data.preferred_proximity_days.length > 0
    ? data.preferred_proximity_days
    : data?.preferred_proximity_day ? [data.preferred_proximity_day] : []
  return {
    id:                     data?.id                ?? null,
    zone:                   data?.school_zone        ?? 'B',
    preferredDaysOff:       data?.preferred_days_off ?? [],
    preferredProximityDays: newDays,
    homeLat:                data?.home_latitude      ?? null,
    homeLng:                data?.home_longitude     ?? null,
  }
}

/**
 * Calcule les 7 jours de la semaine (lun–dim) décalée de `offset` semaines.
 * Retourne le format attendu par WeekGridPlanning.
 */
function computeWeekDays(offset) {
  const today   = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const jourJs  = today.getDay()
  // Décalage vers le lundi de la semaine courante (0 = dim → lundi précédent)
  const diffLundi = jourJs === 0 ? -6 : 1 - jourJs
  const lundi = new Date(today)
  lundi.setDate(today.getDate() + diffLundi + offset * 7)

  const LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
  const pad = (n) => String(n).padStart(2, '0')

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lundi)
    d.setDate(lundi.getDate() + i)
    const iso = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    return { iso, label: LABELS[d.getDay()], dayNum: d.getDate(), isToday: iso === todayIso }
  })
}

// ─── Composants ───────────────────────────────────────────────────────────────

// ScoreBadge importé depuis components/ScoreBadge.jsx.

function ProposalCard({ response, proposals, onConfirm, confirming }) {
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState(null)
  const [done, setDone] = useState(false)
  const best = proposals[0]

  const handleAccept = async (proposal) => {
    if (!onConfirm) return
    setChosen(proposal)
    const ok = await onConfirm(response, proposal)
    if (ok) setDone(true)
  }

  if (done) {
    return (
      <div className="glass-panel rounded-2xl p-5 flex items-center gap-3 text-green-400">
        <Check className="w-5 h-5 shrink-0" />
        <div>
          <p className="font-medium">{response.first_name} {response.last_name}</p>
          <p className="text-sm">Cours créés — {chosen?.day} {chosen?.startTime}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-foreground">{response.first_name || '—'} {response.last_name || ''}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {response.school_name || 'École non précisée'}
              {response.level ? ` · ${response.level}` : ''}
            </p>
          </div>
          {best && <ScoreBadge score={best.score} />}
        </div>

        {proposals.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground italic">Aucun créneau compatible trouvé dans les disponibilités.</p>
        ) : (
          <>
            {/* Meilleure proposition */}
            <div className="mt-4 rounded-xl bg-surface border border-border-subtle p-4">
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Meilleure proposition</p>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-foreground">{best.day} à {best.startTime}</p>
                  <p className="text-xs text-muted-foreground">{best.durationMinutes} min · {best.candidateDate}</p>
                </div>
                <button
                  onClick={() => handleAccept(best)}
                  disabled={confirming}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl guitar-gradient text-white text-xs font-medium disabled:opacity-50"
                >
                  {confirming && chosen === best ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Accepter
                </button>
              </div>
              <div className="mt-3 space-y-1">
                {best.reasons.map((r, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{r}</p>
                ))}
              </div>
            </div>

            {/* Autres propositions */}
            {proposals.length > 1 && (
              <button
                onClick={() => setOpen((v) => !v)}
                className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {open ? '▲' : '▼'} {proposals.length - 1} autre{proposals.length - 1 > 1 ? 's' : ''} proposition{proposals.length - 1 > 1 ? 's' : ''}
              </button>
            )}

            {open && proposals.slice(1).map((p, i) => {
              const delta = p.score - best.score
              const deltaLabel = delta === 0
                ? 'Score identique à la proposition principale.'
                : `Score ${delta > 0 ? '+' : ''}${delta} par rapport à la proposition principale.`
              const missingFromBest = best.reasons.filter((r) => !p.reasons.includes(r))
              const onlyInAlt = p.reasons.filter((r) => !best.reasons.includes(r))
              const comparisonDetail = missingFromBest.length > 0
                ? `Absent ici : ${missingFromBest.map((r) => r.replace(/^[+-]\d+ : /, '')).join(' ; ')}.`
                : onlyInAlt.length > 0
                  ? `Bonus propre à ce créneau : ${onlyInAlt.map((r) => r.replace(/^[+-]\d+ : /, '')).join(' ; ')}.`
                  : ''
              return (
                <div key={i} className="mt-2 rounded-xl bg-surface border border-border-subtle p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.day} à {p.startTime}</p>
                      <p className="text-xs text-muted-foreground">{p.durationMinutes} min</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ScoreBadge score={p.score} />
                      <button
                        onClick={() => handleAccept(p)}
                        disabled={confirming}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all disabled:opacity-40"
                      >
                        <Check className="w-3 h-3" /> Choisir
                      </button>
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground italic">
                    {deltaLabel}{comparisonDetail ? ' ' + comparisonDetail : ''}
                  </p>
                  {p.reasons.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {p.reasons.map((r, j) => (
                        <p key={j} className="text-xs text-muted-foreground">{r}</p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function SchedulingAssistantPage() {
  const { user } = useAuth()
  const [responses, setResponses]         = useState([])
  const [existingLessons, setExistingLessons] = useState([])
  const [schools, setSchools]             = useState([])
  const [reservedSlots, setReservedSlots] = useState([])
  const [teacherInfo, setTeacherInfo]     = useState(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')
  const [confirming, setConfirming]       = useState(false)

  // ── Vue : 'liste' (récapitulatif texte) ou 'grille' (WeekGridPlanning) ──────
  const [vue, setVue]               = useState('liste')
  // Décalage en semaines par rapport à la semaine courante (0 = semaine en cours)
  const [weekOffset, setWeekOffset] = useState(0)
  // Positions des propositions modifiées par glisser-déposer : responseId → proposal
  const [proposalOverrides, setProposalOverrides] = useState({})

  useEffect(() => {
    if (!user?.id) return
    async function load() {
      setLoading(true)
      try {
        const tInfo = await fetchTeacherProfile(user.id)
        if (!tInfo?.id) { setError('Profil introuvable'); setLoading(false); return }
        setTeacherInfo(tInfo)

        const today = new Date().toISOString().slice(0, 10)
        const inFourWeeks = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10)

        const [respRes, lessonsRes, schoolsRes, reservedSlotsData] = await Promise.all([
          supabase.from('survey_responses').select('*').neq('status', 'confirme').order('submitted_at', { ascending: false }),
          supabase.from('lessons').select('id, lesson_date, lesson_time, duration_minutes, student_id, students(school_name, level)').eq('teacher_id', tInfo.id).gte('lesson_date', today).lte('lesson_date', inFourWeeks),
          // latitude + longitude pour le bonus de proximité domicile
          supabase.from('schools').select('id, name, current_weekly_hours, desired_weekly_hours, latitude, longitude').eq('teacher_id', tInfo.id),
          fetchReservedSlots(tInfo.id),
        ])

        if (respRes.error) throw new Error(respRes.error.message)

        const mappedLessons = (lessonsRes.data ?? []).map((l) => ({
          ...l,
          schoolName:      l.students?.school_name ?? null,
          lessonDate:      l.lesson_date,
          lessonTime:      l.lesson_time,
          timeLabel:       l.lesson_time,
          durationMinutes: l.duration_minutes,
          studentName:     null,  // non affiché dans la grille — ce sont les cours existants en fond
        }))

        setResponses(respRes.data ?? [])
        setExistingLessons(mappedLessons)
        setSchools(schoolsRes.data ?? [])
        setReservedSlots(reservedSlotsData)
      } catch (e) {
        setError(e.message)
      }
      setLoading(false)
    }
    load()
  }, [user?.id])

  // Calcul des propositions pour chaque réponse — délégué à computeProposals (partagé avec Rattrapage)
  const proposalsMap = useMemo(() => {
    const zone = teacherInfo?.zone ?? 'B'
    const map = {}
    for (const r of responses) {
      map[r.id] = computeProposals({
        response: r,
        existingLessons,
        schools,
        zone,
        maxResults: 5,
        reservedSlots,
        preferredDaysOff:       teacherInfo?.preferredDaysOff      ?? [],
        preferredProximityDays: teacherInfo?.preferredProximityDays ?? [],
        teacherHomeLat:         teacherInfo?.homeLat               ?? null,
        teacherHomeLng:         teacherInfo?.homeLng               ?? null,
      })
    }
    return map
  }, [responses, existingLessons, schools, teacherInfo, reservedSlots])

  // ── Vue grille : jours de la semaine affichée ──────────────────────────────
  const weekDays = useMemo(() => computeWeekDays(weekOffset), [weekOffset])

  /**
   * Faux cours représentant les propositions dans la grille.
   * Chaque proposition est projetée sur le jour correspondant de la semaine affichée
   * (sauf si l'utilisateur l'a déjà déplacée — override conserve la date exacte).
   * planningStatus 'envisage' → style bordure pointillée, opacité 0.6 (déjà géré par WeekGridPlanning).
   */
  const proposalLessons = useMemo(() => {
    // Index nom-de-jour → date ISO de la semaine affichée
    const isoParJour = {}
    for (const d of weekDays) {
      const nomJour = JOURS_FR[new Date(d.iso + 'T12:00:00').getDay()]
      isoParJour[nomJour] = d.iso
    }

    return responses
      .map((response) => {
        const override = proposalOverrides[response.id]
        const base     = proposalsMap[response.id]?.[0]
        const proposal = override ?? base
        if (!proposal) return null

        // Si l'utilisateur a déplacé la proposition, conserver sa date exacte ;
        // sinon la projeter sur la semaine affichée pour qu'elle soit toujours visible.
        const lessonDate = override
          ? override.candidateDate
          : (isoParJour[proposal.day] ?? proposal.candidateDate)

        return {
          id:              `proposal-${response.id}`,
          lessonDate,
          lessonTime:      proposal.startTime,
          timeLabel:       proposal.startTime,
          durationMinutes: proposal.durationMinutes,
          studentName:     [response.first_name, response.last_name].filter(Boolean).join(' ') || 'Élève',
          schoolName:      response.school_name ?? null,
          planningStatus:  'envisage',  // → bordure pointillée dans WeekGridPlanning
          // Méta : retrouver le contexte pour recalculer le score après déplacement
          _responseId:     response.id,
        }
      })
      .filter(Boolean)
  }, [responses, proposalsMap, proposalOverrides, weekDays])

  /**
   * Cours affichés dans la grille = cours réels de la semaine (en lecture seule, fond)
   * + propositions (déplaçables).
   * Les cours réels ont nonMovable: true pour bloquer le drag et éviter toute modification.
   */
  const lessonsForGrid = useMemo(() => {
    const weekIsos = new Set(weekDays.map((d) => d.iso))
    const coursReels = existingLessons
      .filter((l) => weekIsos.has(l.lessonDate))
      .map((l) => ({ ...l, nonMovable: true }))
    return [...coursReels, ...proposalLessons]
  }, [existingLessons, proposalLessons, weekDays])

  /**
   * Appelé par WeekGridPlanning quand une proposition est glissée vers un nouveau créneau.
   * Recalcule le score côté client (scoreCandidate) sans aucune requête serveur.
   * Met à jour proposalOverrides avec la nouvelle position et le nouveau score.
   */
  const handleMoveProposal = useCallback(async ({ lesson, newDate, newTime, durationMinutes }) => {
    const responseId = lesson._responseId
    const response   = responses.find((r) => r.id === responseId)
    if (!response) return

    // Nom du jour (ex : "Lundi") depuis la date ISO
    const nomJour = JOURS_FR[new Date(newDate + 'T12:00:00').getDay()]

    // Construire le slot au format "HH:MM–HH:MM" attendu par scoreCandidate
    const finMin = timeToMinutes(newTime) + durationMinutes
    const finH   = Math.floor(finMin / 60)
    const finM   = finMin % 60
    const slot   = `${newTime}–${String(finH).padStart(2, '0')}:${String(finM).padStart(2, '0')}`

    const result = scoreCandidate({
      day:                    nomJour,
      slot,
      slotsCount:             Math.max(1, Math.round(durationMinutes / 15)),
      response,
      existingLessons,
      schools,
      zone:                   teacherInfo?.zone               ?? 'B',
      reservedSlots,
      preferredDaysOff:       teacherInfo?.preferredDaysOff   ?? [],
      preferredProximityDays: teacherInfo?.preferredProximityDays ?? [],
      teacherHomeLat:         teacherInfo?.homeLat            ?? null,
      teacherHomeLng:         teacherInfo?.homeLng            ?? null,
    })

    // WeekGridPlanning a déjà vérifié les conflits — result ne devrait pas être null,
    // mais on se défend par précaution (score 0, pas de raisons).
    setProposalOverrides((prev) => ({
      ...prev,
      [responseId]: {
        candidateDate:   newDate,
        startTime:       newTime,
        durationMinutes,
        day:             nomJour,
        score:           result?.score   ?? 0,
        reasons:         result?.reasons ?? [],
      },
    }))
  }, [responses, existingLessons, schools, teacherInfo, reservedSlots])

  /**
   * Transforme une proposition acceptée en série de cours hebdomadaires jusqu'à la fin de l'année scolaire.
   * Partagé entre vue liste et vue grille — les deux appellent cette même fonction.
   * Dans la vue grille, proposal = proposalOverrides[id] ?? proposalsMap[id][0],
   * donc la date/heure finale choisie par l'utilisateur est respectée.
   */
  const handleConfirm = async (response, proposal) => {
    setConfirming(true)
    try {
      const groupId = crypto.randomUUID()
      const [, endYear] = currentSchoolYear().split('-').map(Number)
      const endDate = `${endYear}-06-30`
      const rows = []
      let current = new Date(proposal.candidateDate + 'T00:00:00')
      const end   = new Date(endDate + 'T00:00:00')
      while (current <= end) {
        const pad = (n) => String(n).padStart(2, '0')
        const iso = current.getFullYear() + '-' + pad(current.getMonth() + 1) + '-' + pad(current.getDate())
        rows.push({
          teacher_id:       teacherInfo.id,
          student_id:       response.student_id,
          lesson_date:      iso,
          lesson_time:      proposal.startTime,
          duration_minutes: proposal.durationMinutes,
          status:           'planifie',
          topic:            'Cours de guitare',
          recurrence_group: groupId,
        })
        current.setDate(current.getDate() + 7)
      }
      const { error: insErr } = await supabase.from('lessons').insert(rows)
      if (insErr) throw new Error(insErr.message)

      await supabase
        .from('survey_responses')
        .update({ status: 'confirme', assigned_day: proposal.day, assigned_time: proposal.startTime })
        .eq('id', response.id)

      setConfirming(false)
      return true
    } catch (e) {
      alert('Erreur : ' + e.message)
      setConfirming(false)
      return false
    }
  }

  // ── Label de navigation semaine ────────────────────────────────────────────
  const labelSemaine = useMemo(() => {
    if (weekDays.length === 0) return ''
    const premier = weekDays[0]
    const dernier = weekDays[6]
    const d1 = new Date(premier.iso + 'T12:00:00')
    const d2 = new Date(dernier.iso + 'T12:00:00')
    const opts = { day: 'numeric', month: 'short' }
    return d1.toLocaleDateString('fr-FR', opts) + ' – ' + d2.toLocaleDateString('fr-FR', { ...opts, year: 'numeric' })
  }, [weekDays])

  return (
    <div className="p-6 sm:p-8 max-w-5xl">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-guitar-600/15 flex items-center justify-center">
            <Brain className="w-5 h-5 text-guitar-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Planning intelligent</h1>
              <HelpTooltip texte="Génère des propositions de créneaux en croisant vos disponibilités, celles des élèves et les contraintes de chaque école. Configurez les créneaux dans la page Créneaux écoles." position="bottom" />
            </div>
            <p className="text-muted-foreground mt-0.5">Propositions de créneaux basées sur les disponibilités et le contexte</p>
          </div>
        </div>
        <div className="mt-4 px-4 py-3 rounded-xl bg-surface-raised border border-border-subtle text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground mb-1">Critères de score</p>
          <p>+3 même école déjà planifiée ce jour · +2 créneau adjacent à la même école</p>
          <p>+1 pas de débutants consécutifs · +1 en-dessous du volume d'heures souhaité</p>
          <p>-1 au-dessus du volume souhaité · -2 période de vacances scolaires</p>
          <p className="text-muted">-2 jour à éviter · +1 école proche du domicile (jour préféré) — configurables dans Réglages</p>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Analyse des disponibilités…</span>
        </div>
      ) : error ? (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-guitar-600/10 border border-guitar-600/20 text-sm text-guitar-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      ) : responses.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center">
          <Clock className="w-8 h-8 text-muted mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aucune réponse en attente d'attribution.</p>
          <p className="text-xs text-muted mt-1">Toutes les inscriptions ont déjà un créneau confirmé.</p>
        </div>
      ) : (
        <>
          {/* ── Sélecteur de vue ─────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex gap-1 p-1 rounded-xl bg-surface-raised border border-border-subtle">
              <button
                type="button"
                onClick={() => setVue('liste')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  vue === 'liste' ? 'guitar-gradient text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="w-4 h-4" /> Récapitulatif
              </button>
              <button
                type="button"
                onClick={() => setVue('grille')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  vue === 'grille' ? 'guitar-gradient text-white' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LayoutGrid className="w-4 h-4" /> Grille semaine
              </button>
            </div>

            {/* Navigation semaine — visible uniquement en vue grille */}
            {vue === 'grille' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWeekOffset((v) => v - 1)}
                  className="p-1.5 rounded-lg border border-border-subtle hover:bg-surface-overlay transition-colors"
                  aria-label="Semaine précédente"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-muted-foreground font-medium min-w-[140px] text-center">
                  {labelSemaine}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekOffset((v) => v + 1)}
                  className="p-1.5 rounded-lg border border-border-subtle hover:bg-surface-overlay transition-colors"
                  aria-label="Semaine suivante"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                {weekOffset !== 0 && (
                  <button
                    type="button"
                    onClick={() => setWeekOffset(0)}
                    className="text-xs text-guitar-400 hover:underline"
                  >
                    Aujourd'hui
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Vue récapitulatif ──────────────────────────────────────────── */}
          {vue === 'liste' && (
            <div className="space-y-4">
              {responses.map((r) => (
                <ProposalCard
                  key={r.id}
                  response={r}
                  proposals={proposalsMap[r.id] ?? []}
                  onConfirm={handleConfirm}
                  confirming={confirming}
                />
              ))}
            </div>
          )}

          {/* ── Vue grille ────────────────────────────────────────────────── */}
          {vue === 'grille' && (
            <div className="space-y-6">
              {/* Légende */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm border-2 border-dashed border-guitar-400 opacity-70" />
                  Proposition (déplaçable)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm border-2 border-solid border-muted" />
                  Cours existant (lecture seule)
                </span>
                <span className="text-muted italic">Glissez une proposition pour ajuster son créneau — le score se recalcule aussitôt.</span>
              </div>

              {/* Grille — les propositions y sont affichées en style "envisagé" (bordure pointillée) */}
              <WeekGridPlanning
                weekDays={weekDays}
                lessons={lessonsForGrid}
                reservedSlots={reservedSlots}
                onNewLesson={() => {}}
                onSelectLesson={() => {}}
                onDeleteLesson={() => {}}
                onMoveLesson={handleMoveProposal}
              />

              {/* Panneau de confirmation — une ligne par réponse, partage handleConfirm avec la vue liste */}
              <div className="space-y-2">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Confirmer un créneau
                </h2>
                {responses.map((response) => {
                  const override  = proposalOverrides[response.id]
                  const base      = proposalsMap[response.id]?.[0]
                  const proposal  = override ?? base
                  if (!proposal) return null

                  // Vérifier si la proposition est dans la semaine affichée
                  const isoParJour = {}
                  for (const d of weekDays) {
                    isoParJour[JOURS_FR[new Date(d.iso + 'T12:00:00').getDay()]] = d.iso
                  }
                  const dateAffichee = override
                    ? override.candidateDate
                    : (isoParJour[proposal.day] ?? proposal.candidateDate)
                  const dansLaSemaine = weekDays.some((d) => d.iso === dateAffichee)

                  return (
                    <div
                      key={response.id}
                      className={`glass-panel rounded-xl p-3 flex items-center gap-3 flex-wrap transition-opacity ${dansLaSemaine ? '' : 'opacity-50'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {response.first_name || '—'} {response.last_name || ''}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {proposal.day} · {proposal.startTime} · {proposal.durationMinutes} min
                          {override && <span className="ml-1.5 text-guitar-400">✎ modifié</span>}
                        </p>
                        {proposal.reasons?.length > 0 && (
                          <p className="text-[10px] text-muted mt-0.5 truncate">
                            {proposal.reasons[0]}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <ScoreBadge score={proposal.score} />
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await handleConfirm(response, proposal)
                            // Retire la réponse confirmée de la liste sans recharger
                            if (ok) setResponses((prev) => prev.filter((r) => r.id !== response.id))
                          }}
                          disabled={confirming || !dansLaSemaine}
                          title={!dansLaSemaine ? 'Naviguez vers la semaine où se trouve cette proposition pour la confirmer' : undefined}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl guitar-gradient text-white text-xs font-medium disabled:opacity-40"
                        >
                          {confirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Confirmer
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
