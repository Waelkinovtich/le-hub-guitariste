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

const CACHE_KEY = (zone) => `hub_vacances_${zone}`
const CACHE_TTL = 24 * 60 * 60 * 1000 // 1 jour

function _getCachedVacances(zone) {
  try {
    const raw = localStorage.getItem(CACHE_KEY(zone))
    if (!raw) return null
    const { timestamp, vacances } = JSON.parse(raw)
    if (!Array.isArray(vacances) || Date.now() - timestamp > CACHE_TTL) return null
    return vacances
  } catch {
    return null
  }
}

function _setCachedVacances(zone, vacances) {
  try {
    localStorage.setItem(CACHE_KEY(zone), JSON.stringify({ timestamp: Date.now(), vacances }))
  } catch { /* quota dépassé — silencieux */ }
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
// Récupère les vacances Zone A, B ou C depuis data.education.gouv.fr.
// Met le résultat en cache localStorage (TTL 24 h). Retourne les vacances.
// Lance une exception en cas d'échec réseau ou HTTP.

export async function refreshCalendrierScolaire(zone) {
  const encoded = encodeURIComponent(`zones="${zone === 'A' || zone === 'B' || zone === 'C' ? 'Zone ' + zone : zone}"`)
  const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?limit=200&select=description,start_date,end_date,zones,annee_scolaire&where=${encoded}&order_by=annee_scolaire,start_date`
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!resp.ok) throw new Error(`Erreur HTTP ${resp.status}`)
  const json = await resp.json()
  // Dédupliquer par (annee_scolaire, description, start_date)
  const seen = new Set()
  const meta0 = VACANCES_META
  const vacances = []
  for (const r of json.results ?? []) {
    if (!r.start_date || !r.end_date || !r.description) continue
    const key = (r.annee_scolaire ?? '') + '|' + r.description + '|' + r.start_date
    if (seen.has(key)) continue
    seen.add(key)
    const debut = _apiUTCToParisISO(r.start_date)
    const retour = _apiUTCToParisISO(r.end_date)
    const fin = _subtractOneDay(retour)
    if (fin < debut) continue
    const nom = _apiDescToNom(r.description)
    const meta = meta0[nom] ?? meta0['Été']
    vacances.push({ nom, label: meta.label, emoji: meta.emoji, color: meta.color, debut, fin })
  }
  _setCachedVacances(zone, vacances)
  return vacances
}

// ─── API publique ──────────────────────────────────────────────────────────────

export function getVacances(zone) {
  const cached = _getCachedVacances(zone)
  if (cached) {
    return cached.map((v) => {
      const meta = VACANCES_META[v.nom] ?? VACANCES_META['Été']
      return { ...v, label: v.label ?? meta.label, emoji: v.emoji ?? meta.emoji, color: v.color ?? meta.color }
    })
  }
  return _getVacancesFromPeriodes(zone)
}

export function isVacances(dateStr, zone) {
  return getVacances(zone).find((v) => dateStr >= v.debut && dateStr <= v.fin) ?? null
}

export function isJourFerie(dateStr) {
  return JOURS_FERIES.find((j) => j.date === dateStr) ?? null
}

// Retourne les vacances + la source des données, pour l'affichage dans les Réglages.
export function getVacancesInfo(zone) {
  try {
    const raw = localStorage.getItem(CACHE_KEY(zone))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.vacances) && parsed.timestamp) {
        return {
          vacances: getVacances(zone),
          source: 'ministère',
          updatedAt: new Date(parsed.timestamp),
        }
      }
    }
  } catch { /* ignore */ }
  return { vacances: getVacances(zone), source: 'table embarquée', updatedAt: null }
}
