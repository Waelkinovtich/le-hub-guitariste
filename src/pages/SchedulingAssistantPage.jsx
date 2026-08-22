import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Loader2, CalendarDays, AlertCircle, Check, Brain, Clock, School } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import HelpTooltip from '../components/HelpTooltip'
import ScoreBadge from '../components/ScoreBadge'
import { computeProposals } from '../utils/scoringCreneaux'
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
              // Raisons présentes dans cet alternatif mais absentes de la meilleure proposition
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
                  {/* Comparaison explicite avec la proposition principale (3c) */}
                  <p className="mt-1.5 text-xs text-muted-foreground italic">
                    {deltaLabel}{comparisonDetail ? ' ' + comparisonDetail : ''}
                  </p>
                  {/* Raisons détaillées (3b) */}
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

        // Mapper lessons avec school_name via students
        const mappedLessons = (lessonsRes.data ?? []).map((l) => ({
          ...l,
          schoolName: l.students?.school_name ?? null,
          lessonDate: l.lesson_date,
          lessonTime: l.lesson_time,
          durationMinutes: l.duration_minutes,
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
        preferredDaysOff:      teacherInfo?.preferredDaysOff      ?? [],
        preferredProximityDays: teacherInfo?.preferredProximityDays ?? [],
        teacherHomeLat:        teacherInfo?.homeLat               ?? null,
        teacherHomeLng:        teacherInfo?.homeLng               ?? null,
      })
    }
    return map
  }, [responses, existingLessons, schools, teacherInfo, reservedSlots])

  const handleConfirm = async (response, proposal) => {
    setConfirming(true)
    try {
      const groupId = crypto.randomUUID()
      // Fin de l'année scolaire en cours (ex: '2026-2027' → '2027-06-30').
      // Recalculé à chaque confirmation : si on est en été, bascule automatiquement
      // sur l'année suivante sans modifier le code.
      const [, endYear] = currentSchoolYear().split('-').map(Number)
      const endDate = `${endYear}-06-30`
      const rows = []
      let current = new Date(proposal.candidateDate + 'T00:00:00')
      const end = new Date(endDate + 'T00:00:00')
      while (current <= end) {
        const pad = (n) => String(n).padStart(2, '0')
        const iso = current.getFullYear() + '-' + pad(current.getMonth() + 1) + '-' + pad(current.getDate())
        rows.push({
          teacher_id: teacherInfo.id,
          student_id: response.student_id,
          lesson_date: iso,
          lesson_time: proposal.startTime,
          duration_minutes: proposal.durationMinutes,
          status: 'planifie',
          topic: 'Cours de guitare',
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

  return (
    <div className="p-6 sm:p-8 max-w-2xl">
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
    </div>
  )
}
