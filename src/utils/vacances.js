// ─── Périodes scolaires — données dans src/data/calendrierScolaire.js ─────────
import { PERIODES_2025_2026, PERIODES_2026_2027, PERIODES_2027_2028 } from '../data/calendrierScolaire'

const PERIODES = {
  A: [...PERIODES_2025_2026.A, ...PERIODES_2026_2027.A, ...PERIODES_2027_2028.A],
  B: [...PERIODES_2025_2026.B, ...PERIODES_2026_2027.B, ...PERIODES_2027_2028.B],
  C: [...PERIODES_2025_2026.C, ...PERIODES_2026_2027.C, ...PERIODES_2027_2028.C],
}

export const ZONES = [
  { value: 'A', label: 'Zone A (Lyon, Bordeaux, Grenoble...)' },
  { value: 'B', label: 'Zone B (Lille, Nantes, Nice, Strasbourg...)' },
  { value: 'C', label: 'Zone C (Paris, Toulouse, Montpellier...)' },
]

export function getPériodes(zone) {
  return PERIODES[zone] ?? PERIODES.B
}

export function getCurrentPériode(zone, dateStr) {
  const today = dateStr ?? new Date().toISOString().slice(0, 10)
  const périodes = getPériodes(zone)
  return périodes.find((p) => today >= p.debut && today <= p.fin) ?? périodes[0]
}

export const VACANCES_META = {
  'Toussaint': { emoji: '🎃', color: '#f97316', label: 'Vacances de la Toussaint' },
  'Noël':      { emoji: '🎄', color: '#16a34a', label: 'Vacances de Noël' },
  'Hiver':     { emoji: '❄️',  color: '#38bdf8', label: "Vacances d'hiver" },
  'Printemps': { emoji: '🌸', color: '#a3e635', label: 'Vacances de printemps' },
  'Été':       { emoji: '☀️',  color: '#facc15', label: "Vacances d'été" },
}

export const JOURS_FERIES = [
  // 2025-2026
  { date: '2025-11-01', label: 'Toussaint',         emoji: '🎃' },
  { date: '2025-11-11', label: 'Armistice',          emoji: '🕊' },
  { date: '2025-12-25', label: 'Noël',               emoji: '🎄' },
  { date: '2026-01-01', label: 'Jour de l an',       emoji: '🎆' },
  { date: '2026-04-06', label: 'Lundi de Paques',    emoji: '🐣' },
  { date: '2026-05-01', label: 'Fete du Travail',    emoji: '🛠' },
  { date: '2026-05-08', label: 'Victoire 1945',      emoji: '🇫🇷' },
  { date: '2026-05-14', label: 'Ascension',          emoji: '✨' },
  { date: '2026-05-25', label: 'Lundi de Pentecote', emoji: '🕊' },
  { date: '2026-07-14', label: 'Fete Nationale',     emoji: '🇫🇷' },
  { date: '2026-08-15', label: 'Assomption',         emoji: '🌼' },
  // 2026-2027
  { date: '2026-11-01', label: 'Toussaint',         emoji: '🎃' },
  { date: '2026-11-11', label: 'Armistice',          emoji: '🕊' },
  { date: '2026-12-25', label: 'Noël',               emoji: '🎄' },
  { date: '2027-01-01', label: 'Jour de l an',       emoji: '🎆' },
  { date: '2027-03-29', label: 'Lundi de Paques',    emoji: '🐣' },
  { date: '2027-05-01', label: 'Fete du Travail',    emoji: '🛠' },
  { date: '2027-05-06', label: 'Ascension',          emoji: '✨' },
  { date: '2027-05-08', label: 'Victoire 1945',      emoji: '🇫🇷' },
  { date: '2027-05-17', label: 'Lundi de Pentecote', emoji: '🕊' },
  { date: '2027-07-14', label: 'Fete Nationale',     emoji: '🇫🇷' },
  { date: '2027-08-15', label: 'Assomption',         emoji: '🌼' },
  // 2027-2028
  { date: '2027-11-01', label: 'Toussaint',         emoji: '🎃' },
  { date: '2027-11-11', label: 'Armistice',          emoji: '🕊' },
  { date: '2027-12-25', label: 'Noël',               emoji: '🎄' },
  { date: '2028-01-01', label: 'Jour de l an',       emoji: '🎆' },
  { date: '2028-04-17', label: 'Lundi de Paques',    emoji: '🐣' },
  { date: '2028-05-01', label: 'Fete du Travail',    emoji: '🛠' },
  { date: '2028-05-08', label: 'Victoire 1945',      emoji: '🇫🇷' },
  { date: '2028-05-25', label: 'Ascension',          emoji: '✨' },
  { date: '2028-06-03', label: 'Lundi de Pentecote', emoji: '🕊' },
  { date: '2028-07-14', label: 'Fete Nationale',     emoji: '🇫🇷' },
  { date: '2028-08-15', label: 'Assomption',         emoji: '🌼' },
]

// ─── Dérivation des vacances depuis les périodes de cours ─────────────────────

function _getVacancesFromPeriodes(zone) {
  const périodes = getPériodes(zone)
  const vacances = []
  const noms = ['Toussaint', 'Noël', 'Hiver', 'Printemps', 'Été']
  for (let i = 0; i < périodes.length - 1; i++) {
    const debut = new Date(périodes[i].fin)
    debut.setDate(debut.getDate() + 1)
    const fin = new Date(périodes[i + 1].debut)
    fin.setDate(fin.getDate() - 1)
    const pad = (n) => String(n).padStart(2, '0')
    const toISO = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    const nom = noms[i % noms.length]
    const meta = VACANCES_META[nom] ?? VACANCES_META['Été']
    vacances.push({ nom, label: meta.label, emoji: meta.emoji, color: meta.color, debut: toISO(debut), fin: toISO(fin) })
  }
  return vacances
}

// ─── Cache localStorage (API ministère) ───────────────────────────────────────
// Deux clés par zone :
//   hub_vacances_future_${zone}  → vacances des années NON couvertes par la table embarquée
//   hub_vacances_diff_${zone}    → écarts API/table pour les années connues (lecture seule)

const CACHE_KEY_FUTURE = (zone) => `hub_vacances_future_${zone}`
const CACHE_KEY_DIFF   = (zone) => `hub_vacances_diff_${zone}`
// Clé legacy — maintenu pour migration silencieuse (lecture seule)
const CACHE_KEY_LEGACY = (zone) => `hub_vacances_${zone}`
const CACHE_TTL = 24 * 60 * 60 * 1000 // 1 jour

// Dernière date couverte par la table embarquée (Été 2027-2028)
const TABLE_LAST_DATE = '2028-09-01'

function _getCachedFutureVacances(zone) {
  try {
    const raw = localStorage.getItem(CACHE_KEY_FUTURE(zone))
    if (!raw) return null
    const { timestamp, vacances } = JSON.parse(raw)
    if (!Array.isArray(vacances) || Date.now() - timestamp > CACHE_TTL) return null
    return vacances
  } catch {
    return null
  }
}

function _setCachedFutureVacances(zone, vacances) {
  try {
    localStorage.setItem(CACHE_KEY_FUTURE(zone), JSON.stringify({ timestamp: Date.now(), vacances }))
  } catch { /* quota dépassé — silencieux */ }
}

function _setCachedDiff(zone, diffs) {
  try {
    localStorage.setItem(CACHE_KEY_DIFF(zone), JSON.stringify({ timestamp: Date.now(), diffs }))
  } catch { /* silencieux */ }
}

export function getCachedDiff(zone) {
  try {
    const raw = localStorage.getItem(CACHE_KEY_DIFF(zone))
    if (!raw) return null
    const { diffs } = JSON.parse(raw)
    return Array.isArray(diffs) && diffs.length > 0 ? diffs : null
  } catch { return null }
}

// Convertit un timestamp UTC de l'API en date locale Paris (ISO YYYY-MM-DD).
// L'API encode "minuit Paris" en UTC → start_date = 1er jour de vacances,
// end_date = jour de reprise (NON inclus dans les vacances).
function _apiUTCToParisISO(utcStr) {
  const d = new Date(utcStr)
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d).split('/')
  return parts[2] + '-' + parts[1] + '-' + parts[0]
}

function _subtractOneDay(isoStr) {
  const d = new Date(isoStr + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

function _apiDescToNom(desc) {
  if (!desc) return 'Été'
  if (desc.includes('Toussaint')) return 'Toussaint'
  if (desc.includes('Noël') || desc.includes('Noel')) return 'Noël'
  if (desc.includes('Hiver')) return 'Hiver'
  if (desc.includes('Printemps')) return 'Printemps'
  return 'Été'
}

// ─── Fetch API ministère ───────────────────────────────────────────────────────
// Règles de sécurité :
//  1. La table embarquée prime pour toutes les années qu'elle contient (≤ 2028-09-01).
//  2. L'API n'alimente que les années futures absentes de la table.
//  3. Toute réponse invalide (< 4 vacances par an, dates non croissantes, zone absente,
//     échec réseau) est ignorée silencieusement — repli sur la table embarquée.
//  4. Si l'API diffère de la table pour une année connue, l'écart est stocké
//     séparément (hub_vacances_diff_${zone}) et affiché dans les Réglages.

export async function refreshCalendrierScolaire(zone) {
  const zoneLabel = (zone === 'A' || zone === 'B' || zone === 'C') ? 'Zone ' + zone : zone
  const encoded = encodeURIComponent(`zones="${zoneLabel}"`)
  const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?limit=100&select=description,start_date,end_date,zones,annee_scolaire&where=${encoded}&order_by=annee_scolaire,start_date`

  let json
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!resp.ok) return getVacances(zone)   // repli silencieux
    json = await resp.json()
  } catch {
    return getVacances(zone)   // réseau indisponible → repli silencieux
  }

  if (!Array.isArray(json?.results) || json.results.length === 0) return getVacances(zone)

  // Dédupliquer et parser toutes les entrées valides
  const seen = new Set()
  const byYear = {}   // annee_scolaire → [vacance]
  for (const r of json.results) {
    if (!r.start_date || !r.end_date || !r.description || !r.annee_scolaire) continue
    const key = r.annee_scolaire + '|' + r.description + '|' + r.start_date
    if (seen.has(key)) continue
    seen.add(key)
    const debut = _apiUTCToParisISO(r.start_date)
    const retour = _apiUTCToParisISO(r.end_date)
    const fin = _subtractOneDay(retour)
    if (fin < debut) continue
    const nom = _apiDescToNom(r.description)
    const meta = VACANCES_META[nom] ?? VACANCES_META['Été']
    if (!byYear[r.annee_scolaire]) byYear[r.annee_scolaire] = []
    byYear[r.annee_scolaire].push({ nom, label: meta.label, emoji: meta.emoji, color: meta.color, debut, fin })
  }

  // Validation : chaque année doit avoir ≥ 4 vacances et des dates croissantes
  const tableVacances = _getVacancesFromPeriodes(zone)
  const futureVacances = []
  const diffs = []

  for (const [annee, vacs] of Object.entries(byYear)) {
    if (vacs.length < 4) continue   // trop peu de données → ignorer
    // Vérifier dates croissantes
    let valid = true
    for (let i = 1; i < vacs.length; i++) {
      if (vacs[i].debut <= vacs[i - 1].debut) { valid = false; break }
    }
    if (!valid) continue

    // Déterminer si l'année est couverte par la table embarquée
    const firstDebut = vacs[0].debut
    const isKnownYear = firstDebut < TABLE_LAST_DATE

    if (isKnownYear) {
      // Comparer avec la table embarquée
      for (const vac of vacs) {
        const tableMatch = tableVacances.find((t) => t.nom === vac.nom &&
          Math.abs(new Date(t.debut) - new Date(vac.debut)) < 3 * 86400000)
        if (tableMatch && (tableMatch.debut !== vac.debut || tableMatch.fin !== vac.fin)) {
          diffs.push({ annee, nom: vac.nom, apiDebut: vac.debut, apiFin: vac.fin, tableDebut: tableMatch.debut, tableFin: tableMatch.fin })
        }
      }
      // Table embarquée prime → ne pas écraser
    } else {
      futureVacances.push(...vacs)
    }
  }

  if (diffs.length > 0) _setCachedDiff(zone, diffs)
  if (futureVacances.length >= 4) _setCachedFutureVacances(zone, futureVacances)

  return getVacances(zone)
}

// ─── API publique ──────────────────────────────────────────────────────────────

export function getVacances(zone) {
  // La table embarquée est toujours autoritaire pour les années connues.
  const embedded = _getVacancesFromPeriodes(zone)
  // Compléter avec les données API pour les années futures (au-delà de TABLE_LAST_DATE)
  const future = _getCachedFutureVacances(zone) ?? []
  const futureFiltered = future
    .filter((v) => v.debut >= TABLE_LAST_DATE)
    .map((v) => {
      const meta = VACANCES_META[v.nom] ?? VACANCES_META['Été']
      return { ...v, label: v.label ?? meta.label, emoji: v.emoji ?? meta.emoji, color: v.color ?? meta.color }
    })
  return [...embedded, ...futureFiltered]
}

export function isVacances(dateStr, zone) {
  return getVacances(zone).find((v) => dateStr >= v.debut && dateStr <= v.fin) ?? null
}

export function isJourFerie(dateStr) {
  return JOURS_FERIES.find((j) => j.date === dateStr) ?? null
}

// Retourne les vacances + la source des données, pour l'affichage dans les Réglages.
export function getVacancesInfo(zone) {
  let hasFutureCache = false
  let updatedAt = null
  try {
    const raw = localStorage.getItem(CACHE_KEY_FUTURE(zone))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.vacances) && parsed.timestamp && Date.now() - parsed.timestamp < CACHE_TTL) {
        hasFutureCache = true
        updatedAt = new Date(parsed.timestamp)
      }
    }
    // Migration legacy : nettoyer l'ancienne clé si elle existe
    if (localStorage.getItem(CACHE_KEY_LEGACY(zone))) {
      localStorage.removeItem(CACHE_KEY_LEGACY(zone))
    }
  } catch { /* ignore */ }
  const diffs = getCachedDiff(zone)
  return {
    vacances: getVacances(zone),
    source: hasFutureCache ? 'table embarquée + ministère (années futures)' : 'table embarquée',
    updatedAt,
    diffs,   // null ou [{annee, nom, apiDebut, apiFin, tableDebut, tableFin}]
  }
}
