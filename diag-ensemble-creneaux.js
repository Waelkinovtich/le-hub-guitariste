#!/usr/bin/env node
/**
 * DIAGNOSTIC — Contenu de creneaux_proposes sur ensemble_tokens récents
 *
 * Vérifie si les créneaux manuels (ex: Mardi 18h30-20h30) sont bien
 * présents dans la colonne creneaux_proposes après création via l'UI.
 *
 * Usage :
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node diag-ensemble-creneaux.js
 */

const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Variables manquantes : SUPABASE_URL et SUPABASE_SERVICE_KEY requises.')
  process.exit(1)
}

async function query(path, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: {
      'apikey':        SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

async function main() {
  // 10 tokens les plus récents — suffisant pour trouver les 2 créés pour Beuvry-la-Forêt
  const rows = await query('ensemble_tokens', {
    select:  'id,label,school_name,token_type,created_at,creneaux_proposes',
    order:   'created_at.desc',
    limit:   '10',
  })

  console.log(`\n=== ${rows.length} ensemble_tokens les plus récents ===\n`)

  for (const r of rows) {
    const cp = r.creneaux_proposes
    console.log(`ID       : ${r.id}`)
    console.log(`Label    : ${r.label ?? '(sans libellé)'}`)
    console.log(`École    : ${r.school_name ?? '(aucune)'}`)
    console.log(`Type     : ${r.token_type}`)
    console.log(`Créé le  : ${r.created_at}`)

    if (cp === null || cp === undefined) {
      console.log('creneaux_proposes : NULL → tous les créneaux de l\'école proposés (aucune restriction)')
    } else if (typeof cp === 'object' && Object.keys(cp).length === 0) {
      console.log('creneaux_proposes : {} (objet vide — comportement identique à NULL)')
    } else {
      const total = Object.values(cp).reduce((s, arr) => s + arr.length, 0)
      console.log(`creneaux_proposes : ${total} créneau(x) restreint(s)`)
      for (const [jour, slots] of Object.entries(cp)) {
        console.log(`  ${jour} : ${slots.join(', ')}`)
      }

      // Recherche explicite du créneau Mardi 18h30-20h30
      const mardi = cp['Mardi'] ?? []
      const cible = mardi.find((s) => s.includes('18:30') || s.includes('18h30'))
      if (cible) {
        console.log(`  ✅ TROUVÉ — Mardi 18h30-20h30 présent : "${cible}"`)
      } else {
        console.log('  ❌ ABSENT — Mardi 18h30-20h30 non trouvé dans creneaux_proposes')
        if (mardi.length > 0) {
          console.log(`  Slots Mardi présents : ${mardi.join(', ')}`)
        } else {
          console.log('  Aucun créneau Mardi dans creneaux_proposes')
        }
      }
    }
    console.log('---')
  }
}

main().catch((err) => { console.error('Erreur :', err.message); process.exit(1) })
