import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Loader2, Star, CalendarDays, AlertCircle, Check, Brain, Clock, School } from 'lucide-react'
import { isVacances } from '../utils/vacances'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

function nextDateForDay(dayName) {
  const target = JOURS_FR.indexOf(dayName)
  const today = new Date()
  let diff = target - today.getDay()
  if (diff <= 0) diff += 7
  const d = new Date(today)
  d.setDate(today.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function parseStartTime(slot) {
  return slot.split('–')[0].trim()
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

async function getTeacherId() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('id, school_zone').eq('id', user.id).single()
  return { id: data?.id ?? null, zone: data?.school_zone ?? 'B' }
}

// ─── Moteur de score ──────────────────────────────────────────────────────────

/**
 * Score un candidat (day, slot) pour une réponse de sondage.
 * Retourne { score, reasons } — score > 0 est valide.
 */
function scoreCandidate({ day, slot, slotsCount, response, existingLessons, schools, zone }) {
  const reasons = []
  let score = 0

  const candidateDate   = nextDateForDay(day)
  const startTime       = parseStartTime(slot)
  const startMin        = timeToMinutes(startTime)
  const durationMinutes = slotsCount * 15

  // ── Vérification conflits stricts ─────────────────────────────────────────
  const sameDayLessons = existingLessons.filter((l) => l.lesson_date === candidateDate || l.lessonDate === candidateDate)
  const hasConflict = sameDayLessons.some((l) => {
    const ls = timeToMinutes(l.lesson_time ?? l.lessonTime ?? '00:00')
    const le = ls + (l.duration_minutes ?? l.durationMinutes ?? 45)
    const cs = startMin
    const ce = cs + durationMinutes
    return cs < le && ce > ls
  })
  if (hasConflict) return null // créneau impossible

  // ── Même école ce jour ────────────────────────────────────────────────────
  const schoolName = response.school_name ?? ''
  const sameDaySchool = sameDayLessons.filter((l) => (l.schoolName ?? l.student?.school_name ?? '') === schoolName && schoolName)
  if (sameDaySchool.length > 0) {
    score += 3
    reasons.push(`+3 : même école (${schoolName}) déjà prévue ce jour`)
  }

  // ── Créneau adjacent à la même école ─────────────────────────────────────
  const isAdjacent = sameDaySchool.some((l) => {
    const ls = timeToMinutes(l.lesson_time ?? l.lessonTime ?? '00:00')
    const le = ls + (l.duration_minutes ?? l.durationMinutes ?? 45)
    return Math.abs(startMin - le) <= 5 || Math.abs(ls - (startMin + durationMinutes)) <= 5
  })
  if (isAdjacent) {
    score += 2
    reasons.push('+2 : créneau adjacent à un cours de la même école')
  }

  // ── Éviter les débutants consécutifs ─────────────────────────────────────
  const level = (response.level ?? '').toLowerCase()
  const isBeginnerCandidate = level.includes('débutant') || level.includes('debutant') || level === '0' || response.practice_years === 0
  if (!isBeginnerCandidate) {
    const hasAdjacentBeginner = sameDayLessons.some((l) => {
      const ls = timeToMinutes(l.lesson_time ?? l.lessonTime ?? '00:00')
      const le = ls + (l.duration_minutes ?? l.durationMinutes ?? 45)
      const isAdj = Math.abs(startMin - le) <= 5 || Math.abs(ls - (startMin + durationMinutes)) <= 5
      return isAdj && l.student?.level?.toLowerCase().includes('debutant')
    })
    if (!hasAdjacentBeginner) {
      score += 1
      reasons.push('+1 : pas de débutants consécutifs')
    }
  }

  // ── Heures hebdomadaires ──────────────────────────────────────────────────
  const school = schools.find((s) => s.name === schoolName)
  if (school) {
    const current  = school.current_weekly_hours ?? 0
    const desired  = school.desired_weekly_hours ?? null
    if (desired != null) {
      if (current < desired) {
        score += 1
        reasons.push(`+1 : en-dessous du volume souhaité (${current}h actuel < ${desired}h souhaité)`)
      } else if (current > desired) {
        score -= 1
        reasons.push(`-1 : au-dessus du volume souhaité (${current}h actuel > ${desired}h souhaité)`)
      }
    }
  }

  // ── Période de vacances ───────────────────────────────────────────────────
  const vac = isVacances(candidateDate, zone)
  if (vac) {
    score -= 2
    reasons.push(`-2 : période de vacances (${vac.label})`)
  }

  return { score, reasons, candidateDate, startTime, durationMinutes }
}

// ─── Composants ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }) {
  const color = score >= 4 ? 'text-green-400 border-green-500/30 bg-green-500/10'
    : score >= 2 ? 'text-guitar-400 border-guitar-600/30 bg-guitar-600/10'
    : score >= 0 ? 'text-muted-foreground border-border-subtle bg-surface-raised'
    : 'text-amber-400 border-amber-500/30 bg-amber-500/10'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-medium ${color}`}>
      <Star className="w-3 h-3" fill="currentColor" />
      {score >= 0 ? '+' : ''}{score}
    </span>
  )
}

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
  const [responses, setResponses]         = useState([])
  const [existingLessons, setExistingLessons] = useState([])
  const [schools, setSchools]             = useState([])
  const [teacherInfo, setTeacherInfo]     = useState(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')
  const [confirming, setConfirming]       = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const tInfo = await getTeacherId()
        if (!tInfo?.id) { setError('Non authentifié'); setLoading(false); return }
        setTeacherInfo(tInfo)

        const today = new Date().toISOString().slice(0, 10)
        const inFourWeeks = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10)

        const [respRes, lessonsRes, schoolsRes] = await Promise.all([
          supabase.from('survey_responses').select('*').neq('status', 'confirme').order('submitted_at', { ascending: false }),
          supabase.from('lessons').select('id, lesson_date, lesson_time, duration_minutes, student_id, students(school_name, level)').eq('teacher_id', tInfo.id).gte('lesson_date', today).lte('lesson_date', inFourWeeks),
          supabase.from('schools').select('id, name, current_weekly_hours, desired_weekly_hours').eq('teacher_id', tInfo.id),
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
      } catch (e) {
        setError(e.message)
      }
      setLoading(false)
    }
    load()
  }, [])

  // Calcul des propositions pour chaque réponse
  const proposalsMap = useMemo(() => {
    const zone = teacherInfo?.zone ?? 'B'
    const map = {}
    for (const r of responses) {
      const avail = r.availabilities ?? {}
      const candidates = []
      for (const [day, slots] of Object.entries(avail)) {
        if (!Array.isArray(slots) || slots.length === 0) continue
        for (let i = 0; i < slots.length; i++) {
          // Essayer 1, 2, 3 créneaux consécutifs (15, 30, 45 min)
          const maxSlots = Math.min(4, slots.length - i)
          for (let count = 1; count <= maxSlots; count++) {
            const selectedSlots = slots.slice(i, i + count)
            // Vérifier que les slots sont consécutifs (on fait confiance au tri du sondage)
            const result = scoreCandidate({
              day,
              slot: selectedSlots[0],
              slotsCount: count,
              response: r,
              existingLessons,
              schools,
              zone,
            })
            if (result !== null) {
              candidates.push({ day, slot: selectedSlots[0], slotsCount: count, ...result })
            }
          }
        }
      }
      // Dédupliquer par (day, startTime, durationMinutes) et trier par score desc
      const seen = new Set()
      const unique = candidates.filter(({ day, startTime, durationMinutes }) => {
        const key = `${day}|${startTime}|${durationMinutes}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      map[r.id] = unique.sort((a, b) => b.score - a.score).slice(0, 5)
    }
    return map
  }, [responses, existingLessons, schools, teacherInfo])

  const handleConfirm = async (response, proposal) => {
    setConfirming(true)
    try {
      const groupId = crypto.randomUUID()
      const endDate = '2027-06-30'
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
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Planning intelligent</h1>
            <p className="text-muted-foreground mt-0.5">Propositions de créneaux basées sur les disponibilités et le contexte</p>
          </div>
        </div>
        <div className="mt-4 px-4 py-3 rounded-xl bg-surface-raised border border-border-subtle text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground mb-1">Critères de score</p>
          <p>+3 même école déjà planifiée ce jour · +2 créneau adjacent à la même école</p>
          <p>+1 pas de débutants consécutifs · +1 en-dessous du volume d'heures souhaité</p>
          <p>-1 au-dessus du volume souhaité · -2 période de vacances scolaires</p>
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
