const PERIODES = {
  A: [
    { nom: 'Rentrée - Toussaint', debut: '2025-09-01', fin: '2025-10-18' },
    { nom: 'Toussaint - Noel', debut: '2025-11-03', fin: '2025-12-20' },
    { nom: 'Noel - Hiver', debut: '2026-01-05', fin: '2026-02-21' },
    { nom: 'Hiver - Printemps', debut: '2026-03-09', fin: '2026-04-18' },
    { nom: 'Printemps - Ete', debut: '2026-05-04', fin: '2026-07-04' },
  ],
  B: [
    { nom: 'Rentrée - Toussaint', debut: '2025-09-01', fin: '2025-10-18' },
    { nom: 'Toussaint - Noel', debut: '2025-11-03', fin: '2025-12-20' },
    { nom: 'Noel - Hiver', debut: '2026-01-05', fin: '2026-02-07' },
    { nom: 'Hiver - Printemps', debut: '2026-02-23', fin: '2026-04-04' },
    { nom: 'Printemps - Ete', debut: '2026-04-20', fin: '2026-07-04' },
  ],
  C: [
    { nom: 'Rentrée - Toussaint', debut: '2025-09-01', fin: '2025-10-18' },
    { nom: 'Toussaint - Noel', debut: '2025-11-03', fin: '2025-12-20' },
    { nom: 'Noel - Hiver', debut: '2026-01-05', fin: '2026-02-14' },
    { nom: 'Hiver - Printemps', debut: '2026-03-02', fin: '2026-04-11' },
    { nom: 'Printemps - Ete', debut: '2026-04-27', fin: '2026-07-04' },
  ],
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
  'Noel':      { emoji: '🎄', color: '#16a34a', label: 'Vacances de Noel' },
  'Hiver':     { emoji: '❄️',  color: '#38bdf8', label: 'Vacances d Hiver' },
  'Printemps': { emoji: '🌸', color: '#a3e635', label: 'Vacances de Printemps' },
  'Ete':       { emoji: '☀️',  color: '#facc15', label: 'Vacances d Ete' },
}

export const JOURS_FERIES = [
  { date: '2025-11-01', label: 'Toussaint', emoji: '🎃' },
  { date: '2025-11-11', label: 'Armistice', emoji: '🕊' },
  { date: '2025-12-25', label: 'Noel', emoji: '🎄' },
  { date: '2026-01-01', label: 'Jour de l an', emoji: '🎆' },
  { date: '2026-04-06', label: 'Lundi de Paques', emoji: '🐣' },
  { date: '2026-05-01', label: 'Fete du Travail', emoji: '🛠' },
  { date: '2026-05-08', label: 'Victoire 1945', emoji: '🇫🇷' },
  { date: '2026-05-14', label: 'Ascension', emoji: '✨' },
  { date: '2026-05-25', label: 'Lundi de Pentecote', emoji: '🕊' },
  { date: '2026-07-14', label: 'Fete Nationale', emoji: '🇫🇷' },
  { date: '2026-08-15', label: 'Assomption', emoji: '🌼' },
]

export function getVacances(zone) {
  const périodes = getPériodes(zone)
  const vacances = []
  const noms = ['Toussaint', 'Noel', 'Hiver', 'Printemps', 'Ete']
  for (let i = 0; i < périodes.length - 1; i++) {
    const debut = new Date(périodes[i].fin)
    debut.setDate(debut.getDate() + 1)
    const fin = new Date(périodes[i + 1].debut)
    fin.setDate(fin.getDate() - 1)
    const pad = (n) => String(n).padStart(2, '0')
    const toISO = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    const nom = noms[i] ?? 'Ete'
    const meta = VACANCES_META[nom] ?? VACANCES_META['Ete']
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
