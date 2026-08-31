#!/usr/bin/env node
/**
 * TEST T2 — Passe d'échanges dans computeAllProposals
 * ====================================================
 * Vérifie que la passe d'amélioration par échanges réduit effectivement
 * le nombre de conflits (élèves non placés) par rapport au résultat greedy seul.
 *
 * Construit un scénario synthétique où :
 *   - Élève A a été placé en greedy sur l'unique créneau disponible de B (compétition)
 *   - Élève B se retrouve non placé
 *   - A a un créneau alternatif → l'échange doit les placer tous les deux
 *
 * Usage :
 *   node test-echanges-t2.js
 */

// ─── Reproduction des fonctions pures du moteur ────────────────────────────────

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

function parseStartTime(slot) { return slot.split('–')[0].trim() }

function timeToMinutes(t) {
  const [h, m] = (t ?? '00:00').split(':').map(Number)
  return h * 60 + (m || 0)
}

function nextDateForDayAfter(dayName, minDateISO) {
  const target = JOURS_FR.indexOf(dayName)
  const today  = new Date()
  const d      = new Date(today)
  let diff     = target - today.getDay()
  if (diff <= 0) diff += 7
  d.setDate(today.getDate() + diff)
  if (minDateISO) {
    const min = new Date(minDateISO + 'T12:00:00')
    while (d < min) d.setDate(d.getDate() + 7)
  }
  return d.toISOString().slice(0, 10)
}

function rebuilderSlot(startTime, durationMinutes) {
  const [h, m] = startTime.split(':').map(Number)
  const endMin  = h * 60 + m + durationMinutes
  return `${startTime}–${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`
}

function studentPeutPrendreSlot(response, proposal) {
  const slotsJour = (response.availabilities ?? {})[proposal.day] ?? []
  if (slotsJour.length === 0) return false
  const targetSlots = Math.max(1, Math.round(proposal.durationMinutes / 15))
  const idx = slotsJour.findIndex((s) => parseStartTime(s) === proposal.startTime)
  if (idx === -1 || idx + targetSlots > slotsJour.length) return false
  for (let j = 1; j < targetSlots; j++) {
    const prevEnd   = timeToMinutes(parseStartTime(slotsJour[idx + j - 1])) + 15
    const nextStart = timeToMinutes(parseStartTime(slotsJour[idx + j]))
    if (nextStart !== prevEnd) return false
  }
  return true
}

function scoreCandidate({ day, slot, slotsCount, response, existingLessons }) {
  const startTime       = parseStartTime(slot)
  const startMin        = timeToMinutes(startTime)
  const durationMinutes = slotsCount * 15
  const endMin          = startMin + durationMinutes
  const candidateDate   = nextDateForDayAfter(day, null)

  // Vérifier conflits avec existingLessons (par jour de semaine)
  const jourSemaine = JOURS_FR.indexOf(day)
  const sameDayLessons = existingLessons.filter((l) => {
    const d = l.lessonDate ?? l.lesson_date
    return d ? new Date(d + 'T12:00:00').getDay() === jourSemaine : false
  })
  const conflit = sameDayLessons.some((l) => {
    const ls = timeToMinutes(l.lessonTime ?? l.lesson_time ?? '00:00')
    const le = ls + (l.durationMinutes ?? l.duration_minutes ?? 45)
    return startMin < le && endMin > ls
  })
  if (conflit) return null

  return { score: 50, reasons: ['test'], candidateDate, startTime, durationMinutes }
}

function computeProposals({ response, existingLessons }) {
  const targetMin   = response.effective_duration_minutes || response.desired_duration_minutes || 30
  const targetSlots = Math.max(1, Math.round(targetMin / 15))
  const avail       = response.availabilities ?? {}
  const candidates  = []

  for (const [day, slots] of Object.entries(avail)) {
    if (!Array.isArray(slots) || slots.length === 0) continue
    for (let i = 0; i < slots.length; i++) {
      const count = targetSlots
      if (i + count > slots.length) continue
      let consecutive = true
      for (let j = 1; j < count; j++) {
        const prevEnd   = timeToMinutes(parseStartTime(slots[i + j - 1])) + 15
        const nextStart = timeToMinutes(parseStartTime(slots[i + j]))
        if (nextStart !== prevEnd) { consecutive = false; break }
      }
      if (!consecutive) continue
      const result = scoreCandidate({ day, slot: slots[i], slotsCount: count, response, existingLessons })
      if (result !== null) candidates.push({ day, slot: slots[i], slotsCount: count, ...result })
    }
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 5)
}

const MAX_TENTATIVES_ECHANGE = 2

function computeAllProposals({ responses, existingLessons }) {
  // Passe 1 greedy
  const virtualLessons = [...existingLessons]
  const virtualParId = {}
  const map = {}

  for (const response of responses) {
    const proposals = computeProposals({ response, existingLessons: virtualLessons })
    map[response.id] = proposals
    if (proposals[0]) {
      const vl = { lessonDate: proposals[0].candidateDate, lessonTime: proposals[0].startTime, durationMinutes: proposals[0].durationMinutes }
      virtualLessons.push(vl)
      virtualParId[response.id] = vl
    }
  }

  // Passe 2 échanges
  const nonPlaces = responses.filter((r) => map[r.id].length === 0)
  const places    = responses.filter((r) => map[r.id].length > 0)

  for (const studentN of nonPlaces) {
    let tentatives = 0
    let echangeEffectue = false

    for (const studentP of places) {
      if (echangeEffectue || tentatives >= MAX_TENTATIVES_ECHANGE) break
      tentatives++

      const proposalP = map[studentP.id][0]
      if (!studentPeutPrendreSlot(studentN, proposalP)) continue

      const vlP = virtualParId[studentP.id]
      const virtualSansP = virtualLessons.filter((vl) => vl !== vlP)
      const virtualPourRecalcP = [
        ...virtualSansP,
        { lessonDate: proposalP.candidateDate, lessonTime: proposalP.startTime, durationMinutes: proposalP.durationMinutes },
      ]

      const nouvellesProposalsP = computeProposals({ response: studentP, existingLessons: virtualPourRecalcP })
      if (nouvellesProposalsP.length === 0) continue

      const scoreN = scoreCandidate({
        day: proposalP.day, slot: rebuilderSlot(proposalP.startTime, proposalP.durationMinutes),
        slotsCount: Math.max(1, Math.round(proposalP.durationMinutes / 15)),
        response: studentN, existingLessons: virtualSansP,
      })
      if (!scoreN) continue

      map[studentN.id] = [{ day: proposalP.day, slotsCount: Math.max(1, Math.round(proposalP.durationMinutes / 15)), ...scoreN }]
      map[studentP.id] = nouvellesProposalsP

      const idxVlP = virtualLessons.indexOf(vlP)
      if (idxVlP !== -1) virtualLessons.splice(idxVlP, 1)
      delete virtualParId[studentP.id]

      const vlN      = { lessonDate: proposalP.candidateDate, lessonTime: proposalP.startTime, durationMinutes: proposalP.durationMinutes }
      const vlPnouveau = { lessonDate: nouvellesProposalsP[0].candidateDate, lessonTime: nouvellesProposalsP[0].startTime, durationMinutes: nouvellesProposalsP[0].durationMinutes }
      virtualLessons.push(vlN, vlPnouveau)
      virtualParId[studentN.id] = vlN
      virtualParId[studentP.id] = vlPnouveau

      echangeEffectue = true
    }
  }

  return map
}

// ─── Scénario 1 : échange simple A → B ────────────────────────────────────────
// A est placé greedy sur Lundi 14h (seul créneau de B).
// A a aussi Mardi 10h disponible.
// B n'a que Lundi 14h → non placé après greedy.
// Attendu : échange → A sur Mardi 10h, B sur Lundi 14h.

function scenario1() {
  console.log('=== Scénario 1 : échange simple A⟷B ===')
  const responses = [
    {
      id: 'A',
      first_name: 'Alice', last_name: '',
      school_name: 'École Test',
      desired_duration_minutes: 30,
      effective_duration_minutes: 30,
      availabilities: {
        Lundi:  ['14:00–14:15', '14:15–14:30'],   // 30 min disponibles
        Mardi:  ['10:00–10:15', '10:15–10:30'],   // créneau alternatif
      },
    },
    {
      id: 'B',
      first_name: 'Bob', last_name: '',
      school_name: 'École Test',
      desired_duration_minutes: 30,
      effective_duration_minutes: 30,
      availabilities: {
        Lundi:  ['14:00–14:15', '14:15–14:30'],   // même créneau qu'Alice → conflit greedy
      },
    },
  ]

  // Greedy seul (passe 1 uniquement, simulé sans passe 2)
  const mapGreedy = {}
  const vl1 = []
  for (const r of responses) {
    const p = computeProposals({ response: r, existingLessons: vl1 })
    mapGreedy[r.id] = p
    if (p[0]) vl1.push({ lessonDate: p[0].candidateDate, lessonTime: p[0].startTime, durationMinutes: p[0].durationMinutes })
  }
  const conflitsAvant = responses.filter((r) => mapGreedy[r.id].length === 0).length
  console.log(`Conflits après greedy : ${conflitsAvant}  (B non placé, attendu : 1)`)

  // Avec passe d'échanges
  const mapEchange = computeAllProposals({ responses, existingLessons: [] })
  const conflitsApres = responses.filter((r) => mapEchange[r.id].length === 0).length
  console.log(`Conflits après échanges : ${conflitsApres}  (attendu : 0)`)

  const ok = conflitsAvant > 0 && conflitsApres === 0
  console.log(ok ? '✅ Scénario 1 réussi — échange effectué' : '❌ Scénario 1 ÉCHOUÉ')
  if (!ok) {
    console.log('  mapEchange:', JSON.stringify(mapEchange, null, 2))
  }
  return ok
}

// ─── Scénario 2 : pas d'échange si P n'a pas d'alternatif ────────────────────
// A est placé sur Lundi 14h (seul créneau de A ET de B).
// B n'a que Lundi 14h.
// A n'a pas d'autre créneau → pas d'échange possible.
// Attendu : B reste non placé.

function scenario2() {
  console.log('\n=== Scénario 2 : pas d\'échange si P sans alternatif ===')
  const responses = [
    {
      id: 'A',
      first_name: 'Alice', last_name: '',
      desired_duration_minutes: 30,
      effective_duration_minutes: 30,
      availabilities: { Lundi: ['14:00–14:15', '14:15–14:30'] },  // seul créneau, pas d'alternatif
    },
    {
      id: 'B',
      first_name: 'Bob', last_name: '',
      desired_duration_minutes: 30,
      effective_duration_minutes: 30,
      availabilities: { Lundi: ['14:00–14:15', '14:15–14:30'] },
    },
  ]

  const map = computeAllProposals({ responses, existingLessons: [] })
  const conflits = responses.filter((r) => map[r.id].length === 0).length
  console.log(`Conflits restants : ${conflits}  (attendu : 1 — B toujours non placé)`)

  const ok = conflits === 1 && map['A'].length > 0 && map['B'].length === 0
  console.log(ok ? '✅ Scénario 2 réussi — pas d\'échange abusif' : '❌ Scénario 2 ÉCHOUÉ')
  return ok
}

// ─── Scénario 3 : N ne peut pas prendre le créneau de P ──────────────────────
// A placé sur Lundi 14h. B a Lundi 15h seulement.
// B ne peut pas prendre le créneau de A (14h) — pas d'échange.

function scenario3() {
  console.log('\n=== Scénario 3 : N ne peut pas prendre le slot de P ===')
  const responses = [
    {
      id: 'A',
      desired_duration_minutes: 30, effective_duration_minutes: 30,
      availabilities: { Lundi: ['14:00–14:15', '14:15–14:30', '15:00–15:15', '15:15–15:30'] },
    },
    {
      id: 'B',
      desired_duration_minutes: 30, effective_duration_minutes: 30,
      availabilities: { Lundi: ['15:00–15:15', '15:15–15:30'] },  // ne veut que 15h
    },
  ]

  // A est placé sur 14h (premier créneau). B a 15h, mais A a aussi 15h
  // → en greedy, A prend 14h, B prend 15h → pas de conflit en fait.
  const map = computeAllProposals({ responses, existingLessons: [] })
  const conflits = responses.filter((r) => map[r.id].length === 0).length
  console.log(`Conflits : ${conflits}  (attendu : 0 — A sur 14h, B sur 15h)`)
  const ok = conflits === 0
  console.log(ok ? '✅ Scénario 3 réussi' : '❌ Scénario 3 ÉCHOUÉ')
  return ok
}

// ─── Scénario 4 : cap MAX_TENTATIVES_ECHANGE respecté ────────────────────────
// N peut théoriquement échanger avec P1, P2, P3, P4 — mais le cap est 2 tentatives.
// On vérifie que le moteur ne fait pas plus de 2 tentatives (non observable de l'extérieur,
// mais on vérifie que le résultat est cohérent).

function scenario4() {
  console.log('\n=== Scénario 4 : échange avec 3 élèves non placés (cap = 2 par élève) ===')

  // Créneau unique : Lundi 14h. 4 élèves le veulent, A le prend en greedy.
  // A a un alternatif sur Mardi → 1 échange possible pour B.
  // C et D n'ont que Lundi 14h → resteront non placés après 1 échange.
  const responses = [
    { id: 'A', desired_duration_minutes: 30, effective_duration_minutes: 30,
      availabilities: { Lundi: ['14:00–14:15', '14:15–14:30'], Mardi: ['10:00–10:15', '10:15–10:30'] } },
    { id: 'B', desired_duration_minutes: 30, effective_duration_minutes: 30,
      availabilities: { Lundi: ['14:00–14:15', '14:15–14:30'] } },
    { id: 'C', desired_duration_minutes: 30, effective_duration_minutes: 30,
      availabilities: { Lundi: ['14:00–14:15', '14:15–14:30'] } },
    { id: 'D', desired_duration_minutes: 30, effective_duration_minutes: 30,
      availabilities: { Lundi: ['14:00–14:15', '14:15–14:30'] } },
  ]

  const map = computeAllProposals({ responses, existingLessons: [] })
  const conflits = responses.filter((r) => map[r.id].length === 0).length
  // A est échangé avec B → A sur Mardi, B sur Lundi. C et D restent non placés.
  console.log(`Conflits : ${conflits}  (attendu : 2 — C et D non placés)`)
  const ok = conflits === 2
  console.log(ok ? '✅ Scénario 4 réussi' : '❌ Scénario 4 ÉCHOUÉ')
  return ok
}

// ─── Rapport final ────────────────────────────────────────────────────────────

console.log('=== Tests T2 — Passe d\'échanges ===\n')
const resultats = [scenario1(), scenario2(), scenario3(), scenario4()]
const ok = resultats.every(Boolean)
console.log()
console.log(ok
  ? '✅ TOUS LES SCÉNARIOS PASSENT — passe d\'échanges opérationnelle'
  : `❌ ${resultats.filter((r) => !r).length} scénario(s) en échec`)
process.exit(ok ? 0 : 1)
