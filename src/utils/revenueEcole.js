// ─── Calcul calendaire du revenu mensuel par école ────────────────────────────
//
// Remplace la constante naïve SEMAINES_PAR_MOIS = 52/12 ≈ 4,33 par un décompte
// précis des semaines de classe réelles à partir des périodes scolaires officielles.
// Source des périodes : src/utils/vacances.js (mise à jour annuelle requise).

import { getPériodes } from './vacances.js'

// ─── Types de lissage ─────────────────────────────────────────────────────────
// Valeurs internes indépendantes des libellés DB, pour isoler la logique métier.

/** Revenu annuel divisé par 12 — même montant chaque mois, toute l'année. */
export const LISSAGE_12_MOIS = 'lisse_12'
/** Revenu annuel divisé par 10 — versé sur les 10 mois de l'année scolaire. */
export const LISSAGE_10_MOIS = 'lisse_10'
/** Montant variable selon les semaines de classe du mois calendaire. */
export const LISSAGE_NON     = 'non_lisse'

// Valeurs DB exactes (synchronisées avec SchoolDetailPage.jsx et schools.js).
// Si ces libellés changent en base, mettre à jour ici en même temps.
const DB_SMOOTHING_LISSE = 'Lissé (même montant chaque mois)'
const DB_DURATION_12     = "12 mois (toute l'année)"

/**
 * Détermine le type de lissage à partir des colonnes DB payment_smoothing et payment_duration.
 * Retourne LISSAGE_NON pour tout mode non lissé (à la séance, variable, inconnu).
 */
export function determinerTypeLissage(paymentSmoothing, paymentDuration) {
  if (paymentSmoothing !== DB_SMOOTHING_LISSE) return LISSAGE_NON
  return paymentDuration === DB_DURATION_12 ? LISSAGE_12_MOIS : LISSAGE_10_MOIS
}

// ─── Helpers internes ─────────────────────────────────────────────────────────

const MS_PAR_JOUR = 86_400_000

// Parse 'YYYY-MM-DD' → timestamp UTC midnight, sans décalage de fuseau horaire.
function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// Filtre les périodes scolaires du tableau multi-années de vacances.js pour ne
// garder que celles de anneeScolaire (ex: '2025-2026'). Une période appartient
// à l'année si son début est entre le 1er septembre YYYY et le 1er août YYYY+1.
function filtrerPeriodes(anneeScolaire, zone) {
  const [debutAn, finAn] = anneeScolaire.split('-').map(Number)
  const borneDebut = Date.UTC(debutAn, 8, 1)  // 1er septembre
  const borneFin   = Date.UTC(finAn,   7, 1)  // 1er août (exclusive)
  return getPériodes(zone).filter((p) => {
    const ts = parseDate(p.debut)
    return ts >= borneDebut && ts < borneFin
  })
}

// ─── Fonctions exportées ──────────────────────────────────────────────────────

/**
 * Nombre total de semaines de classe (valeur décimale) sur l'année scolaire.
 * Chaque période contribue (fin - début + 1 jour) / 7 semaines.
 *
 * @param {string} anneeScolaire  ex: '2025-2026'
 * @param {string} zone           'A', 'B' ou 'C'
 * @returns {number}  0 si aucune donnée disponible pour cette année
 */
export function calculerSemainesDeClasseParAn(anneeScolaire, zone) {
  return filtrerPeriodes(anneeScolaire, zone).reduce((total, p) => {
    const jours = (parseDate(p.fin) - parseDate(p.debut)) / MS_PAR_JOUR + 1
    return total + jours / 7
  }, 0)
}

/**
 * Répartition des semaines de classe par mois calendaire sur l'année scolaire.
 *
 * Pour chaque mois (septembre YYYY → juillet YYYY+1), calcule le nombre de
 * semaines de classe au prorata du chevauchement entre les périodes de cours
 * et le mois — approximation linéaire suffisante pour une estimation de revenu.
 *
 * @param {string} anneeScolaire
 * @param {string} zone
 * @returns {Array<{ mois: string, semaines: number }>}  mois: 'YYYY-MM', chronologique
 */
export function calculerRepartitionMensuelleParSemainesDeClasse(anneeScolaire, zone) {
  const periodes = filtrerPeriodes(anneeScolaire, zone)
  if (!periodes.length) return []

  const [debutAn, finAn] = anneeScolaire.split('-').map(Number)
  const moisList = []
  for (let m = 8; m <= 11; m++) moisList.push({ annee: debutAn, moisIdx: m })
  for (let m = 0; m <= 6;  m++) moisList.push({ annee: finAn,   moisIdx: m })

  const pad = (n) => String(n).padStart(2, '0')

  return moisList.map(({ annee, moisIdx }) => {
    // Bornes en milieu de nuit UTC (exclusives côté fin) pour éviter tout artefact
    // de milliseconde lors de la division par MS_PAR_JOUR.
    const moisDebut   = Date.UTC(annee, moisIdx,     1)  // inclus
    const moisFinExcl = Date.UTC(annee, moisIdx + 1, 1)  // exclusif (minuit 1er du mois suivant)

    let jours = 0
    for (const p of periodes) {
      const pDebut   = parseDate(p.debut)
      const pFinExcl = parseDate(p.fin) + MS_PAR_JOUR  // exclusif (minuit du lendemain)

      const debut = Math.max(moisDebut,   pDebut)
      const fin   = Math.min(moisFinExcl, pFinExcl)
      if (fin <= debut) continue
      jours += (fin - debut) / MS_PAR_JOUR
    }

    return { mois: `${annee}-${pad(moisIdx + 1)}`, semaines: jours / 7 }
  })
}

/**
 * Revenu mensuel estimé pour une école selon son mode de versement réel.
 *
 * Lissé 12 mois : (semainesParAn × heuresHebdo × taux + prime) / 12
 * Lissé 10 mois : (semainesParAn × heuresHebdo × taux + prime) / 10
 * Non lissé     : semainesDuMoisCourant × heuresHebdo × taux + prime / 10
 *   — si le mois courant est hors classe (été, ou année non sélectionnée),
 *     retourne la moyenne d'un mois travaillé (total / 10) pour rester lisible.
 *   — retourne null si les données de l'année sont absentes (avant 2025-2026
 *     ou au-delà de 2027-2028 : ne pas inventer une estimation).
 *
 * @param {object} params
 * @param {number} params.heuresHebdo      Heures de cours par semaine dans cette école
 * @param {number} params.tauxHoraire      Rendement réel (€/h), décote fiabilité déjà incluse
 * @param {string} params.typeLissage      LISSAGE_12_MOIS | LISSAGE_10_MOIS | LISSAGE_NON
 * @param {string} params.anneeScolaire    ex: '2025-2026'
 * @param {string} params.zone             'A', 'B' ou 'C'
 * @param {number} [params.primeAnnuelle]  Prime annuelle estimée (€), optionnelle
 * @returns {number|null}
 */
export function calculerRevenuMensuelEcole({
  heuresHebdo, tauxHoraire, typeLissage, anneeScolaire, zone, primeAnnuelle = 0,
}) {
  if (!heuresHebdo || !tauxHoraire || !anneeScolaire || !zone) return null

  const prime = primeAnnuelle || 0

  if (typeLissage === LISSAGE_12_MOIS || typeLissage === LISSAGE_10_MOIS) {
    const semaines = calculerSemainesDeClasseParAn(anneeScolaire, zone)
    if (semaines === 0) return null  // données manquantes pour cette année scolaire
    const diviseur = typeLissage === LISSAGE_12_MOIS ? 12 : 10
    return (heuresHebdo * semaines * tauxHoraire + prime) / diviseur
  }

  // Mode non lissé : revenu du mois calendaire courant (semaines × taux)
  const repartition = calculerRepartitionMensuelleParSemainesDeClasse(anneeScolaire, zone)
  if (!repartition.length) return null

  const moisCourant = new Date().toISOString().slice(0, 7)
  const entree = repartition.find((r) => r.mois === moisCourant)

  if (entree?.semaines > 0) {
    // Prime répartie sur ~10 mois de classe (approximation par excès volontaire)
    return entree.semaines * heuresHebdo * tauxHoraire + prime / 10
  }

  // Mois hors classe (juillet-août) ou mois hors de l'année demandée :
  // retourner la moyenne sur 10 mois pour que la simulation reste utile
  const totalSemaines = repartition.reduce((acc, r) => acc + r.semaines, 0)
  if (totalSemaines === 0) return null
  return (totalSemaines * heuresHebdo * tauxHoraire + prime) / 10
}
