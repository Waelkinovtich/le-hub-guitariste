// Moteur de score partagé — Planning Intelligent ET module Rattrapage.
// Toutes les fonctions sont pures (pas d'effet de bord) pour être testables
// indépendamment du JSX qui les consomme.
import { isVacances } from './vacances'

export const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

/**
 * Retourne la date ISO de la prochaine occurrence d'un jour nommé (ex : "Lundi").
 * Toujours dans le futur (demain minimum, jamais aujourd'hui).
 */
export function nextDateForDay(dayName) {
  const target = JOURS_FR.indexOf(dayName)
  const today  = new Date()
  let diff = target - today.getDay()
  if (diff <= 0) diff += 7
  const d = new Date(today)
  d.setDate(today.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

/** Extrait l'heure de début d'un créneau formaté "HH:MM–HH:MM". */
export function parseStartTime(slot) {
  return slot.split('–')[0].trim()
}

/** Convertit "HH:MM" en nombre de minutes depuis minuit. */
export function timeToMinutes(timeStr) {
  const [h, m] = (timeStr ?? '00:00').split(':').map(Number)
  return h * 60 + (m || 0)
}

// ─── Constantes de score ──────────────────────────────────────────────────────
// Sources des valeurs : décisions pédagogiques documentées dans /admin/planning-intelligent
const SCORE_MEME_ECOLE        =  3  // regroupement des déplacements
const SCORE_ADJACENT_MEME_ECO =  2  // optimise la plage horaire d'une école
const SCORE_PAS_DEBUTANTS_CONS =  1 // alternance pédagogique (fatigue du prof)
const SCORE_VOLUME_SOUS_OBJECTIF= 1  // favorise le remplissage des écoles sous-capacitaires
const SCORE_VOLUME_SUR_OBJECTIF = -1 // pénalise le dépassement du volume contractuel
const SCORE_VACANCES           = -2  // préférence générale : éviter de charger les vacances
const ADJACENCE_TOLERANCE_MIN  =   5 // tolérance en minutes pour déclarer deux cours "adjacents"

/**
 * Score un candidat (jour + créneau) pour un élève dont on connaît les disponibilités.
 *
 * @param {string}   day              - Nom du jour (ex : "Lundi")
 * @param {string}   slot             - Premier créneau (ex : "14:00–14:15")
 * @param {number}   slotsCount       - Nombre de tranches de 15 min consécutives
 * @param {object}   response         - Ligne survey_responses (school_name, level, availabilities)
 * @param {Array}    existingLessons  - Cours déjà planifiés (lesson_date|lessonDate, lesson_time|lessonTime, duration_minutes|durationMinutes, schoolName)
 * @param {Array}    schools          - Écoles du prof (name, current_weekly_hours, desired_weekly_hours)
 * @param {string}   zone             - Zone scolaire du prof ('A' | 'B' | 'C')
 * @returns {{ score, reasons, candidateDate, startTime, durationMinutes } | null}
 *          null si le créneau est impossible (conflit horaire).
 */
export function scoreCandidate({ day, slot, slotsCount, response, existingLessons, schools, zone }) {
  const reasons = []
  let score = 0

  const candidateDate   = nextDateForDay(day)
  const startTime       = parseStartTime(slot)
  const startMin        = timeToMinutes(startTime)
  const durationMinutes = slotsCount * 15

  // ── Conflits stricts (retourne null → créneau écarté définitivement) ────────
  const sameDayLessons = existingLessons.filter(
    (l) => (l.lesson_date ?? l.lessonDate) === candidateDate
  )
  const hasConflict = sameDayLessons.some((l) => {
    const ls = timeToMinutes(l.lesson_time ?? l.lessonTime ?? '00:00')
    const le = ls + (l.duration_minutes ?? l.durationMinutes ?? 45)
    const cs = startMin
    const ce = cs + durationMinutes
    return cs < le && ce > ls
  })
  if (hasConflict) return null

  // ── Bonus : même école ce jour ────────────────────────────────────────────
  const schoolName = response.school_name ?? ''
  const sameDaySchool = sameDayLessons.filter(
    (l) => (l.schoolName ?? l.student?.school_name ?? '') === schoolName && schoolName
  )
  if (sameDaySchool.length > 0) {
    score += SCORE_MEME_ECOLE
    reasons.push(`+${SCORE_MEME_ECOLE} : même école (${schoolName}) déjà prévue ce jour`)
  }

  // ── Bonus : créneau adjacent à la même école ──────────────────────────────
  const isAdjacent = sameDaySchool.some((l) => {
    const ls = timeToMinutes(l.lesson_time ?? l.lessonTime ?? '00:00')
    const le = ls + (l.duration_minutes ?? l.durationMinutes ?? 45)
    return (
      Math.abs(startMin - le) <= ADJACENCE_TOLERANCE_MIN ||
      Math.abs(ls - (startMin + durationMinutes)) <= ADJACENCE_TOLERANCE_MIN
    )
  })
  if (isAdjacent) {
    score += SCORE_ADJACENT_MEME_ECO
    reasons.push(`+${SCORE_ADJACENT_MEME_ECO} : créneau adjacent à un cours de la même école`)
  }

  // ── Bonus : éviter les débutants consécutifs ──────────────────────────────
  const level = (response.level ?? '').toLowerCase()
  const isBeginnerCandidate =
    level.includes('débutant') || level.includes('debutant') ||
    level === '0' || response.practice_years === 0
  if (!isBeginnerCandidate) {
    const hasAdjacentBeginner = sameDayLessons.some((l) => {
      const ls = timeToMinutes(l.lesson_time ?? l.lessonTime ?? '00:00')
      const le = ls + (l.duration_minutes ?? l.durationMinutes ?? 45)
      const isAdj =
        Math.abs(startMin - le) <= ADJACENCE_TOLERANCE_MIN ||
        Math.abs(ls - (startMin + durationMinutes)) <= ADJACENCE_TOLERANCE_MIN
      return isAdj && (l.student?.level ?? '').toLowerCase().includes('debutant')
    })
    if (!hasAdjacentBeginner) {
      score += SCORE_PAS_DEBUTANTS_CONS
      reasons.push(`+${SCORE_PAS_DEBUTANTS_CONS} : pas de débutants consécutifs`)
    }
  }

  // ── Volume hebdomadaire par rapport à l'objectif ──────────────────────────
  const school = schools.find((s) => s.name === schoolName)
  if (school) {
    const current = school.current_weekly_hours ?? 0
    const desired = school.desired_weekly_hours ?? null
    if (desired != null) {
      if (current < desired) {
        score += SCORE_VOLUME_SOUS_OBJECTIF
        reasons.push(`+${SCORE_VOLUME_SOUS_OBJECTIF} : en-dessous du volume souhaité (${current}h < ${desired}h)`)
      } else if (current > desired) {
        score += SCORE_VOLUME_SUR_OBJECTIF
        reasons.push(`${SCORE_VOLUME_SUR_OBJECTIF} : au-dessus du volume souhaité (${current}h > ${desired}h)`)
      }
    }
  }

  // ── Pénalité vacances ─────────────────────────────────────────────────────
  const vac = isVacances(candidateDate, zone)
  if (vac) {
    score += SCORE_VACANCES
    reasons.push(`${SCORE_VACANCES} : période de vacances (${vac.label})`)
  }

  return { score, reasons, candidateDate, startTime, durationMinutes }
}

/**
 * Calcule les meilleures propositions de créneaux pour une réponse de sondage.
 * Réutilisable depuis le Planning Intelligent ET le module Rattrapage.
 *
 * @param {object} response        - Ligne survey_responses avec champ `availabilities`
 * @param {Array}  existingLessons - Cours planifiés (pour conflits)
 * @param {Array}  schools         - Écoles du prof
 * @param {string} zone            - Zone scolaire
 * @param {number} maxResults      - Nombre max de propositions retournées (défaut 5)
 * @returns {Array}                - Propositions triées par score desc, sans doublons
 */
export function computeProposals({ response, existingLessons, schools, zone, maxResults = 5 }) {
  const avail = response.availabilities ?? {}
  const candidates = []

  for (const [day, slots] of Object.entries(avail)) {
    if (!Array.isArray(slots) || slots.length === 0) continue
    for (let i = 0; i < slots.length; i++) {
      // Tenter 1 à 4 créneaux consécutifs de 15 min (15, 30, 45, 60 min)
      const maxSlots = Math.min(4, slots.length - i)
      for (let count = 1; count <= maxSlots; count++) {
        const result = scoreCandidate({
          day,
          slot: slots[i],
          slotsCount: count,
          response,
          existingLessons,
          schools,
          zone,
        })
        if (result !== null) {
          candidates.push({ day, slot: slots[i], slotsCount: count, ...result })
        }
      }
    }
  }

  // Dédupliquer par (day, startTime, durationMinutes) puis trier par score desc
  const seen = new Set()
  return candidates
    .filter(({ day, startTime, durationMinutes }) => {
      const key = `${day}|${startTime}|${durationMinutes}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
}
