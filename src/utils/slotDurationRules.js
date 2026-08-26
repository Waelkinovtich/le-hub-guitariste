// ─── Règles métier associées aux durées de créneaux ───────────────────────────
// Source : pratiques pédagogiques standard + contrainte CESU légale.
// Ces libellés sont affichés dans SondagePage et SchoolDetailPage.

export const DUREES_DISPONIBLES = [15, 30, 45, 60]

// Règle affichée sous chaque option dans le sondage (null = aucune note)
export const REGLE_PAR_DUREE = {
  15: 'Cours éveil / très jeunes enfants',
  30: 'Durée standard',
  45: 'Validation de cycle (avis du professeur requis)',
  60: 'Employeurs CESU (obligatoire pour la déclaration)',
}
