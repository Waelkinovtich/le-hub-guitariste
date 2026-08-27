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

// ─── Calcul de distance (Haversine simplifié) ─────────────────────────────────
// Source : formule Haversine standard (R = 6371 km).
// Utilisé pour le bonus de proximité domicile.

function haversineKm(lat1, lng1, lat2, lng2) {
  const R   = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Constantes de score ──────────────────────────────────────────────────────
// Sources des valeurs : décisions pédagogiques documentées dans /admin/planning-intelligent.
// Ces constantes représentent le score "plein" avant pondération par le poids (0–100).

const SCORE_MEME_ECOLE         =  3  // regroupement des déplacements
const SCORE_ADJACENT_MEME_ECO  =  2  // optimise la plage horaire d'une école
const SCORE_PAS_DEBUTANTS_CONS =  1  // alternance pédagogique (fatigue du prof)
const SCORE_VOLUME_SOUS_OBJECTIF=  1  // favorise le remplissage des écoles sous-capacitaires
const SCORE_VOLUME_SUR_OBJECTIF = -1  // pénalise le dépassement du volume contractuel
const SCORE_VACANCES           = -2  // préférence générale : éviter de charger les vacances

// Nouveaux facteurs — préférences de planification du prof
const SCORE_JOUR_EVITE         = -2  // jour dans preferred_days_off — influence le classement, n'élimine jamais
const SCORE_PROXIMITE_DOMICILE =  1  // école proche du domicile le jour de proximité préféré
const DISTANCE_PROXIMITE_KM    = 20  // seuil en km en dessous duquel une école est "proche du domicile"

const ADJACENCE_TOLERANCE_MIN  =  5  // tolérance en minutes pour déclarer deux cours "adjacents"

// Facteur regroupement par âge — seuils d'écart d'année de naissance
const SCORE_AGE_MEME_ANNEE  =  2   // même année de naissance : bonus plein
const SCORE_AGE_PROCHE      =  1   // écart dans la tolérance : demi-bonus
const AGE_WINDOW_MINUTES    = 90   // fenêtre autour du créneau candidat pour chercher des voisins d'âge
// AGE_ECART_PROCHE_MAX est configurable via profiles.ecart_age_proche (défaut 4) — pas de constante fixe.

// ─── Normalisation des préférences ───────────────────────────────────────────

/**
 * Convertit preferred_days_off vers le format objet unifié.
 * Rétrocompat : ancien format string[] → { jour, mode: 'toute_la_journee' }.
 *
 * Format attendu :
 *   { jour: 'Lundi', mode: 'toute_la_journee' }
 *   { jour: 'Samedi', mode: 'plage', heure_debut: '16:00', heure_fin: '20:00' }
 */
function normaliserJoursAEviter(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((entry) =>
    typeof entry === 'string'
      ? { jour: entry, mode: 'toute_la_journee' }
      : entry
  )
}

// ─── Application des poids ────────────────────────────────────────────────────

/**
 * Applique le poids (0–100) à un score de facteur.
 * poids null ou undefined → traité comme 100 (comportement inchangé, rétrocompat).
 * poids 0 → score 0 (facteur désactivé).
 */
function appliquerPoids(score, poids) {
  const p = poids ?? 100
  if (p === 0) return 0
  if (p === 100) return score
  return score * p / 100
}

// Seuil en dessous duquel un écart entre deux cours est considéré "serré" (demi-bonus compacité).
const COMPACITE_GAP_SERRE_MIN = 30

// ─── Facteur compacité horaire ────────────────────────────────────────────────

/**
 * Bonus de compacité : favorise les journées sans trous.
 * Retourne un score positif si le créneau candidat est adjacent ou proche
 * d'un cours existant sur la même journée (toutes écoles confondues).
 *
 * @param {number} startMin — début du candidat (minutes depuis minuit)
 * @param {number} endMin   — fin du candidat
 * @param {Array}  sameDayLessons — cours du même jour
 * @returns {number} 0, 1 (serre) ou 2 (adjacent)
 */
export function calculerScoreCompacite(startMin, endMin, sameDayLessons) {
  if (sameDayLessons.length === 0) return 0
  let minGap = Infinity
  for (const l of sameDayLessons) {
    const ls = timeToMinutes(l.lesson_time ?? l.lessonTime ?? '00:00')
    const le = ls + (l.duration_minutes ?? l.durationMinutes ?? 45)
    // Ne pas mesurer les cours qui se chevauchent (éliminés plus haut)
    if (startMin >= le) minGap = Math.min(minGap, startMin - le)
    else if (endMin <= ls) minGap = Math.min(minGap, ls - endMin)
  }
  if (minGap === Infinity) return 0
  if (minGap <= ADJACENCE_TOLERANCE_MIN)  return 2  // adjacent : bonus plein
  if (minGap <= COMPACITE_GAP_SERRE_MIN)  return 1  // écart serré : demi-bonus
  return 0
}

// ─── Facteur regroupement par âge ────────────────────────────────────────────

/**
 * Calcule le bonus de regroupement par âge pour un candidat créneau.
 *
 * Cherche parmi les cours du même jour dont l'heure est "proche" du créneau
 * candidat (fenêtre AGE_WINDOW_MINUTES de part et d'autre) ceux dont l'élève
 * a une année de naissance connue. Si l'écart avec l'année de naissance du
 * candidat est faible, retourne un bonus.
 *
 * @param {number|null} birthYearCandidat — année de naissance de l'élève du candidat
 * @param {number}      startMin          — heure de début du candidat (minutes depuis minuit)
 * @param {Array}       sameDayLessons    — cours du même jour (doivent contenir student.birth_year)
 * @param {number}      ecartMax          — écart max en années pour le demi-bonus (configurable, défaut 4)
 * @returns {number} bonus (0, SCORE_AGE_PROCHE ou SCORE_AGE_MEME_ANNEE)
 */
export function calculerBonusAge(birthYearCandidat, startMin, sameDayLessons, ecartMax = 4) {
  if (!birthYearCandidat) return 0

  let bestBonus = 0
  for (const lesson of sameDayLessons) {
    const birthYearVoisin = lesson.student?.birth_year ?? lesson.birthYear ?? null
    if (!birthYearVoisin) continue

    const ls = timeToMinutes(lesson.lesson_time ?? lesson.lessonTime ?? '00:00')
    // Fenêtre temporelle : cours proches du créneau candidat
    if (Math.abs(ls - startMin) > AGE_WINDOW_MINUTES) continue

    const ecart = Math.abs(birthYearCandidat - birthYearVoisin)
    if (ecart === 0) {
      bestBonus = Math.max(bestBonus, SCORE_AGE_MEME_ANNEE)
    } else if (ecart <= ecartMax) {
      bestBonus = Math.max(bestBonus, SCORE_AGE_PROCHE)
    }
  }
  return bestBonus
}

/**
 * Score un candidat (jour + créneau) pour un élève dont on connaît les disponibilités.
 *
 * @param {string}   day              - Nom du jour (ex : "Lundi")
 * @param {string}   slot             - Premier créneau (ex : "14:00–14:15")
 * @param {number}   slotsCount       - Nombre de tranches de 15 min consécutives
 * @param {object}   response         - Ligne survey_responses (school_name, level, availabilities, birth_year)
 * @param {Array}    existingLessons  - Cours déjà planifiés (lesson_date|lessonDate, lesson_time|lessonTime, duration_minutes|durationMinutes, schoolName, student)
 * @param {Array}    schools          - Écoles du prof (name, current_weekly_hours, desired_weekly_hours, latitude, longitude)
 * @param {string}   zone             - Zone scolaire du prof ('A' | 'B' | 'C')
 * @param {Array}    reservedSlots    - Créneaux réservés du prof ({ jourSemaine, heureDebut, dureeMinutes }) — traités comme des conflits
 * @param {Array}    preferredDaysOff - Jours à éviter.
 *   Nouveau format : [{ jour: 'Lundi', mode: 'toute_la_journee' }]
 *                 ou [{ jour: 'Samedi', mode: 'plage', heure_debut: '16:00', heure_fin: '20:00' }]
 *   Ancien format (rétrocompat) : ["Lundi", "Mercredi"] — traité comme toute_la_journee.
 *   N'élimine jamais une proposition : influence uniquement le classement.
 * @param {string[]} preferredProximityDays - Jours où le prof préfère rester proche du domicile.
 *   Tableau de noms de jours, ex : ["Samedi", "Mercredi"]. Tableau vide = aucune préférence.
 *   Rétrocompat : string accepté → converti en [string].
 * @param {number}   teacherHomeLat   - Latitude du domicile du prof (ou null)
 * @param {number}   teacherHomeLng   - Longitude du domicile du prof (ou null)
 * @param {object}   scoringWeights   - Poids par facteur (0–100). null/absent → 100 pour chaque facteur.
 *   Clés : poids_regroupement_ecole, poids_adjacence, poids_alternance_debutants,
 *          poids_distance, poids_vacances, poids_regroupement_age.
 * @returns {{ score, reasons, candidateDate, startTime, durationMinutes } | null}
 *          null si le créneau est impossible (conflit horaire). Jamais null pour les préférences.
 */
export function scoreCandidate({
  day, slot, slotsCount, response, existingLessons, schools, zone,
  reservedSlots = [], preferredDaysOff = [], preferredProximityDays = [],
  teacherHomeLat = null, teacherHomeLng = null,
  scoringWeights = null,
}) {
  const reasons = []
  let score = 0

  const candidateDate   = nextDateForDay(day)
  const startTime       = parseStartTime(slot)
  const startMin        = timeToMinutes(startTime)
  const durationMinutes = slotsCount * 15
  const endMin          = startMin + durationMinutes

  // ── Conflits stricts : cours élèves existants (retourne null → créneau écarté) ─
  // Comparaison par jour de semaine (getDay) plutôt que par date ISO exacte :
  // candidateDate = nextDateForDay() est toujours en semaine N+1, mais les cours
  // existants sont souvent en semaine N. Sans ça, une proposition Lundi 10h00 (N+1)
  // ne serait pas bloquée par un cours Lundi 10h00 (N) et chevaucherait visuellement.
  const jourSemaineCandidat = JOURS_FR.indexOf(day)
  const sameDayLessons = existingLessons.filter((l) => {
    const dateStr = l.lesson_date ?? l.lessonDate
    return dateStr
      ? new Date(dateStr + 'T12:00:00').getDay() === jourSemaineCandidat
      : false
  })
  const hasLessonConflict = sameDayLessons.some((l) => {
    const ls = timeToMinutes(l.lesson_time ?? l.lessonTime ?? '00:00')
    const le = ls + (l.duration_minutes ?? l.durationMinutes ?? 45)
    return startMin < le && endMin > ls
  })
  if (hasLessonConflict) return null

  // ── Conflits stricts : créneaux réservés (même traitement que les cours) ──────
  // Un créneau réservé est hebdomadaire — on compare par jour de semaine
  // (JOURS_FR.indexOf(day) = même convention que JS Date.getDay()).
  const jourSemaineCandidат = JOURS_FR.indexOf(day)
  const hasReservedConflict = reservedSlots.some((rs) => {
    if (rs.jourSemaine !== jourSemaineCandidат) return false
    const rs_s = timeToMinutes(rs.heureDebut)
    const rs_e = rs_s + rs.dureeMinutes
    return startMin < rs_e && endMin > rs_s
  })
  if (hasReservedConflict) return null

  const w = scoringWeights ?? {}

  // ── Pénalité douce : vacances scolaires ──────────────────────────────────────
  // Les vacances ne bloquent pas structurellement (certains profs enseignent en vacances).
  // poids_vacances = 0 → ignoré, 100 → pénalité pleine de -2 pts.
  const vac = isVacances(candidateDate, zone)
  if (vac) {
    const s = appliquerPoids(SCORE_VACANCES, w.poids_vacances)
    if (s !== 0) {
      score += s
      reasons.push(`${s.toFixed(2).replace(/\.?0+$/, '')} : période de vacances (${vac.label})`)
    }
  }

  // ── Hard-exclude : hors de la plage scolaire de l'école ──────────────────────
  // date_reprise_cours et date_fin_cours définissent la fenêtre réelle de l'année.
  // Un créneau hors plage ne peut pas donner lieu à un cours — exclusion stricte.
  const schoolName = response.school_name ?? ''
  const schoolInfo = schools.find((s) => s.name === schoolName)
  if (schoolInfo) {
    if (schoolInfo.date_reprise_cours && candidateDate < schoolInfo.date_reprise_cours) return null
    if (schoolInfo.date_fin_cours     && candidateDate > schoolInfo.date_fin_cours)     return null
  }

  // ── Bonus : même école ce jour ────────────────────────────────────────────
  // schoolName et schoolInfo déjà calculés dans le bloc hard-exclude ci-dessus
  const sameDaySchool = sameDayLessons.filter(
    (l) => (l.schoolName ?? l.student?.school_name ?? '') === schoolName && schoolName
  )
  if (sameDaySchool.length > 0) {
    const s = appliquerPoids(SCORE_MEME_ECOLE, w.poids_regroupement_ecole)
    if (s !== 0) {
      score += s
      reasons.push(`+${s.toFixed(2).replace(/\.?0+$/, '')} : même école (${schoolName}) déjà prévue ce jour`)
    }
  }

  // ── Bonus : créneau adjacent à la même école ──────────────────────────────
  const isAdjacent = sameDaySchool.some((l) => {
    const ls = timeToMinutes(l.lesson_time ?? l.lessonTime ?? '00:00')
    const le = ls + (l.duration_minutes ?? l.durationMinutes ?? 45)
    return (
      Math.abs(startMin - le) <= ADJACENCE_TOLERANCE_MIN ||
      Math.abs(ls - endMin) <= ADJACENCE_TOLERANCE_MIN
    )
  })
  if (isAdjacent) {
    const s = appliquerPoids(SCORE_ADJACENT_MEME_ECO, w.poids_adjacence)
    if (s !== 0) {
      score += s
      reasons.push(`+${s.toFixed(2).replace(/\.?0+$/, '')} : créneau adjacent à un cours de la même école`)
    }
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
        Math.abs(ls - endMin) <= ADJACENCE_TOLERANCE_MIN
      return isAdj && (l.student?.level ?? '').toLowerCase().includes('debutant')
    })
    if (!hasAdjacentBeginner) {
      const s = appliquerPoids(SCORE_PAS_DEBUTANTS_CONS, w.poids_alternance_debutants)
      if (s !== 0) {
        score += s
        reasons.push(`+${s.toFixed(2).replace(/\.?0+$/, '')} : pas de débutants consécutifs`)
      }
    }
  }

  // ── Volume hebdomadaire par rapport à l'objectif ──────────────────────────
  // Facteur non pondérable (lié à la politique de volume par école, pas une préférence).
  if (schoolInfo) {
    const school = schoolInfo
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

  // ── Malus : jour à éviter (preferred_days_off) ────────────────────────────
  // Rétrocompat : ancien format string[] → toute_la_journee.
  // N'élimine jamais la proposition — influence uniquement le classement.
  const joursEvites = normaliserJoursAEviter(preferredDaysOff)
  for (const pref of joursEvites) {
    if (pref.jour !== day) continue
    if (pref.mode === 'toute_la_journee') {
      score += SCORE_JOUR_EVITE
      reasons.push(`${SCORE_JOUR_EVITE} : jour à éviter selon vos préférences`)
    } else if (pref.mode === 'plage' && pref.heure_debut && pref.heure_fin) {
      const plageDebut = timeToMinutes(pref.heure_debut)
      const plageFin   = timeToMinutes(pref.heure_fin)
      // Le créneau chevauche la plage à éviter
      if (startMin < plageFin && endMin > plageDebut) {
        score += SCORE_JOUR_EVITE
        reasons.push(`${SCORE_JOUR_EVITE} : plage horaire à éviter ce ${day} (${pref.heure_debut}–${pref.heure_fin})`)
      }
    }
    break  // un seul enregistrement par jour attendu
  }

  // ── Bonus : proximité domicile les jours préférés ─────────────────────────
  // preferredProximityDays : tableau de noms de jours (rétrocompat : string → [string]).
  const joursProximite = Array.isArray(preferredProximityDays)
    ? preferredProximityDays
    : preferredProximityDays ? [preferredProximityDays] : []
  if (
    joursProximite.includes(day) &&
    teacherHomeLat != null && teacherHomeLng != null &&
    schoolInfo?.latitude != null && schoolInfo?.longitude != null
  ) {
    const distKm = haversineKm(teacherHomeLat, teacherHomeLng, schoolInfo.latitude, schoolInfo.longitude)
    if (distKm < DISTANCE_PROXIMITE_KM) {
      const s = appliquerPoids(SCORE_PROXIMITE_DOMICILE, w.poids_distance)
      if (s !== 0) {
        score += s
        reasons.push(`+${s.toFixed(2).replace(/\.?0+$/, '')} : école proche du domicile (${Math.round(distKm)} km) ce ${day}`)
      }
    }
  }

  // ── Bonus : compacité horaire ─────────────────────────────────────────────
  // NULL = jamais configuré → priorité haute par défaut (100). 0 = désactivé explicitement.
  const poidsCompacite = w.poids_compacite ?? 100
  if (poidsCompacite > 0) {
    const bonusCompacite = calculerScoreCompacite(startMin, endMin, sameDayLessons)
    if (bonusCompacite > 0) {
      const s = appliquerPoids(bonusCompacite, poidsCompacite)
      if (s !== 0) {
        score += s
        const libelle = bonusCompacite >= 2 ? 'adjacent à un autre cours' : 'écart serré entre cours'
        reasons.push(`+${s.toFixed(2).replace(/\.?0+$/, '')} : compacité (${libelle})`)
      }
    }
  }

  // ── Bonus : regroupement par âge ─────────────────────────────────────────
  const poidsAge = w.poids_regroupement_age ?? 0
  if (poidsAge > 0) {
    const birthYearCandidat = response.birth_year ?? null
    const ecartMax = w.ecart_age_proche ?? 4
    const bonusAge = calculerBonusAge(birthYearCandidat, startMin, sameDayLessons, ecartMax)
    if (bonusAge !== 0) {
      const s = appliquerPoids(bonusAge, poidsAge)
      if (s !== 0) {
        score += s
        const ecart = bonusAge === SCORE_AGE_MEME_ANNEE ? 'même année' : 'âges proches'
        reasons.push(`+${s.toFixed(2).replace(/\.?0+$/, '')} : regroupement par âge (${ecart})`)
      }
    }
  }

  return { score, reasons, candidateDate, startTime, durationMinutes }
}

/**
 * Calcule les meilleures propositions pour TOUTES les réponses en traitant
 * séquentiellement, de façon à ce que deux réponses ne se voient jamais
 * proposer le même créneau.
 *
 * Principe : après avoir attribué la meilleure proposition à une réponse,
 * elle est ajoutée en tant que "cours virtuel" dans la liste des conflits
 * avant de traiter la réponse suivante.
 *
 * @param {Array}  responses — réponses à traiter (dans l'ordre de priorité voulu)
 * @param {Array}  existingLessons — cours confirmés en base (non modifié)
 * @param {object} scoringWeights — poids par facteur (0–100), transmis à scoreCandidate
 * @returns {Object} map responseId → Array<proposition>
 */
export function computeAllProposals({
  responses, existingLessons, schools, zone, maxResults = 5,
  reservedSlots = [], preferredDaysOff = [], preferredProximityDays = [],
  teacherHomeLat = null, teacherHomeLng = null,
  scoringWeights = null,
}) {
  // Copie locale augmentée au fur et à mesure des attributions — garantit
  // que chaque nouvelle réponse voit les propositions déjà réservées comme des conflits.
  const virtualLessons = [...existingLessons]
  const map = {}

  for (const response of responses) {
    const proposals = computeProposals({
      response,
      existingLessons: virtualLessons,
      schools, zone, maxResults, reservedSlots,
      preferredDaysOff, preferredProximityDays,
      teacherHomeLat, teacherHomeLng,
      scoringWeights,
    })
    map[response.id] = proposals

    // Réserver le créneau de la meilleure proposition comme cours virtuel
    // pour bloquer les réponses suivantes sur ce même créneau.
    if (proposals[0]) {
      virtualLessons.push({
        lessonDate:      proposals[0].candidateDate,
        lessonTime:      proposals[0].startTime,
        durationMinutes: proposals[0].durationMinutes,
      })
    }
  }

  return map
}

/**
 * Calcule les meilleures propositions de créneaux pour UNE réponse de sondage.
 * Réutilisable depuis le Planning Intelligent ET le module Rattrapage.
 * Pour traiter plusieurs réponses sans chevauchement, utiliser computeAllProposals.
 *
 * @param {object}   response         - Ligne survey_responses avec champ `availabilities`
 * @param {Array}    existingLessons  - Cours planifiés (pour conflits)
 * @param {Array}    schools          - Écoles du prof
 * @param {string}   zone             - Zone scolaire
 * @param {number}   maxResults       - Nombre max de propositions retournées (défaut 5)
 * @param {Array}    reservedSlots    - Créneaux réservés (traités comme conflits)
 * @param {Array}    preferredDaysOff      - Jours à éviter (voir scoreCandidate pour le format)
 * @param {string[]} preferredProximityDays - Jours de proximité préférés (tableau, peut être vide)
 * @param {number}   teacherHomeLat        - Latitude domicile (ou null)
 * @param {number}   teacherHomeLng        - Longitude domicile (ou null)
 * @param {object}   scoringWeights        - Poids par facteur (0–100), voir scoreCandidate
 * @returns {Array} - Propositions triées par score desc, sans doublons
 */
export function computeProposals({
  response, existingLessons, schools, zone, maxResults = 5,
  reservedSlots = [], preferredDaysOff = [], preferredProximityDays = [],
  teacherHomeLat = null, teacherHomeLng = null,
  scoringWeights = null,
}) {
  // Durée cible : contexte élève > sondage > défaut 30 min.
  // effective_duration_minutes est calculé dans SchedulingAssistantPage avant l'appel.
  const targetMinutes = response.effective_duration_minutes ?? response.desired_duration_minutes ?? 30
  const targetSlots   = Math.max(1, Math.round(targetMinutes / 15))

  const avail = response.availabilities ?? {}
  const candidates = []

  for (const [day, slots] of Object.entries(avail)) {
    if (!Array.isArray(slots) || slots.length === 0) continue
    for (let i = 0; i < slots.length; i++) {
      // Utiliser uniquement le nombre de créneaux correspondant à la durée cible.
      // Si pas assez de créneaux disponibles ou s'ils ne sont pas consécutifs (trous),
      // sauter ce point de départ.
      const count = targetSlots
      if (i + count > slots.length) continue
      let consecutive = true
      for (let j = 1; j < count; j++) {
        const prevEnd   = timeToMinutes(parseStartTime(slots[i + j - 1])) + 15
        const nextStart = timeToMinutes(parseStartTime(slots[i + j]))
        if (nextStart !== prevEnd) { consecutive = false; break }
      }
      if (!consecutive) continue
      {
        const result = scoreCandidate({
          day,
          slot: slots[i],
          slotsCount: count,
          response,
          existingLessons,
          schools,
          zone,
          reservedSlots,
          preferredDaysOff,
          preferredProximityDays,
          teacherHomeLat,
          teacherHomeLng,
          scoringWeights,
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
