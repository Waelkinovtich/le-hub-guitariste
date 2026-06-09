const PERIODES = {
  A: [
    { nom: 'Rentree - Toussaint', debut: '2025-09-01', fin: '2025-10-18' },
    { nom: 'Toussaint - Noel', debut: '2025-11-03', fin: '2025-12-20' },
    { nom: 'Noel - Hiver', debut: '2026-01-05', fin: '2026-02-21' },
    { nom: 'Hiver - Printemps', debut: '2026-03-09', fin: '2026-04-18' },
    { nom: 'Printemps - Ete', debut: '2026-05-04', fin: '2026-07-04' },
  ],
  B: [
    { nom: 'Rentree - Toussaint', debut: '2025-09-01', fin: '2025-10-18' },
    { nom: 'Toussaint - Noel', debut: '2025-11-03', fin: '2025-12-20' },
    { nom: 'Noel - Hiver', debut: '2026-01-05', fin: '2026-02-07' },
    { nom: 'Hiver - Printemps', debut: '2026-02-23', fin: '2026-04-04' },
    { nom: 'Printemps - Ete', debut: '2026-04-20', fin: '2026-07-04' },
  ],
  C: [
    { nom: 'Rentree - Toussaint', debut: '2025-09-01', fin: '2025-10-18' },
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

export function getPeriodes(zone) {
  return PERIODES[zone] ?? PERIODES.B
}

export function getCurrentPeriode(zone, dateStr) {
  const today = dateStr ?? new Date().toISOString().slice(0, 10)
  const periodes = getPeriodes(zone)
  return periodes.find((p) => today >= p.debut && today <= p.fin) ?? periodes[0]
}
