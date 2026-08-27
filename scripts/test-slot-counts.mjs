/**
 * T3 — Test isolé : vérification du nombre de créneaux de 15 min pour chaque durée.
 *
 * Ce script reproduit la logique de computeProposals sans dépendance externe
 * (Vite / Supabase / vacances.js), afin d'être exécutable avec `node` seul.
 *
 * Invariants vérifiés :
 *   1. Chaque proposition a exactement durationMinutes = durée cible
 *   2. Pas de doublons (même startTime × même durationMinutes) — la déduplication fonctionne
 *   3. Le nombre de propositions = nombre de points de départ valides dans la plage
 *   4. Test multi-élèves via computeAllProposalsMin :
 *      quand 2 élèves veulent le même créneau, leurs meilleures propositions N'empiètent pas
 *
 * Exécution : node scripts/test-slot-counts.mjs
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToMinutes(timeStr) {
  const [h, m] = (timeStr ?? '00:00').split(':').map(Number)
  return h * 60 + (m || 0)
}

function parseStartTime(slot) {
  return slot.split('–')[0].trim()
}

/**
 * Version minimale de computeProposals — logique de durée uniquement.
 * Retourne toutes les propositions valides triées par heure de début.
 */
function computeProposalsMin(availabilities, effectiveDuration) {
  const targetSlots = Math.max(1, Math.round(effectiveDuration / 15))
  const candidates  = []

  for (const [day, slots] of Object.entries(availabilities)) {
    if (!Array.isArray(slots) || slots.length === 0) continue
    for (let i = 0; i < slots.length; i++) {
      const count = targetSlots
      if (i + count > slots.length) continue
      const startTime       = parseStartTime(slots[i])
      const durationMinutes = count * 15
      candidates.push({ day, startTime, durationMinutes })
    }
  }

  // Déduplication — doit éliminer les doublons (startTime identique)
  const seen = new Set()
  return candidates.filter(({ day, startTime, durationMinutes }) => {
    const key = `${day}|${startTime}|${durationMinutes}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
}

/**
 * Simule computeAllProposals pour deux élèves :
 * le créneau de l'élève 1 est réservé avant que l'élève 2 ne soit traité.
 * Vérifie que les meilleurs créneaux des deux élèves ne s'empiètent pas.
 */
function computeAllProposalsMin(eleve1Avail, eleve2Avail, duree) {
  const props1   = computeProposalsMin(eleve1Avail, duree)
  const best1    = props1[0] ?? null
  const reserved = best1 ? [best1] : []

  // Filtrer l'élève 2 : exclure les créneaux qui empiètent sur la réservation de l'élève 1
  const all2    = computeProposalsMin(eleve2Avail, duree)
  const props2  = all2.filter((p) => {
    if (!best1 || p.day !== best1.day) return true
    const pStart = timeToMinutes(p.startTime)
    const pEnd   = pStart + p.durationMinutes
    const rStart = timeToMinutes(best1.startTime)
    const rEnd   = rStart + best1.durationMinutes
    return !(pStart < rEnd && pEnd > rStart)
  })
  const best2 = props2[0] ?? null

  return { best1, best2, reserved }
}

// ─── Données de test ──────────────────────────────────────────────────────────

// Lundi 09:00–13:00 (16 créneaux de 15 min)
const SLOTS_LUNDI = [
  '09:00–09:15', '09:15–09:30', '09:30–09:45', '09:45–10:00',
  '10:00–10:15', '10:15–10:30', '10:30–10:45', '10:45–11:00',
  '11:00–11:15', '11:15–11:30', '11:30–11:45', '11:45–12:00',
  '12:00–12:15', '12:15–12:30', '12:30–12:45', '12:45–13:00',
]

const AVAIL_LUNDI = { Lundi: SLOTS_LUNDI }

// ─── Tests ────────────────────────────────────────────────────────────────────

const DUREES = [15, 30, 45, 60, 90, 120]
let erreurs = 0

console.log('=== T3 : créneaux de 15 min — durée exacte, déduplication, non-empiètement multi-élèves ===\n')
console.log('Disponibilités : Lundi 09:00–13:00 (16 créneaux × 15 min)\n')

// ── Partie 1 : durée exacte et nombre de propositions ────────────────────────
for (const duree of DUREES) {
  const proposals    = computeProposalsMin(AVAIL_LUNDI, duree)
  const attenduSlots = Math.round(duree / 15)
  const errLocales   = []

  // 1 — durée exacte dans chaque proposition
  for (const p of proposals) {
    if (p.durationMinutes !== duree) {
      errLocales.push(`durationMinutes = ${p.durationMinutes}, attendu ${duree}`)
    }
  }

  // 2 — pas de doublons (startTime unique dans la liste)
  const startTimes = proposals.map(p => p.startTime)
  const uniques    = new Set(startTimes)
  if (uniques.size !== startTimes.length) {
    errLocales.push(`Doublons détectés : ${startTimes.length - uniques.size} entrée(s) en trop`)
  }

  // 3 — au moins une proposition si la durée ≤ plage disponible
  const maxDispo = SLOTS_LUNDI.length * 15  // 240 min
  if (proposals.length === 0 && duree <= maxDispo) {
    errLocales.push(`Aucune proposition pour ${duree} min (plage = ${maxDispo} min)`)
  }

  // 4 — nombre exact de points de départ valides
  const debutsAttendus = Math.max(0, SLOTS_LUNDI.length - attenduSlots + 1)
  if (errLocales.length === 0 && proposals.length !== debutsAttendus) {
    errLocales.push(`${proposals.length} proposition(s), attendu ${debutsAttendus}`)
  }

  const ok    = errLocales.length === 0
  const label = ok ? '✅' : '❌'
  console.log(
    `${label}  ${String(duree).padStart(3)} min → ${attenduSlots}×15 min | ` +
    `${proposals.length} proposition(s) (attendu ${debutsAttendus})`
  )
  if (!ok) {
    errLocales.forEach(e => console.log(`       ↳ ${e}`))
    erreurs++
  } else {
    const premiers = proposals.slice(0, 4).map(p => p.startTime).join(' ')
    const suite    = proposals.length > 4 ? ` …+${proposals.length - 4}` : ''
    console.log(`       débuts : ${premiers}${suite}`)
  }
}

// ── Partie 2 : non-empiètement entre deux élèves ─────────────────────────────
console.log('\n── Non-empiètement multi-élèves (computeAllProposalsMin) ───────────────\n')

for (const duree of DUREES) {
  // Élève 1 + élève 2 ont les mêmes disponibilités — le 2e doit céder le premier créneau
  const { best1, best2 } = computeAllProposalsMin(AVAIL_LUNDI, AVAIL_LUNDI, duree)
  const errLocales = []

  if (!best1) {
    errLocales.push('Élève 1 : aucune proposition')
  }
  if (!best2) {
    if (duree <= SLOTS_LUNDI.length * 15 / 2) {
      // Deux durées tiennent dans la plage — le 2e doit trouver un créneau
      errLocales.push('Élève 2 : aucune proposition alors que la plage permet 2 cours')
    }
  } else if (best1) {
    // Vérifier non-empiètement entre best1 et best2
    const s1 = timeToMinutes(best1.startTime), e1 = s1 + best1.durationMinutes
    const s2 = timeToMinutes(best2.startTime), e2 = s2 + best2.durationMinutes
    if (best1.day === best2.day && s1 < e2 && e1 > s2) {
      errLocales.push(`Empiètement : élève 1 [${best1.startTime}+${duree}] et élève 2 [${best2.startTime}+${duree}]`)
    }
  }

  const ok    = errLocales.length === 0
  const label = ok ? '✅' : '❌'
  const b1str = best1 ? `${best1.startTime}+${duree}min` : '—'
  const b2str = best2 ? `${best2.startTime}+${duree}min` : '—'
  console.log(`${label}  ${String(duree).padStart(3)} min → élève 1 : ${b1str} | élève 2 : ${b2str}`)
  if (!ok) {
    errLocales.forEach(e => console.log(`       ↳ ${e}`))
    erreurs++
  }
}

console.log(`\n${erreurs === 0 ? '✅ Tous les tests passent.' : `❌ ${erreurs} groupe(s) en échec.`}`)
process.exit(erreurs > 0 ? 1 : 0)
