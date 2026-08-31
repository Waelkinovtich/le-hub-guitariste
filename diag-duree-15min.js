#!/usr/bin/env node
/**
 * DIAGNOSTIC T1 — Propositions à 15 min au lieu de la durée demandée
 * ===================================================================
 * Vérifie que la chaîne de priorité des durées
 *   duree_cours_minutes (student_contexts)
 *   → desired_duration_minutes (survey_responses)
 *   → défaut 30 min
 * est appliquée correctement dans computeProposals.
 *
 * Identifie les cas-limites où targetSlots vaut 1 (→ 15 min) à tort.
 *
 * Usage (deux modes) :
 *   # Mode 1 — données réelles Supabase :
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node diag-duree-15min.js
 *
 *   # Mode 2 — cas-limites simulés (sans Supabase) :
 *   node diag-duree-15min.js --test
 */

const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const MODE_TEST            = process.argv.includes('--test')

// ─── Reproduction de la logique de priorité (copiée depuis le moteur) ─────────

/** Comportement ACTUEL avec ?? (opérateur null-coalescing). */
function targetMinutesAvec_nullish(response) {
  return response.effective_duration_minutes ?? response.desired_duration_minutes ?? 30
}

/** Comportement CORRIGÉ avec || (opérateur falsy). */
function targetMinutesAvec_falsy(response) {
  return response.effective_duration_minutes || response.desired_duration_minutes || 30
}

function targetSlots(minutes) {
  return Math.max(1, Math.round(minutes / 15))
}

// ─── Cas-limites connus ────────────────────────────────────────────────────────

const casLimites = [
  {
    label: 'Contexte 30, sondage 30 → attendu 30',
    r: { effective_duration_minutes: 30, desired_duration_minutes: 30 },
    attendu: 30,
  },
  {
    label: 'Contexte null, sondage 30 → attendu 30',
    r: { effective_duration_minutes: null, desired_duration_minutes: 30 },
    attendu: 30,
  },
  {
    label: 'Contexte undefined, sondage 30 → attendu 30',
    r: { effective_duration_minutes: undefined, desired_duration_minutes: 30 },
    attendu: 30,
  },
  {
    label: 'Contexte 0 (BUG ?) : desired 30 → attendu 30',
    r: { effective_duration_minutes: 0, desired_duration_minutes: 30 },
    attendu: 30,
    // ?? retourne 0 (0 n'est pas null/undefined) → targetSlots = 1 → 15 min ← BUG
    // || retourne 30 (0 est falsy)                → targetSlots = 2 → 30 min ← CORRECT
  },
  {
    label: 'Contexte null, desired 0 (BUG ?) → attendu 30 (défaut)',
    r: { effective_duration_minutes: null, desired_duration_minutes: 0 },
    attendu: 30,
    // ?? : null ?? 0 = 0 → targetSlots = 1 → BUG
    // || : null || 0 → 0 → 0 || 30 = 30 → CORRECT
  },
  {
    label: 'Contexte null, desired null → attendu 30 (défaut)',
    r: { effective_duration_minutes: null, desired_duration_minutes: null },
    attendu: 30,
  },
  {
    label: 'Contexte 45, sondage 30 → attendu 45 (contexte prioritaire)',
    r: { effective_duration_minutes: 45, desired_duration_minutes: 30 },
    attendu: 45,
  },
  {
    label: 'Contexte null, desired 15 → attendu 15 (demande explicite)',
    r: { effective_duration_minutes: null, desired_duration_minutes: 15 },
    attendu: 15,
  },
]

function testCasLimites() {
  console.log('=== Tests cas-limites (sans Supabase) ===\n')

  let bugs = 0
  for (const cas of casLimites) {
    const minActuel  = targetMinutesAvec_nullish(cas.r)
    const minCorrige = targetMinutesAvec_falsy(cas.r)
    const slotsActuel  = targetSlots(minActuel)
    const slotsCorrige = targetSlots(minCorrige)
    const dureeActuelle  = slotsActuel * 15
    const dureeCorrigee  = slotsCorrige * 15

    const ok_actuel  = dureeActuelle  === cas.attendu
    const ok_corrige = dureeCorrigee === cas.attendu

    const statut = ok_actuel
      ? '✅ OK      '
      : (ok_corrige ? '⚠ BUG→FIXÉ' : '❌ NON FIXÉ')

    console.log(`${statut}  ${cas.label}`)
    if (!ok_actuel) {
      bugs++
      console.log(`         Actuel  : ${minActuel} min → ${slotsActuel} slots → ${dureeActuelle} min`)
      console.log(`         Corrigé : ${minCorrige} min → ${slotsCorrige} slots → ${dureeCorrigee} min`)
      console.log(`         Attendu : ${cas.attendu} min`)
    }
  }

  console.log()
  console.log(`Total cas testés : ${casLimites.length}`)
  console.log(`Bugs détectés avec ?? : ${bugs}`)
  console.log()
  if (bugs > 0) {
    console.log('CONCLUSION : remplacer ?? par || dans targetMinutes résout ces cas.')
    console.log('Fichiers à modifier :')
    console.log('  • src/utils/scoringCreneaux.js — computeProposals (ligne ~511)')
    console.log('  • src/pages/SchedulingAssistantPage.jsx — enrichedResponses (ligne ~350)')
    console.log('  • src/pages/SchedulingAssistantPage.jsx — conflictLessons (ligne ~565)')
  } else {
    console.log('Aucun bug détecté dans les cas-limites testés.')
  }
}

// ─── Mode données réelles ─────────────────────────────────────────────────────

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

async function testDonneesReelles() {
  console.log('=== Diagnostic durées — données réelles ===\n')

  // Réponses en attente
  const rawResponses = await query('survey_responses', {
    select:  'id,first_name,last_name,school_name,desired_duration_minutes,student_id',
    'or':    'status.neq.confirme,status.is.null',
    limit:   '200',
    order:   'submitted_at.desc',
  })

  // Contextes élèves
  const studentIds = [...new Set(rawResponses.map((r) => r.student_id).filter(Boolean))]
  let contextsMap = {}
  if (studentIds.length > 0) {
    const ctxData = await query('student_contexts', {
      select:     'student_id,school_name,duree_cours_minutes',
      student_id: `in.(${studentIds.join(',')})`,
    }).catch(() => [])
    ;(ctxData ?? []).forEach((c) => {
      const key = `${c.student_id}|${c.school_name ?? ''}`
      contextsMap[key] = c.duree_cours_minutes
    })
  }

  // Enrichissement — reproduction de SchedulingAssistantPage
  const enriched = rawResponses.map((r) => {
    const ctxKey      = `${r.student_id ?? ''}|${r.school_name ?? ''}`
    const contextDuree = contextsMap[ctxKey] ?? null
    // Chaîne ACTUELLE
    const effectiveActuel  = contextDuree ?? r.desired_duration_minutes ?? 30
    // Chaîne CORRIGÉE
    const effectiveCorrige = contextDuree || r.desired_duration_minutes || 30
    return {
      ...r,
      contextDuree,
      effectiveActuel,
      effectiveCorrige,
      slotsActuel:  targetSlots(effectiveActuel),
      slotsCorrige: targetSlots(effectiveCorrige),
    }
  })

  const bugs = enriched.filter((r) => r.slotsActuel !== r.slotsCorrige)

  console.log(`Réponses analysées : ${enriched.length}`)
  console.log(`Réponses avec durée différente (actuel vs corrigé) : ${bugs.length}`)
  console.log()

  // Analyse des valeurs réelles
  const sansDuree = enriched.filter((r) => !r.desired_duration_minutes && !r.contextDuree)
  const duree0    = enriched.filter((r) => r.desired_duration_minutes === 0 || r.contextDuree === 0)
  const dureeStr  = enriched.filter((r) => typeof r.desired_duration_minutes === 'string')

  console.log(`Réponses sans durée (null/undefined partout)   : ${sansDuree.length}`)
  console.log(`Réponses avec durée = 0                        : ${duree0.length}`)
  console.log(`Réponses avec durée stockée en string          : ${dureeStr.length}`)
  console.log()

  if (bugs.length > 0) {
    console.log('⚠ Réponses impactées par le bug :')
    bugs.forEach((r) => {
      console.log(`  - ${r.first_name ?? '?'} ${r.last_name ?? ''} (${r.school_name ?? '?'})`)
      console.log(`    contextDuree=${r.contextDuree}, desired=${r.desired_duration_minutes}`)
      console.log(`    Actuel  : ${r.effectiveActuel} min → ${r.slotsActuel * 15} min proposée`)
      console.log(`    Corrigé : ${r.effectiveCorrige} min → ${r.slotsCorrige * 15} min proposée`)
    })
    console.log()
  }

  if (dureeStr.length > 0) {
    console.log('⚠ Durées stockées comme string (devrait être integer) :')
    dureeStr.forEach((r) => {
      console.log(`  - ${r.first_name} ${r.last_name} : desired_duration_minutes = "${r.desired_duration_minutes}" (type: ${typeof r.desired_duration_minutes})`)
    })
    console.log()
  }

  // Distribution des durées
  const dist = {}
  enriched.forEach((r) => {
    const k = String(r.desired_duration_minutes ?? 'NULL')
    dist[k] = (dist[k] ?? 0) + 1
  })
  console.log('Distribution desired_duration_minutes :')
  Object.entries(dist).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).forEach(([k, n]) => {
    console.log(`  ${k.padEnd(10)} → ${n} réponse(s)`)
  })
}

// ─── Entrée ───────────────────────────────────────────────────────────────────

if (MODE_TEST || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  testCasLimites()
} else {
  testDonneesReelles().catch((e) => { console.error('Erreur :', e.message); process.exit(1) })
}
