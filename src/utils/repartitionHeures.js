// ─── repartitionHeures.js ─────────────────────────────────────────────────────
//
// Moteur de répartition des heures hebdomadaires entre écoles.
// Importé par ObjectivesPage (simulateur). Toutes les fonctions sont pures.
//
// Architecture en deux passes :
//   Passe 1 — volumes fixes  : figés à current_weekly_hours, jamais négociables.
//   Passe 2 — volumes flexibles : round-robin borné, paramétré par diversification.

// ─── Constantes ───────────────────────────────────────────────────────────────

// Volume contractuel figé : jamais touché par l'optimisation.
// Source : HOURS_STABILITY_OPTIONS dans SchoolDetailPage.jsx.
export const HOURS_STABILITY_FIXE = 'Heures garanties / bloquées'

// Granularité : 15 min = 0,25 h. Toute allocation est arrondie à ce multiple
// pour rester traduisible en créneaux réels (ex : 2,5 h → 2 h 30).
export const GRANULARITE_HEURES = 0.25

// Gain maximal réaliste par rapport aux heures déjà pratiquées dans cette école.
// Au-delà, la demande serait trop abrupte pour être proposée à l'employeur.
// Exemple : une école à 10 h/sem ne peut pas se voir proposer plus de 15 h/sem.
export const GAIN_MAX_REALISTE_HEBDO = 5

// Réduction maximale réaliste par rapport aux heures déjà pratiquées.
// En dessous, la réduction perturberait trop l'organisation de l'école.
// Exemple : une école à 10 h/sem ne peut pas descendre sous 8 h/sem.
export const PERTE_MAX_REALISTE_HEBDO = 2

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Arrondit h au multiple de GRANULARITE_HEURES le plus proche.
 * @param {number}      h   - valeur brute à arrondir
 * @param {number|null} max - plafond appliqué après arrondi (null = aucun)
 */
export function arrondir(h, max) {
  const brut = Math.round(h / GRANULARITE_HEURES) * GRANULARITE_HEURES
  return max != null ? Math.min(brut, max) : brut
}

// ─── Moteur principal ─────────────────────────────────────────────────────────

/**
 * Répartit le budget d'heures hebdomadaires entre les écoles.
 *
 * Passe 1 — fixes : current_weekly_hours figé, soustrait du budget avant Passe 2.
 *
 * Passe 2 — flexibles : algorithme round-robin par tranches de GRANULARITE_HEURES,
 * avec bornes réalistes par école :
 *   • plafond  = min(current_weekly_hours + GAIN_MAX_REALISTE_HEBDO, desired_weekly_hours ?)
 *   • plancher = max(0, current_weekly_hours − PERTE_MAX_REALISTE_HEBDO)
 *
 * Le paramètre `diversification` (0–100) contrôle combien d'écoles reçoivent
 * un incrément à chaque tour du round-robin :
 *
 *   nbÉcolesParTour = max(1, round(1 + (diversification / 100) × (n − 1)))
 *
 *   où n = nombre total d'écoles flexibles éligibles (score connu, plafond non atteint).
 *
 *   diversification=0   → nbParTour=1 : remplit la meilleure école avant la suivante
 *                         (comportement glouton pur — équivalent mathématique)
 *   diversification=100 → nbParTour=n : 1 incrément distribué à chaque école par tour
 *                         (répartition la plus équilibrée possible)
 *   valeurs intermédiaires : interpolation linéaire arrondie au plus proche entier
 *
 * L'arithmétique interne est réalisée en "quarts d'heure" (entiers) pour éviter
 * l'accumulation d'erreurs flottantes sur de nombreux cycles.
 *
 * @param {Array}  schools          - écoles avec hours_stability, current_weekly_hours,
 *                                    desired_weekly_hours, priorityScore
 * @param {number} plafondHebdo     - plafond total d'heures hebdomadaires du prof
 * @param {number} [diversification=0] - curseur 0–100
 *
 * @returns {{
 *   ecoles:               Array,   - écoles enrichies de heuresHebdoProposees / volumeFixe /
 *                                    sousPlancherRealiste (true si budget insuffisant)
 *   heuresDistribuees:    number,  - heures effectivement allouées (fixes + flexibles)
 *   heuresMaxAtteignables: number, - maximum absorbable compte tenu des bornes réalistes
 *   budgetNonDistribue:   number,  - heures du plafond que les bornes n'ont pas pu absorber
 * }}
 */
export function repartirHeuresSelonPriorite(schools, plafondHebdo, diversification = 0) {
  // ── Passe 1 : volumes fixes ────────────────────────────────────────────────
  const fixes     = schools.filter((s) => s.hours_stability === HOURS_STABILITY_FIXE)
  const flexibles = schools.filter((s) => s.hours_stability !== HOURS_STABILITY_FIXE && s.priorityScore != null)
  const nonNotees = schools.filter((s) => s.hours_stability !== HOURS_STABILITY_FIXE && s.priorityScore == null)

  const resultFixes = fixes.map((s) => ({
    ...s,
    heuresHebdoProposees:  s.current_weekly_hours != null
      ? Math.round(s.current_weekly_hours / GRANULARITE_HEURES) * GRANULARITE_HEURES
      : null,
    volumeFixe:            true,
    sousPlancherRealiste:  false,
  }))

  const totalFixes = resultFixes.reduce((acc, s) => acc + (s.heuresHebdoProposees ?? 0), 0)

  // Travailler en quarts d'heure (entiers) pour éviter l'accumulation d'erreurs flottantes.
  // Q = nombre de quarts par heure = 4 pour GRANULARITE_HEURES = 0,25 h.
  const Q = Math.round(1 / GRANULARITE_HEURES) // 4
  let budgetQ = Math.max(0, Math.round((plafondHebdo - totalFixes) * Q))
  const budgetInitialQ = budgetQ

  // ── Passe 2 : volumes flexibles (round-robin borné) ────────────────────────
  // Tri stable par priorityScore décroissant : la meilleure école est servie
  // en priorité quelle que soit la diversification choisie.
  const flexiblesTriees = [...flexibles].sort((a, b) => b.priorityScore - a.priorityScore)

  // Calcul des bornes réalistes pour chaque école flexible.
  const etat = flexiblesTriees.map((s) => {
    const base = s.current_weekly_hours ?? 0
    // Plafond : gain max + contrainte desired_weekly_hours si renseignée
    const plafondRealiste = base + GAIN_MAX_REALISTE_HEBDO
    const plafondEcole    = s.desired_weekly_hours != null
      ? Math.min(plafondRealiste, s.desired_weekly_hours)
      : plafondRealiste
    return {
      school:      s,
      alloueQ:     0,
      plafondQ:    Math.round(plafondEcole * Q),
      plancherQ:   Math.round(Math.max(0, base - PERTE_MAX_REALISTE_HEBDO) * Q),
      baseQ:       Math.round(base * Q),
    }
  })

  const nFlexibles    = etat.length
  // Nombre d'écoles alimentées à chaque tour : interpolation linéaire entre 1 et n.
  const nbParTour     = nFlexibles === 0 ? 0
    : Math.max(1, Math.round(1 + (diversification / 100) * (nFlexibles - 1)))

  // Round-robin : donne 1 quart (GRANULARITE_HEURES) à chaque école du groupe
  // courant jusqu'à épuisement du budget ou blocage de toutes les écoles éligibles.
  let changed = true
  while (budgetQ > 0 && changed) {
    changed      = false
    const eligibles = etat.filter((e) => e.alloueQ < e.plafondQ)
    const parTour   = eligibles.slice(0, nbParTour)
    for (const e of parTour) {
      if (budgetQ <= 0) break
      const inc = Math.min(1, e.plafondQ - e.alloueQ, budgetQ)
      if (inc > 0) {
        e.alloueQ += inc
        budgetQ   -= inc
        changed    = true
      }
    }
  }

  // Maximum absorbable par les écoles flexibles dans la limite du budget initial
  const maxFlexiblesQ        = etat.reduce((acc, e) => acc + e.plafondQ, 0)
  const heuresMaxAtteignables = totalFixes + Math.min(maxFlexiblesQ, budgetInitialQ) / Q
  const heuresDistribuees     = totalFixes + etat.reduce((acc, e) => acc + e.alloueQ, 0) / Q
  const budgetNonDistribue    = budgetQ / Q

  const resultFlexibles = etat.map(({ school, alloueQ, plancherQ, baseQ }) => ({
    ...school,
    heuresHebdoProposees:  alloueQ / Q,
    volumeFixe:            false,
    // Signal d'alerte : budget trop faible pour atteindre le plancher réaliste
    sousPlancherRealiste:  alloueQ < plancherQ && alloueQ < baseQ,
  }))

  return {
    ecoles: [
      ...resultFixes,
      ...resultFlexibles,
      ...nonNotees.map((s) => ({ ...s, heuresHebdoProposees: null, volumeFixe: false, sousPlancherRealiste: false })),
    ],
    heuresDistribuees,
    heuresMaxAtteignables,
    budgetNonDistribue,
  }
}
