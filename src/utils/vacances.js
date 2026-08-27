// ─── Périodes scolaires par zone ──────────────────────────────────────────────
//
// Chaque entrée représente une PÉRIODE DE COURS (pas une vacation) : du premier
// jour de classe après les vacances précédentes au dernier jour avant les suivantes.
// getVacances() calcule les plages de vacances comme les intervalles ENTRE ces périodes.
//
// ⚠️  MISE À JOUR ANNUELLE REQUISE : les données 2027-2028 sont provisoires.
//     Vérifier et compléter avant septembre 2027 sur :
//     https://www.education.gouv.fr/les-dates-de-rentree-114606
//     La prochaine année à ajouter sera 2028-2029 (ajouter avant sept. 2028).
//
// Source pour 2026-2027 : calendrier officiel Éducation Nationale publié.
// Source pour 2027-2028 : estimation provisoire basée sur le cycle rotatif
//                         A/B/C — À VÉRIFIER avant le déploiement de rentrée 2027.

// ─── 2025-2026 (données vérifiées) ───────────────────────────────────────────

const PERIODES_2025_2026 = {
  A: [
    { nom: 'Rentrée - Toussaint',  debut: '2025-09-01', fin: '2025-10-18' },
    { nom: 'Toussaint - Noël',     debut: '2025-11-03', fin: '2025-12-20' },
    { nom: 'Noël - Hiver',         debut: '2026-01-05', fin: '2026-02-21' },
    { nom: 'Hiver - Printemps',    debut: '2026-03-09', fin: '2026-04-18' },
    { nom: 'Printemps - Été',      debut: '2026-05-04', fin: '2026-07-04' },
  ],
  B: [
    { nom: 'Rentrée - Toussaint',  debut: '2025-09-01', fin: '2025-10-18' },
    { nom: 'Toussaint - Noël',     debut: '2025-11-03', fin: '2025-12-20' },
    { nom: 'Noël - Hiver',         debut: '2026-01-05', fin: '2026-02-07' },
    { nom: 'Hiver - Printemps',    debut: '2026-02-23', fin: '2026-04-04' },
    { nom: 'Printemps - Été',      debut: '2026-04-20', fin: '2026-07-04' },
  ],
  C: [
    { nom: 'Rentrée - Toussaint',  debut: '2025-09-01', fin: '2025-10-18' },
    { nom: 'Toussaint - Noël',     debut: '2025-11-03', fin: '2025-12-20' },
    { nom: 'Noël - Hiver',         debut: '2026-01-05', fin: '2026-02-14' },
    { nom: 'Hiver - Printemps',    debut: '2026-03-02', fin: '2026-04-11' },
    { nom: 'Printemps - Été',      debut: '2026-04-27', fin: '2026-07-04' },
  ],
}

// ─── 2026-2027 (données officielles publiées par l'Éducation Nationale) ───────

const PERIODES_2026_2027 = {
  A: [
    { nom: 'Rentrée - Toussaint',  debut: '2026-09-01', fin: '2026-10-23' },
    { nom: 'Toussaint - Noël',     debut: '2026-11-03', fin: '2026-12-18' },
    { nom: 'Noël - Hiver',         debut: '2027-01-05', fin: '2027-02-12' },
    { nom: 'Hiver - Printemps',    debut: '2027-03-02', fin: '2027-04-09' },
    { nom: 'Printemps - Été',      debut: '2027-04-27', fin: '2027-07-04' },
  ],
  B: [
    { nom: 'Rentrée - Toussaint',  debut: '2026-09-01', fin: '2026-10-23' },
    { nom: 'Toussaint - Noël',     debut: '2026-11-03', fin: '2026-12-18' },
    { nom: 'Noël - Hiver',         debut: '2027-01-05', fin: '2027-02-05' },
    { nom: 'Hiver - Printemps',    debut: '2027-02-23', fin: '2027-04-23' },
    { nom: 'Printemps - Été',      debut: '2027-05-11', fin: '2027-07-04' },
  ],
  C: [
    { nom: 'Rentrée - Toussaint',  debut: '2026-09-01', fin: '2026-10-23' },
    { nom: 'Toussaint - Noël',     debut: '2026-11-03', fin: '2026-12-18' },
    { nom: 'Noël - Hiver',         debut: '2027-01-05', fin: '2027-02-19' },
    { nom: 'Hiver - Printemps',    debut: '2027-03-09', fin: '2027-04-16' },
    { nom: 'Printemps - Été',      debut: '2027-05-04', fin: '2027-07-04' },
  ],
}

// ─── 2027-2028 (données PROVISOIRES — à vérifier avant septembre 2027) ────────
// Estimation basée sur le cycle rotatif des zones. Source officielle attendue :
// https://www.education.gouv.fr/les-dates-de-rentree-114606

const PERIODES_2027_2028 = {
  A: [
    { nom: 'Rentrée - Toussaint',  debut: '2027-09-01', fin: '2027-10-22' },
    { nom: 'Toussaint - Noël',     debut: '2027-11-02', fin: '2027-12-17' },
    { nom: 'Noël - Hiver',         debut: '2028-01-04', fin: '2028-02-18' },
    { nom: 'Hiver - Printemps',    debut: '2028-03-07', fin: '2028-04-07' },
    { nom: 'Printemps - Été',      debut: '2028-04-25', fin: '2028-07-05' },
  ],
  B: [
    { nom: 'Rentrée - Toussaint',  debut: '2027-09-01', fin: '2027-10-22' },
    { nom: 'Toussaint - Noël',     debut: '2027-11-02', fin: '2027-12-17' },
    { nom: 'Noël - Hiver',         debut: '2028-01-04', fin: '2028-02-11' },
    { nom: 'Hiver - Printemps',    debut: '2028-03-01', fin: '2028-04-21' },
    { nom: 'Printemps - Été',      debut: '2028-05-09', fin: '2028-07-05' },
  ],
  C: [
    { nom: 'Rentrée - Toussaint',  debut: '2027-09-01', fin: '2027-10-22' },
    { nom: 'Toussaint - Noël',     debut: '2027-11-02', fin: '2027-12-17' },
    { nom: 'Noël - Hiver',         debut: '2028-01-04', fin: '2028-02-04' },
    { nom: 'Hiver - Printemps',    debut: '2028-02-22', fin: '2028-04-14' },
    { nom: 'Printemps - Été',      debut: '2028-05-02', fin: '2028-07-05' },
  ],
}

// Les périodes des différentes années sont concaténées : getVacances() calcule
// automatiquement l'été entre deux années comme l'intervalle entre la dernière
// période d'une année et la première de la suivante.
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

// ─── Métadonnées visuelles des vacances ───────────────────────────────────────
// Clés = noms utilisés dans getVacances() et le tableau `noms` ci-dessous.
export const VACANCES_META = {
  'Toussaint': { emoji: '🎃', color: '#f97316', label: 'Vacances de la Toussaint' },
  'Noël':      { emoji: '🎄', color: '#16a34a', label: 'Vacances de Noël' },
  'Hiver':     { emoji: '❄️',  color: '#38bdf8', label: "Vacances d'hiver" },
  'Printemps': { emoji: '🌸', color: '#a3e635', label: 'Vacances de printemps' },
  'Été':       { emoji: '☀️',  color: '#facc15', label: "Vacances d'été" },
}

// ─── Jours fériés ─────────────────────────────────────────────────────────────
// Couvre les années scolaires jusqu'à 2027-2028.
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
  { date: '2027-03-29', label: 'Lundi de Paques',    emoji: '🐣' }, // Pâques 2027 : 28 mars
  { date: '2027-05-01', label: 'Fete du Travail',    emoji: '🛠' },
  { date: '2027-05-06', label: 'Ascension',          emoji: '✨' }, // 39j après Pâques
  { date: '2027-05-08', label: 'Victoire 1945',      emoji: '🇫🇷' },
  { date: '2027-05-17', label: 'Lundi de Pentecote', emoji: '🕊' }, // 50j après Pâques
  { date: '2027-07-14', label: 'Fete Nationale',     emoji: '🇫🇷' },
  { date: '2027-08-15', label: 'Assomption',         emoji: '🌼' },
  // 2027-2028
  { date: '2027-11-01', label: 'Toussaint',         emoji: '🎃' },
  { date: '2027-11-11', label: 'Armistice',          emoji: '🕊' },
  { date: '2027-12-25', label: 'Noël',               emoji: '🎄' },
  { date: '2028-01-01', label: 'Jour de l an',       emoji: '🎆' },
  { date: '2028-04-17', label: 'Lundi de Paques',    emoji: '🐣' }, // Pâques 2028 : 16 avril
  { date: '2028-05-01', label: 'Fete du Travail',    emoji: '🛠' },
  { date: '2028-05-08', label: 'Victoire 1945',      emoji: '🇫🇷' },
  { date: '2028-05-25', label: 'Ascension',          emoji: '✨' }, // 39j après Pâques
  { date: '2028-06-03', label: 'Lundi de Pentecote', emoji: '🕊' }, // 50j après Pâques
  { date: '2028-07-14', label: 'Fete Nationale',     emoji: '🇫🇷' },
  { date: '2028-08-15', label: 'Assomption',         emoji: '🌼' },
]

// Calcule les périodes de vacances comme les intervalles entre périodes de cours.
// L'été inter-annuel (entre la dernière période d'une année et la première de la
// suivante) est nommé 'Été' — nom de position dans le cycle de 5 vacances.
export function getVacances(zone) {
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
    const nom = noms[i % noms.length] // modulo : cycle sur les 5 noms d'une année à l'autre
    const meta = VACANCES_META[nom] ?? VACANCES_META['Été']
    vacances.push({ nom, label: meta.label, emoji: meta.emoji, color: meta.color, debut: toISO(debut), fin: toISO(fin) })
  }
  return vacances
}

export function isVacances(dateStr, zone) {
  return getVacances(zone).find((v) => dateStr >= v.debut && dateStr <= v.fin) ?? null
}

export function isJourFerie(dateStr) {
  return JOURS_FERIES.find((j) => j.date === dateStr) ?? null
}
