// ─── Options élève partagées ───────────────────────────────────────────────────
// Source unique de vérité pour le sondage public ET le formulaire professeur.
// Toute modification ici se répercute sur les deux interfaces.

// Nomenclature officielle de la Confédération Musicale de France (CMF)
export const NIVEAUX = [
  'Éveil',
  'Initiation',
  // Cycle 1 (3 ans + examen de fin de cycle)
  'Cycle 1 — 1re année',
  'Cycle 1 — 2e année',
  'Cycle 1 — 3e année',
  'Fin de cycle 1',
  // Cycle 2 (3 ans + examen de fin de cycle)
  'Cycle 2 — 1re année',
  'Cycle 2 — 2e année',
  'Cycle 2 — 3e année',
  'Fin de cycle 2',
  // Cycle 3 (2-3 ans + parcours diplômant)
  'Cycle 3 — 1re année',
  'Cycle 3 — 2e année',
  'Cycle 3 — 3e année',
  'Fin de cycle 3',
  'Cycle 3 diplômant / CEM',
  // Diplômes et cursus post-cycle
  'COP',
  'DEM',
  // Hors cursus fédéral
  'Adulte loisir',
  'Autre / pas de cycle fédéral',
]

// Instruments proposés — cohérence avec les données historiques en base
// ("Guitare folk" est la valeur canonique depuis la migration de sept. 2025)
export const INSTRUMENTS = [
  'Guitare folk',
  'Guitare électrique',
  'Guitare classique',
  'Basse',
  'Autre',
]

// Rôle du tuteur vis-à-vis de l'élève — "Autre" déclenche un champ texte libre
export const ROLES_TUTEUR = ['Père', 'Mère', 'Autre']

// Usage du contact tuteur (pour les communications du professeur)
export const USAGES_TUTEUR = ['Organisation', 'Documents pédagogiques', 'Les deux']
