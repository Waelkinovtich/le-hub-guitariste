#!/usr/bin/env node
/**
 * DIAGNOSTIC — Élèves manquants dans le Planning intelligent
 * ============================================================
 * Charge les survey_responses depuis Supabase (avec la clé service pour contourner RLS
 * et voir toutes les lignes) et compare le nombre total vs. le nombre effectivement
 * traitable par computeAllProposals. Identifie les causes de chaque exclusion.
 *
 * Usage :
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node diag-planning-eleves-manquants.js [school_name]
 *
 * school_name (optionnel) : filtrer sur une école précise, ex: "École Dupont"
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

// ─── Mini-client HTTP Supabase (sans dépendance npm externe) ─────────────────

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
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase ${res.status} : ${err}`)
  }
  return res.json()
}

// ─── Reproduction de la logique computeProposals (version allégée) ───────────

function parseStartTime(slot) { return slot.split('–')[0].trim() }
function timeToMinutes(t) {
  const [h, m] = (t ?? '00:00').split(':').map(Number)
  return h * 60 + (m || 0)
}

function countCandidates(response) {
  const avail        = response.availabilities ?? {}
  const targetMin    = response.effective_duration_minutes ?? response.desired_duration_minutes ?? 30
  const targetSlots  = Math.max(1, Math.round(targetMin / 15))
  let totalCandidats = 0

  for (const [day, slots] of Object.entries(avail)) {
    if (!Array.isArray(slots) || slots.length === 0) continue
    for (let i = 0; i < slots.length; i++) {
      if (i + targetSlots > slots.length) continue
      let consecutive = true
      for (let j = 1; j < targetSlots; j++) {
        const prevEnd   = timeToMinutes(parseStartTime(slots[i + j - 1])) + 15
        const nextStart = timeToMinutes(parseStartTime(slots[i + j]))
        if (nextStart !== prevEnd) { consecutive = false; break }
      }
      if (!consecutive) continue
      totalCandidats++
    }
  }
  return totalCandidats
}

// ─── Rapport ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Diagnostic Planning intelligent — élèves manquants ===\n')
  console.log('Heure :', new Date().toLocaleString('fr-FR'))
  if (SCHOOL_FILTER) console.log('Filtre école :', SCHOOL_FILTER)
  console.log()

  // ── 1. Toutes les réponses (sans filtre de status — clé service)
  const allRaw = await query('survey_responses', {
    select: 'id,first_name,last_name,school_name,status,availabilities,desired_duration_minutes,student_id,submitted_at',
    order:  'submitted_at.desc',
    limit:  '200',
  })
  const tous = SCHOOL_FILTER
    ? allRaw.filter((r) => r.school_name === SCHOOL_FILTER)
    : allRaw

  console.log(`Réponses TOTALES en base${SCHOOL_FILTER ? ` pour "${SCHOOL_FILTER}"` : ''} : ${tous.length}`)

  // ── 2. Ce que voit le Planning intelligent (neq status confirme → exclut NULL)
  const vuesParApp = tous.filter((r) => r.status !== null && r.status !== 'confirme')
  const statusNull = tous.filter((r) => r.status === null)
  const confirmes  = tous.filter((r) => r.status === 'confirme')

  console.log(`  → status = 'confirme'  (exclues, déjà actées) : ${confirmes.length}`)
  console.log(`  → status = NULL        (BUG : exclues par neq) : ${statusNull.length}`)
  console.log(`  → status = 'attente'   (ou autre, affichées)   : ${vuesParApp.length}`)
  console.log()

  if (statusNull.length > 0) {
    console.log('⚠ ÉLÈVES INVISIBLES à cause du status NULL :')
    statusNull.forEach((r) => {
      console.log(`   - ${r.first_name ?? '?'} ${r.last_name ?? ''} (${r.school_name ?? '?'}) — soumis le ${r.submitted_at?.slice(0, 10) ?? 'inconnu'}`)
    })
    console.log()
  }

  // ── 3. Parmi les réponses visibles, combien ont des disponibilités et des candidats
  const enAttente = vuesParApp
  const sansDispos      = enAttente.filter((r) => {
    const avail = r.availabilities ?? {}
    return !Object.values(avail).some((s) => Array.isArray(s) && s.length > 0)
  })
  const avecDispos = enAttente.filter((r) => {
    const avail = r.availabilities ?? {}
    return Object.values(avail).some((s) => Array.isArray(s) && s.length > 0)
  })

  // Charger les contextes élèves pour les durées effectives
  const studentIds = [...new Set(enAttente.map((r) => r.student_id).filter(Boolean))]
  let contextsMap = {}
  if (studentIds.length > 0) {
    const ctxData = await query('student_contexts', {
      select:   'student_id,school_name,duree_cours_minutes',
      student_id: `in.(${studentIds.join(',')})`,
    }).catch(() => [])
    ;(ctxData ?? []).forEach((c) => {
      const key = `${c.student_id}|${c.school_name ?? ''}`
      contextsMap[key] = c.duree_cours_minutes
    })
  }
  enAttente.forEach((r) => {
    const key = `${r.student_id ?? ''}|${r.school_name ?? ''}`
    r.effective_duration_minutes = contextsMap[key] ?? r.desired_duration_minutes ?? 30
  })

  const avecCandidats   = avecDispos.filter((r) => countCandidates(r) > 0)
  const sansCandidats   = avecDispos.filter((r) => countCandidates(r) === 0)

  console.log(`Réponses visibles par le Planning (status != 'confirme' ET non NULL) : ${enAttente.length}`)
  console.log(`  → Sans disponibilités renseignées  : ${sansDispos.length}`)
  console.log(`  → Avec disponibilités mais aucun créneau assez long (durée cible incompatible) : ${sansCandidats.length}`)
  console.log(`  → Avec au moins un créneau candidat valide  : ${avecCandidats.length}`)
  console.log()

  if (sansCandidats.length > 0) {
    console.log('Élèves avec disponibilités mais AUCUN créneau assez long :')
    sansCandidats.forEach((r) => {
      const avail = r.availabilities ?? {}
      const nbSlots = Object.values(avail).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0)
      console.log(`   - ${r.first_name ?? '?'} ${r.last_name ?? ''} (${r.school_name ?? '?'}) — durée cible : ${r.effective_duration_minutes} min, créneaux dispo : ${nbSlots} × 15 min`)
    })
    console.log()
  }

  if (sansDispos.length > 0) {
    console.log('Élèves sans disponibilités :')
    sansDispos.forEach((r) => {
      console.log(`   - ${r.first_name ?? '?'} ${r.last_name ?? ''} (${r.school_name ?? '?'})`)
    })
    console.log()
  }

  // ── 4. Résumé global
  const totalManquants = statusNull.length + sansCandidats.length + sansDispos.length
  console.log('=== RÉSUMÉ ===')
  console.log(`Total en base         : ${tous.length}`)
  console.log(`Confirmés (actés)     : ${confirmes.length}`)
  console.log(`BUG status NULL       : ${statusNull.length}  ← EXCLUES SILENCIEUSEMENT`)
  console.log(`Pas de disponibilités : ${sansDispos.length}  ← affichées mais sans proposition`)
  console.log(`Durée incompatible    : ${sansCandidats.length}  ← affichées mais sans proposition`)
  console.log(`Plaçables avec succès : ${avecCandidats.length}`)
  console.log(`Total manquants ou sans proposition : ${totalManquants}`)
}

main().catch((e) => { console.error('Erreur :', e.message); process.exit(1) })
