// ─── Périodes scolaires par zone ───────────────────────────────────────────────
// Données seulement. Logic dans src/utils/vacances.js.
// Modèle : PERIODES stocke les périodes de COURS (pas les vacances).
// Dérivation des vacances = intervalles entre périodes successives.
//
// Convention officielle EN :
//   - jour de départ (samedi) = premier jour de vacances
//   - jour de reprise (lundi) = premier jour hors vacances
//   → period[i].fin   = vendredi avant le départ
//   → period[i+1].debut = lundi de reprise
//
// Source 2026-2027 : arrêté du 22 octobre 2025.
// Source 2027-2028 : PROVISOIRE — vérifier avant septembre 2027.

export const PERIODES_2025_2026 = {
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

// Zone B (Lille) — validée contre l'arrêté du 22 octobre 2025 :
//   Toussaint  sam. 2026-10-17 → lun. 2026-11-02 (reprise) ✓
//   Noël       sam. 2026-12-19 → lun. 2027-01-04 (reprise) ✓
//   Hiver      sam. 2027-02-20 → lun. 2027-03-08 (reprise) ✓
//   Printemps  sam. 2027-04-17 → lun. 2027-05-03 (reprise) ✓
//   Été        à partir du sam. 2027-07-03                  ✓
export const PERIODES_2026_2027 = {
  A: [
    { nom: 'Rentrée - Toussaint',  debut: '2026-09-01', fin: '2026-10-16' },
    { nom: 'Toussaint - Noël',     debut: '2026-11-02', fin: '2026-12-18' },
    { nom: 'Noël - Hiver',         debut: '2027-01-04', fin: '2027-02-12' },
    { nom: 'Hiver - Printemps',    debut: '2027-03-01', fin: '2027-04-09' },
    { nom: 'Printemps - Été',      debut: '2027-04-26', fin: '2027-07-02' },
  ],
  B: [
    { nom: 'Rentrée - Toussaint',  debut: '2026-09-01', fin: '2026-10-16' },
    { nom: 'Toussaint - Noël',     debut: '2026-11-02', fin: '2026-12-18' },
    { nom: 'Noël - Hiver',         debut: '2027-01-04', fin: '2027-02-19' },
    { nom: 'Hiver - Printemps',    debut: '2027-03-08', fin: '2027-04-16' },
    { nom: 'Printemps - Été',      debut: '2027-05-03', fin: '2027-07-02' },
  ],
  C: [
    { nom: 'Rentrée - Toussaint',  debut: '2026-09-01', fin: '2026-10-16' },
    { nom: 'Toussaint - Noël',     debut: '2026-11-02', fin: '2026-12-18' },
    { nom: 'Noël - Hiver',         debut: '2027-01-04', fin: '2027-02-05' },
    { nom: 'Hiver - Printemps',    debut: '2027-02-22', fin: '2027-04-02' },
    { nom: 'Printemps - Été',      debut: '2027-04-19', fin: '2027-07-02' },
  ],
}

// PROVISOIRE — à vérifier avant septembre 2027.
export const PERIODES_2027_2028 = {
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
