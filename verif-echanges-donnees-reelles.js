#!/usr/bin/env node
/**
 * VÉRIFICATION — Passe d'échanges sur données réelles
 * =====================================================
 * Compare le placement greedy pur (sans échanges) au résultat complet
 * (greedy + passe d'échanges) sur les données réelles de Supabase.
 *
 * Distingue aussi CONFLITS vs TROUS pour chaque élève non placé :
 *   conflit       — fenêtres valides mais toutes prises (passe d'échanges pertinente)
 *   trou          — slot libre disponible que le greedy n'a pas utilisé (anomalie)
 *   duree-incomp  — aucune fenêtre consécutive assez longue dans les disponibilités
 *   sans-dispos   — aucun créneau renseigné
 *
 * Usage :
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node verif-echanges-donnees-reelles.js [school_name]
 *
 * NE PAS COMMITTER ce fichier avec une clé en dur.
 */

const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Variables manquantes : SUPABASE_URL et SUPABASE_SERVICE_KEY sont requises.')
  process.exit(1)
}

const SCHOOL_FILTER = process.argv[2] ?? null

// ─── Mini-client HTTP Supabase ────────────────────────────────────────────────

async function query(path, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: {
      apikey:        SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Accept:        'application/json',
    },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status} : ${await res.text()}`)
  return res.json()
}

// ─── Utilitaires (reproduction fidèle de scoringCreneaux.js) ─────────────────

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

// Renvoie toutes les fenêtres candidates (jour, slotStr, nbSlots) pour une réponse.
function getCandidates(response) {
  const avail       = response.availabilities ?? {}
  const targetMin   = response.effective_duration_minutes || 30
  const targetSlots = Math.max(1, Math.round(targetMin / 15))
  const candidates  = []
  for (const [day, slots] of Object.entries(avail)) {
    if (!Array.isArray(slots) || slots.length === 0) continue
    for (let i = 0; i < slots.length; i++) {
      if (i + targetSlots > slots.length) continue
      let ok = true
      for (let j = 1; j < targetSlots; j++) {
        const prevEnd   = timeToMinutes(parseStartTime(slots[i + j - 1])) + 15
        const nextStart = timeToMinutes(parseStartTime(slots[i + j]))
        if (nextStart !== prevEnd) { ok = false; break }
      }
      if (ok) {
        candidates.push({ day, startTime: parseStartTime(slots[i]), nbSlots: targetSlots })
      }
    }
  }
  return candidates
}

// Clé d'un créneau utilisée dans la table d'occupation
function slotKey(day, startTime, nbSlots) { return `${day}|${startTime}|${nbSlots}` }

// ─── Greedy sans échanges ─────────────────────────────────────────────────────

function greedyPur(responses, schoolsMap) {
  // Table d'occupation : clé = slotKey → id de la réponse qui l'occupe
  const occupe = {}
  const places = new Map()  // responseId → { day, startTime, nbSlots }

  for (const r of responses) {
    const dateMin = schoolsMap[r.school_name ?? '']?.date_reprise_cours ?? null
    const cands   = getCandidates(r)

    for (const c of cands) {
      const candidateDate = nextDateForDayAfter(c.day, dateMin)
      const key = slotKey(candidateDate, c.startTime, c.nbSlots)
      if (!occupe[key]) {
        occupe[key] = r.id
        places.set(r.id, { ...c, date: candidateDate })
        break
      }
    }
  }
  return places
}

// ─── Classement des non-placés ────────────────────────────────────────────────

function classerNonPlace(r, placesMap, schoolsMap) {
  const avail      = r.availabilities ?? {}
  const hasSomeAvail = Object.values(avail).some((s) => Array.isArray(s) && s.length > 0)
  if (!hasSomeAvail) return 'sans-dispos'

  const cands = getCandidates(r)
  if (cands.length === 0) return 'duree-incomp'

  // Vérifier si au moins un candidat était libre avant que r ne soit traité
  // (pour identifier un éventuel trou — anomalie de greedy). Approche simplifiée :
  // on reconstitue la liste des occupants. Un trou existe si un candidat de r
  // n'est occupé par aucun autre élève dans placesMap.
  const occupants = new Set()
  for (const [, v] of placesMap.entries()) {
    const dateMin = schoolsMap[v.school_name ?? '']?.date_reprise_cours ?? null
    occupants.add(slotKey(nextDateForDayAfter(v.day, dateMin), v.startTime, v.nbSlots))
  }

  const dateMin = schoolsMap[r.school_name ?? '']?.date_reprise_cours ?? null
  for (const c of cands) {
    const key = slotKey(nextDateForDayAfter(c.day, dateMin), c.startTime, c.nbSlots)
    if (!occupants.has(key)) return 'trou'  // slot libre non pris → anomalie
  }
  return 'conflit'  // tous les candidats étaient pris
}

// ─── Passe d'échanges (MAX_TENTATIVES_ECHANGE = 2) ───────────────────────────
// Reproduction simplifiée de la logique de scoringCreneaux.js.

const MAX_TENTATIVES_ECHANGE = 2

function studentPeutPrendreSlot(r, placement) {
  const slotsJour = (r.availabilities ?? {})[placement.day] ?? []
  if (slotsJour.length === 0) return false
  const targetSlots = placement.nbSlots
  const idx = slotsJour.findIndex((s) => parseStartTime(s) === placement.startTime)
  if (idx === -1 || idx + targetSlots > slotsJour.length) return false
  for (let j = 1; j < targetSlots; j++) {
    const prevEnd   = timeToMinutes(parseStartTime(slotsJour[idx + j - 1])) + 15
    const nextStart = timeToMinutes(parseStartTime(slotsJour[idx + j]))
    if (nextStart !== prevEnd) return false
  }
  return true
}

function passEchanges(responses, placesGreedy, schoolsMap) {
  const places = new Map(placesGreedy)

  const nonPlaces = responses.filter((r) => !places.has(r.id))
  const placees   = responses.filter((r) =>  places.has(r.id))

  let echanges = 0

  for (const studentN of nonPlaces) {
    let tentatives = 0
    let effectue   = false

    for (const studentP of placees) {
      if (effectue || tentatives >= MAX_TENTATIVES_ECHANGE) break
      tentatives++

      const proposalP = places.get(studentP.id)
      if (!studentPeutPrendreSlot(studentN, proposalP)) continue

      // Peut P trouver un autre slot (en excluant son slot actuel) ?
      const dateMinP   = schoolsMap[studentP.school_name ?? '']?.date_reprise_cours ?? null
      const candidatsP = getCandidates(studentP)

      const occupe = new Set()
      for (const [id, v] of places.entries()) {
        if (id === studentP.id) continue
        const dateMin = schoolsMap[responses.find((r) => r.id === id)?.school_name ?? '']?.date_reprise_cours ?? null
        occupe.add(slotKey(nextDateForDayAfter(v.day, dateMin), v.startTime, v.nbSlots))
      }
      // Bloquer aussi l'ancien slot de P pour qu'il ne le reprenne pas
      const ancienKey = slotKey(
        nextDateForDayAfter(proposalP.day, dateMinP),
        proposalP.startTime,
        proposalP.nbSlots
      )
      occupe.add(ancienKey)

      let nouvelleP = null
      for (const c of candidatsP) {
        const key = slotKey(nextDateForDayAfter(c.day, dateMinP), c.startTime, c.nbSlots)
        if (!occupe.has(key)) { nouvelleP = c; break }
      }
      if (!nouvelleP) continue

      // Échange validé
      places.set(studentN.id, proposalP)
      places.set(studentP.id, nouvelleP)
      echanges++
      effectue = true
    }
  }

  return { places, echanges }
}

// ─── Rapport principal ────────────────────────────────────────────────────────

async function main() {
  console.log('=== Vérification passe d\'échanges — données réelles ===\n')
  console.log('Date :', new Date().toLocaleString('fr-FR'))
  if (SCHOOL_FILTER) console.log('Filtre école :', SCHOOL_FILTER)
  console.log()

  // ── Charger les données ───────────────────────────────────────────────────
  const schoolsRaw = await query('schools', {
    select: 'name,date_reprise_cours',
    limit:  '100',
  }).catch(() => [])
  const schoolsMap = {}
  for (const s of (schoolsRaw ?? [])) schoolsMap[s.name] = s

  const allRaw = await query('survey_responses', {
    select: 'id,first_name,last_name,school_name,status,availabilities,desired_duration_minutes,student_id',
    order:  'submitted_at.asc',
    limit:  '200',
  })

  let responses = (allRaw ?? []).filter((r) => r.status !== 'confirme' && r.status !== null)
  if (SCHOOL_FILTER) responses = responses.filter((r) => r.school_name === SCHOOL_FILTER)

  // Charger les durées effectives depuis student_contexts
  const studentIds = [...new Set(responses.map((r) => r.student_id).filter(Boolean))]
  let contextsMap = {}
  if (studentIds.length > 0) {
    const ctxData = await query('student_contexts', {
      select:   'student_id,school_name,duree_cours_minutes',
      student_id: `in.(${studentIds.join(',')})`,
    }).catch(() => [])
    ;(ctxData ?? []).forEach((c) => {
      contextsMap[`${c.student_id}|${c.school_name ?? ''}`] = c.duree_cours_minutes
    })
  }
  responses = responses.map((r) => {
    const ctxDuree = contextsMap[`${r.student_id ?? ''}|${r.school_name ?? ''}`] ?? null
    return { ...r, effective_duration_minutes: ctxDuree || r.desired_duration_minutes || 30 }
  })

  if (responses.length === 0) {
    console.log('Aucune réponse en attente — rien à analyser.')
    return
  }
  console.log(`Réponses à placer : ${responses.length}\n`)

  // ── Greedy sans échanges ─────────────────────────────────────────────────
  const placesGreedy = greedyPur(responses, schoolsMap)
  const nonPlacesGreedy = responses.filter((r) => !placesGreedy.has(r.id))
  console.log('─── Greedy seul (sans échanges) ─────────────────────────────────────')
  console.log(`  Placés   : ${placesGreedy.size} / ${responses.length}`)
  console.log(`  Non placés : ${nonPlacesGreedy.length}`)
  if (nonPlacesGreedy.length > 0) {
    nonPlacesGreedy.forEach((r) => {
      const motif = classerNonPlace(r, placesGreedy, schoolsMap)
      const nom   = [r.first_name, r.last_name].filter(Boolean).join(' ') || '?'
      console.log(`    • ${nom} (${r.school_name ?? '?'}) — ${motif} — ${r.effective_duration_minutes} min`)
    })
  }
  console.log()

  // ── Passe d'échanges ─────────────────────────────────────────────────────
  const { places: placesAvecEchanges, echanges } = passEchanges(responses, placesGreedy, schoolsMap)
  const nonPlacesFinaux = responses.filter((r) => !placesAvecEchanges.has(r.id))
  console.log('─── Après passe d\'échanges (MAX_TENTATIVES = 2) ────────────────────')
  console.log(`  Échanges effectués : ${echanges}`)
  console.log(`  Placés   : ${placesAvecEchanges.size} / ${responses.length}`)
  console.log(`  Non placés : ${nonPlacesFinaux.length}`)

  if (nonPlacesFinaux.length > 0) {
    const categories = { conflit: [], 'duree-incomp': [], 'sans-dispos': [], trou: [] }
    nonPlacesFinaux.forEach((r) => {
      const motif = classerNonPlace(r, placesAvecEchanges, schoolsMap)
      const nom   = [r.first_name, r.last_name].filter(Boolean).join(' ') || '?'
      categories[motif]?.push(`${nom} (${r.school_name ?? '?'}) — ${r.effective_duration_minutes} min`)
    })
    if (categories.trou.length > 0) {
      console.log('\n  ⚠️  TROUS DÉTECTÉS (slots libres non pris — anomalie de greedy) :')
      categories.trou.forEach((s) => console.log('    • ' + s))
    }
    if (categories.conflit.length > 0) {
      console.log('\n  Conflits résiduels (passe d\'échanges ne suffit pas) :')
      categories.conflit.forEach((s) => console.log('    • ' + s))
    }
    if (categories['duree-incomp'].length > 0) {
      console.log('\n  Durée incompatible (aucune fenêtre assez longue) :')
      categories['duree-incomp'].forEach((s) => console.log('    • ' + s))
    }
    if (categories['sans-dispos'].length > 0) {
      console.log('\n  Sans disponibilités renseignées :')
      categories['sans-dispos'].forEach((s) => console.log('    • ' + s))
    }
  }
  console.log()

  // ── Bilan ─────────────────────────────────────────────────────────────────
  const gainEchanges = placesAvecEchanges.size - placesGreedy.size
  console.log('─── Bilan ───────────────────────────────────────────────────────────')
  console.log(`  Gain de la passe d'échanges : +${gainEchanges} élève${gainEchanges > 1 ? 's' : ''} placé${gainEchanges > 1 ? 's' : ''}`)
  if (gainEchanges === 0) {
    console.log('  La passe d\'échanges n\'a pas amélioré le résultat dans cet ensemble de données.')
    if (nonPlacesGreedy.filter((r) => classerNonPlace(r, placesGreedy, schoolsMap) === 'conflit').length === 0) {
      console.log('  → Normal : aucun des non-placés n\'était en situation de conflit.')
      console.log('    Tous ont des problèmes de disponibilités ou de durée,')
      console.log('    qui ne peuvent pas être résolus par échange.')
    }
  } else {
    console.log(`  ✅ La passe d'échanges est efficace sur ces données.`)
  }
}

main().catch((e) => { console.error('Erreur :', e.message); process.exit(1) })
