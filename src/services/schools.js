import { supabase } from '../lib/supabase'

// ─── Champs de base ───────────────────────────────────────────────────────────

export async function fetchTeacherSchools(teacherId) {
  const { data, error } = await supabase
    .from('schools')
    .select('id, name, structure_type, current_weekly_hours, desired_weekly_hours, manual_priority_rating, premises_quality_rating, work_atmosphere_rating, student_engagement_rating, team_stability_rating, equipment_rating, growth_perspective_rating, parking_rating, contract_type, contract_start_date, payment_smoothing, fixed_monthly_salary, hours_stability, access_restriction_type, manual_reliability_override, administrative_reliability_rating, latitude, longitude, tags, contract_end_date')
    .eq('teacher_id', teacherId)
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createSchool(teacherId, name, structureType = null) {
  const payload = { teacher_id: teacherId, name: name.trim() }
  if (structureType) payload.structure_type = structureType
  const { data, error } = await supabase
    .from('schools')
    .insert(payload)
    .select('id, name, structure_type')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteSchool(schoolId) {
  const { error } = await supabase.from('schools').delete().eq('id', schoolId)
  if (error) throw new Error(error.message)
}

// structureType optionnel — utile pour créer un employeur CESU ('particulier_cesu')
// sans modifier le comportement existant pour les écoles de musique.
export async function findOrCreateSchool(teacherId, name, structureType = null) {
  const trimmed = name.trim()
  const { data: existing } = await supabase
    .from('schools')
    .select('id, name, structure_type')
    .eq('teacher_id', teacherId)
    .eq('name', trimmed)
    .maybeSingle()
  if (existing) return existing
  return createSchool(teacherId, trimmed, structureType)
}

// ─── Profil complet ───────────────────────────────────────────────────────────

const PROFILE_COLUMNS = [
  'id', 'name', 'teacher_id',
  'address', 'latitude', 'longitude', 'structure_type',
  'director_name', 'director_email', 'colleague_contacts',
  // Téléphones : nouveau champ jsonb (l'ancien director_phone est conservé en DB mais non affiché)
  'director_phones',
  // Contrat
  'contract_start_date', 'notice_period', 'contract_type', 'contract_type_detail', 'hours_stability',
  // Rémunération — payment_delay remplace payment_delay_days
  // administrative_reliability_rating : sous-facteur de calculerRemunerationReelle,
  // voir la fonction dans schools.js pour la justification de ce choix.
  'payment_delay', 'payment_duration', 'payment_smoothing', 'fixed_monthly_salary', 'administrative_reliability_rating',
  // Heures
  'current_weekly_hours', 'desired_weekly_hours',
  // Locaux
  'premises_quality_rating', 'shared_room', 'equipment_notes', 'parking_rating', 'bike_access',
  // Humain
  'work_atmosphere_rating', 'student_engagement_rating', 'team_stability_rating', 'team_stability_notes',
  // Calendaire
  'vacation_zone_override', 'access_restriction_type', 'access_restriction_detail',
  // Priorité & nouvelles notes v2
  'manual_priority_rating', 'equipment_rating', 'growth_perspective_rating',
  // Correction manuelle de fiabilité — voir calculerFiabiliteHeures ci-dessous.
  // NULL = calcul automatique ; n'est jamais écrit par l'app hors saisie utilisateur.
  'manual_reliability_override',
  'tags', 'notes',
  // Historique de collaboration.
  // contract_first_date = date du tout premier cours (peut précéder le contrat actuel),
  // conservée en base pour l'historique mais NON affichée dans SchoolDetailPage car
  // redondante avec contract_start_date côté UI — choix délibéré de simplification :
  // un professeur seul n'a pas besoin de distinguer "premier cours" et "début de contrat".
  // À ré-exposer si le produit évolue vers un multi-utilisateur avec historique complet.
  'contract_first_date', 'contract_end_date',
  // Tâche 2 : prime annuelle estimée — utilisée dans calculerRevenuMensuelEcole
  'estimated_annual_bonus',
  // Tâche 3 : jours de présence — affichage organisationnel uniquement
  'weekly_presence_days',
  'created_at',
].join(', ')

export async function fetchSchoolProfile(schoolId) {
  const { data, error } = await supabase
    .from('schools')
    .select(PROFILE_COLUMNS)
    .eq('id', schoolId)
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateSchoolProfile(schoolId, fields) {
  // Colonnes exclues du payload UPDATE :
  // - LEGACY : anciennes colonnes renommées, conservées en DB pour compatibilité
  // - READ_ONLY : clé primaire et méta-données non modifiables par l'utilisateur
  const EXCLUDED = new Set([
    'director_phone', 'payment_delay_days', 'parking_access', 'access_restrictions',
    'id', 'teacher_id', 'created_at',
  ])
  const payload = Object.fromEntries(
    Object.entries(fields).filter(([k]) => !EXCLUDED.has(k))
  )
  const { data, error } = await supabase
    .from('schools')
    .update(payload)
    .eq('id', schoolId)
    .select(PROFILE_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return data
}

// ─── Taux horaires ────────────────────────────────────────────────────────────

export async function fetchHourlyRates(schoolId) {
  const { data, error } = await supabase
    .from('schools_hourly_rates')
    .select('id, school_year, gross_hourly_rate, net_hourly_rate, net_social_hourly_rate, created_at')
    .eq('school_id', schoolId)
    .order('school_year', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function upsertHourlyRate(schoolId, teacherId, schoolYear, rates) {
  const { data, error } = await supabase
    .from('schools_hourly_rates')
    .upsert(
      { school_id: schoolId, teacher_id: teacherId, school_year: schoolYear, ...rates },
      { onConflict: 'school_id,school_year' }
    )
    .select('id, school_year, gross_hourly_rate, net_hourly_rate, net_social_hourly_rate, created_at')
    .single()
  if (error) throw new Error(error.message)
  return data
}

// ─── Profil professeur — poids de pondération du score ───────────────────────

// Colonnes "profiles" nécessaires au calcul du score (poids + domicile pour la distance).
const PROFILE_SCORE_COLUMNS = [
  'home_latitude', 'home_longitude',
  'score_weight_fiabilite', 'score_weight_remuneration', 'score_weight_distance',
  'score_weight_perspectives', 'score_weight_ambiance',
].join(', ')

// Poids par défaut (somme = 100) — voir la justification complète dans
// migration-scoring-parametrable.sql (bloc 1). Résumé : fiabilité et
// rémunération réelle légèrement favorisées (répondent le plus directement à
// l'objectif "moins d'heures, plus d'argent") ; distance reste substantielle
// (coût réel en temps) ; perspectives et ambiance à parts égales, ajustables
// par l'utilisateur si son propre contexte les rend prioritaires.
export const DEFAULT_SCORE_WEIGHTS = {
  fiabilite:    25,
  remuneration: 25,
  distance:     20,
  perspectives: 15,
  ambiance:     15,
}

/** Normalise une ligne "profiles" (snake_case, brute ou via mapProfileToUser) en poids utilisables. */
export function extractScoreWeights(profile) {
  if (!profile) return DEFAULT_SCORE_WEIGHTS
  if (profile.scoreWeights) return profile.scoreWeights // déjà normalisé (objet user de AuthContext)
  return {
    fiabilite:    profile.score_weight_fiabilite    ?? DEFAULT_SCORE_WEIGHTS.fiabilite,
    remuneration: profile.score_weight_remuneration ?? DEFAULT_SCORE_WEIGHTS.remuneration,
    distance:     profile.score_weight_distance     ?? DEFAULT_SCORE_WEIGHTS.distance,
    perspectives: profile.score_weight_perspectives ?? DEFAULT_SCORE_WEIGHTS.perspectives,
    ambiance:     profile.score_weight_ambiance     ?? DEFAULT_SCORE_WEIGHTS.ambiance,
  }
}

// ─── Vue d'ensemble ───────────────────────────────────────────────────────────

export async function fetchSchoolsOverview(teacherId) {
  const { data: schools, error } = await supabase
    .from('schools')
    .select(PROFILE_COLUMNS)
    .eq('teacher_id', teacherId)
    .order('name')
  if (error) throw new Error(error.message)
  if (!schools || schools.length === 0) return []

  const schoolIds = schools.map((s) => s.id)

  const [countsRes, ratesRes, profileRes] = await Promise.all([
    supabase.from('students').select('school_id').eq('teacher_id', teacherId).in('school_id', schoolIds),
    supabase.from('schools_hourly_rates').select('school_id, school_year, net_hourly_rate').in('school_id', schoolIds),
    supabase.from('profiles').select(PROFILE_SCORE_COLUMNS).eq('id', teacherId).maybeSingle(),
  ])

  const currentYear = currentSchoolYear()
  const countMap = {}
  const rateMap = {}
  schoolIds.forEach((id) => { countMap[id] = 0; rateMap[id] = null })
  ;(countsRes.data ?? []).forEach((r) => { if (r.school_id) countMap[r.school_id] = (countMap[r.school_id] ?? 0) + 1 })
  ;(ratesRes.data ?? []).forEach((r) => { if (r.school_year === currentYear) rateMap[r.school_id] = r.net_hourly_rate })

  const profile = profileRes.data ?? null
  const weights = extractScoreWeights(profile)

  return schools.map((s) => {
    const netHourlyRate = rateMap[s.id]
    return {
      ...s,
      studentCount: countMap[s.id] ?? 0,
      currentNetRate: netHourlyRate,
      priorityScore: computePriorityScore(s, { profile, netHourlyRate, weights }),
      // Indicateur direct, indépendant du score pondéré — voir calculerRendementHoraireNetReel.
      netHourlyYieldReal: calculerRendementHoraireNetReel(s, { netHourlyRate }),
    }
  })
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

export function currentSchoolYear() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

// Valeur exacte stockée en base pour "salaire lissé sur 12 mois" (montant fixe
// chaque mois, indépendant des heures travaillées). Source unique utilisée à
// la fois par l'UI (SchoolDetailPage) et par le calcul du rendement réel —
// évite toute divergence entre les deux si la valeur venait à changer.
export const PAYMENT_SMOOTHING_FIXED_VALUE = 'Lissé (même montant chaque mois)'
export function isSalaryFixed(paymentSmoothing) {
  return paymentSmoothing === PAYMENT_SMOOTHING_FIXED_VALUE
}

// ═══════════════════════════════════════════════════════════════════════════
// Score de priorité — 5 catégories pondérables
// ═══════════════════════════════════════════════════════════════════════════
//
// CONTEXTE : l'ancienne formule mélangeait tout dans un score unique dominé
// par le taux horaire brut, ce qui avantageait mécaniquement les CESU alors
// qu'elles sont réellement MOINS fiables financièrement (un cours CESU annulé
// n'est jamais rattrapé ni payé, contrairement à une école où l'annulation
// déclenche presque toujours un rattrapage). Les 5 fonctions ci-dessous sont
// pures, indépendantes et testables séparément ; chacune retourne une note
// 1-5 (ou null si aucune donnée ne permet de la calculer). Elles sont ensuite
// combinées par computePriorityScore() selon les poids choisis par
// l'utilisateur (Réglages > Priorisation des écoles).
//
// Note manquante = neutre (3/5) dans la moyenne pondérée finale : un champ non
// renseigné ne doit jamais avantager ni pénaliser artificiellement une école.

const SCORE_NEUTRE = 3
const FIABILITE_MIN = 1
const FIABILITE_MAX = 5

// ─── 1. Fiabilité des heures ──────────────────────────────────────────────────

// Base automatique selon le type de structure : une école/association a un
// fonctionnement institutionnel où un cours annulé déclenche TOUJOURS un
// rattrapage — les heures prévues sont donc systématiquement effectuées et
// payées, sans aucun risque de perte. Sa fiabilité automatique est donc
// maximale par défaut (FIABILITE_MAX), pas un simple "bien noté" à mi-chemin :
// seul un signal concret (heures variables, restriction d'accès, correction
// manuelle) peut ensuite la faire redescendre. Un particulier CESU, où un
// cours annulé n'est ni rattrapé ni payé, part au contraire d'une base
// nettement plus basse — c'est précisément le biais que cette refonte corrige.
const FIABILITE_BASE_PAR_STRUCTURE = { particulier_cesu: 2.5, autre: 3 }
const FIABILITE_BASE_INSTITUTION = FIABILITE_MAX // association, municipale, conservatoire, privee

/**
 * Calcul automatique de la fiabilité des heures (1-5), avant toute correction
 * manuelle. Séparée de calculerFiabiliteHeures() pour rester testable seule.
 */
function calculerFiabiliteHeuresAuto(school) {
  const base = FIABILITE_BASE_PAR_STRUCTURE[school.structure_type] ?? FIABILITE_BASE_INSTITUTION

  // hours_stability : sous-facteur de cette catégorie (voir migration-scoring-
  // parametrable.sql bloc 3 pour la justification de ce choix d'architecture).
  let ajustement = 0
  if (school.hours_stability === 'Heures garanties / bloquées') ajustement += 1
  else if (school.hours_stability === "Variable en cours d'année") ajustement -= 1
  // "Recalcul chaque rentrée de septembre" : neutre — une renégociation
  // annuelle prévisible n'est pas un signe d'instabilité en soi.

  if (school.access_restriction_type === 'vacances_uniquement') ajustement += 0.2
  else if (school.access_restriction_type === 'hors_vacances_uniquement') ajustement -= 0.2

  return Math.min(FIABILITE_MAX, Math.max(FIABILITE_MIN, base + ajustement))
}

/**
 * Fiabilité des heures (1-5). Une correction manuelle déjà saisie
 * (manual_reliability_override) remplace TOUJOURS le calcul automatique et
 * n'est jamais recalculée ni écrasée : cette fonction ne fait que la lire,
 * aucun code de l'application n'écrit dans cette colonne hors saisie
 * utilisateur explicite (voir SchoolDetailPage.jsx).
 */
export function calculerFiabiliteHeures(school) {
  if (school.manual_reliability_override != null) return school.manual_reliability_override
  return Math.round(calculerFiabiliteHeuresAuto(school) * 10) / 10
}

// ─── 2. Rémunération réelle (en net) ──────────────────────────────────────────

// Repères de rémunération nette (€/h) pour convertir un taux horaire en note
// 1-5. Fourchette usuelle observée pour un professeur de guitare indépendant
// en France, toutes structures confondues — à ajuster si le marché évolue.
const TAUX_NET_REPERE_BAS = 15   // → note 1
const TAUX_NET_REPERE_HAUT = 35  // → note 5

// Poids du sous-facteur "Sérieux administratif et paiement" (note manuelle
// 1-5, administrative_reliability_rating) dans l'ajustement du score : un
// écart de 2 points par rapport au neutre (3) déplace le score de 0,4 au
// maximum — du même ordre de grandeur que les bonus CDI/salaire fixe
// ci-dessous, sans les dominer.
const POIDS_SERIEUX_ADMINISTRATIF = 0.2
const NOTE_NEUTRE_1_A_5 = 3

/**
 * Rémunération réelle (1-5), en NET conformément à la règle d'affichage
 * financier du produit — jamais le taux brut, qui ne reflète pas ce que le
 * professeur touche réellement. netHourlyRate provient de schools_hourly_rates
 * (année en cours) et doit être transmis par l'appelant.
 */
export function calculerRemunerationReelle(school, { netHourlyRate = null } = {}) {
  if (netHourlyRate == null) return null

  const ratio = (netHourlyRate - TAUX_NET_REPERE_BAS) / (TAUX_NET_REPERE_HAUT - TAUX_NET_REPERE_BAS)
  let score = 1 + ratio * 4

  // Prévisibilité du revenu : un salaire mensuel fixe lissé garantit le même
  // montant chaque mois quel que soit le nombre d'heures réellement
  // travaillées — une sécurité que le taux horaire seul ne reflète pas.
  if (isSalaryFixed(school.payment_smoothing) && school.fixed_monthly_salary != null) score += 0.3

  // Un CDI protège mieux le revenu dans la durée (préavis, continuité) qu'un
  // CDD ou une vacation ponctuelle.
  if (school.contract_type === 'CDI') score += 0.2

  // Sérieux administratif et paiement (note manuelle) : sous-facteur de cette
  // catégorie plutôt qu'une 6e catégorie pondérable indépendante — même choix
  // d'architecture que hours_stability pour la fiabilité des heures (voir
  // migration-scoring-parametrable.sql bloc 3) : la question posée ("est-ce
  // que je touche vraiment cet argent, sans retard ni relance ?") relève de
  // la rémunération réelle, pas d'une dimension à part. Non renseignée =
  // neutre, aucun bonus ni malus (cohérent avec le traitement des autres
  // sous-scores manquants — voir SCORE_NEUTRE en tête de fichier).
  if (school.administrative_reliability_rating != null) {
    score += (school.administrative_reliability_rating - NOTE_NEUTRE_1_A_5) * POIDS_SERIEUX_ADMINISTRATIF
  }

  return Math.round(Math.min(5, Math.max(1, score)) * 10) / 10
}

// ─── 3. Distance / trajet ──────────────────────────────────────────────────────

// Mêmes seuils que l'ancienne pénalité Haversine, reformulés en note absolue
// 1-5 (catégorie à part entière) plutôt qu'en malus additif sur un score unique.
function distanceKmToScore(distKm) {
  if (distKm <= 5)  return 5
  if (distKm <= 15) return 4
  if (distKm <= 30) return 3
  if (distKm <= 50) return 2
  return 1
}

/**
 * Distance/trajet (1-5) via la formule de Haversine entre le domicile
 * (profile.home_latitude/home_longitude, ou homeLatitude/homeLongitude si
 * profile vient de mapProfileToUser) et l'école. null si l'une des deux
 * paires de coordonnées manque — catégorie alors neutre dans le score global.
 */
export function calculerDistanceScore(school, profile = null) {
  const homeLat   = profile?.home_latitude  ?? profile?.homeLatitude  ?? null
  const homeLon   = profile?.home_longitude ?? profile?.homeLongitude ?? null
  const schoolLat = school.latitude  ?? null
  const schoolLon = school.longitude ?? null
  if (!homeLat || !homeLon || !schoolLat || !schoolLon) return null

  const R = 6371
  const dLat = (schoolLat - homeLat) * Math.PI / 180
  const dLon = (schoolLon - homeLon) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(homeLat * Math.PI / 180) * Math.cos(schoolLat * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2
  const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  // Pour un particulier CESU, le trajet dessert un seul élève isolé (pas de
  // mutualisation avec d'autres cours sur place) : la distance pèse donc
  // davantage, modélisée par une distance "perçue" doublée.
  const isCesu = school.structure_type === 'particulier_cesu'
  return distanceKmToScore(isCesu ? distKm * 2 : distKm)
}

// ─── 4. Perspectives et stabilité ──────────────────────────────────────────────

/**
 * Perspectives et stabilité (1-5) : moyenne de growth_perspective_rating et
 * team_stability_rating, ajustée d'un bonus d'ancienneté de la collaboration
 * (contract_start_date) — une collaboration qui dure a déjà fait ses preuves.
 */
export function calculerPerspectivesStabilite(school) {
  const notes = [school.growth_perspective_rating, school.team_stability_rating]
    .filter((v) => v != null && v >= 1 && v <= 5)
  let score = notes.length > 0 ? notes.reduce((a, b) => a + b, 0) / notes.length : null

  if (school.contract_start_date) {
    const ansMs = Date.now() - new Date(school.contract_start_date).getTime()
    const ans = ansMs / (365.25 * 24 * 3600 * 1000)
    const bonusAnciennete = ans >= 5 ? 0.3 : ans >= 2 ? 0.15 : 0
    if (bonusAnciennete > 0) score = (score ?? SCORE_NEUTRE) + bonusAnciennete
  }

  if (score == null) return null
  return Math.round(Math.min(5, Math.max(1, score)) * 10) / 10
}

// ─── 5. Ambiance et conditions humaines ────────────────────────────────────────

/**
 * Ambiance et conditions humaines (1-5) : moyenne simple des notes étoiles
 * renseignées parmi locaux, ambiance de travail, engagement des élèves,
 * matériel et parking. Catégorie séparée à dessein (voir CONTEXTE MÉTIER) :
 * un environnement toxique doit pouvoir peser autant qu'un bon salaire, pas
 * être noyé dans une moyenne générale qui l'invisibiliserait.
 */
export function calculerAmbianceHumaine(school) {
  const notes = [
    school.premises_quality_rating,
    school.work_atmosphere_rating,
    school.student_engagement_rating,
    school.equipment_rating,
    school.parking_rating,
  ].filter((v) => v != null && v >= 1 && v <= 5)
  if (notes.length === 0) return null
  return Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 10) / 10
}

// ─── Combinaison pondérée ───────────────────────────────────────────────────

/** Détail des 5 sous-scores (pour affichage comparatif / fiche école). */
export function computeScoreBreakdown(school, options = {}) {
  const { profile = null, netHourlyRate = null } = options
  return {
    fiabilite:    calculerFiabiliteHeures(school),
    remuneration: calculerRemunerationReelle(school, { netHourlyRate }),
    distance:     calculerDistanceScore(school, profile),
    perspectives: calculerPerspectivesStabilite(school),
    ambiance:     calculerAmbianceHumaine(school),
  }
}

/**
 * Score de priorité pondéré (1-5, arrondi au dixième), ou null si aucune des
 * 5 catégories n'est calculable (école tout juste créée, rien de renseigné).
 * options.weights : { fiabilite, remuneration, distance, perspectives, ambiance }
 * — voir DEFAULT_SCORE_WEIGHTS et extractScoreWeights().
 */
export function computePriorityScore(school, options = {}) {
  const { profile = null, netHourlyRate = null, weights = DEFAULT_SCORE_WEIGHTS } = options
  const sousScores = computeScoreBreakdown(school, { profile, netHourlyRate })

  if (Object.values(sousScores).every((v) => v == null)) return null

  const poidsTotal = Object.values(weights).reduce((a, b) => a + b, 0)
  if (poidsTotal === 0) return null // les 5 curseurs à zéro : aucun classement possible

  const total = Object.keys(weights).reduce(
    (sum, cat) => sum + weights[cat] * (sousScores[cat] ?? SCORE_NEUTRE),
    0
  )
  return Math.round((total / poidsTotal) * 10) / 10
}

/** true si moins de 4 des 5 catégories reposent sur une donnée réelle (score trop incomplet pour être fiable). */
export function isScoreIncomplete(school, options = {}) {
  const sousScores = computeScoreBreakdown(school, options)
  const renseignees = Object.values(sousScores).filter((v) => v != null).length
  return renseignees < 4
}

// ─── Indicateur direct : rendement horaire net réel ─────────────────────────

// Exportée : réutilisée par SimulationPage.jsx pour la même conversion
// hebdo → mensuel, afin d'éviter une valeur magique dupliquée (4,33).
export const SEMAINES_PAR_MOIS = 52 / 12 // ≈ 4,33 — conversion standard hebdomadaire → mensuelle

// Facteur de fiabilité minimal (structure la moins fiable, note 1/5) : une
// heure statistiquement peu fiable (CESU annulée = jamais rattrapée ni payée)
// vaut moins qu'une heure garantie, mais seule la FRÉQUENCE des heures
// effectivement payées est en jeu, pas le taux affiché lui-même — une
// structure peu fiable ne paie pas moins cher quand le cours a bien lieu.
// D'où un facteur modéré [0,7 ; 1,0] plutôt que [0 ; 1].
const FACTEUR_FIABILITE_MIN = 0.7

/**
 * Taux net effectif AVANT ajustement de fiabilité : le montant mensuel fixe
 * rapporté aux heures réellement travaillées si le salaire est lissé (plus
 * représentatif qu'un taux horaire affiché quand le salaire ne varie pas avec
 * les heures du mois), sinon le taux horaire net de l'année en cours.
 * Fonction séparée pour être réutilisée par l'UI (comparaison "taux saisi" vs
 * "ajusté fiabilité", voir SchoolDetailPage/SchoolsPage) sans dupliquer ce calcul.
 */
export function calculerTauxNetEffectif(school, options = {}) {
  const { netHourlyRate = null } = options
  const heures = school.current_weekly_hours
  const tauxDepuisSalaireFixe =
    isSalaryFixed(school.payment_smoothing) && school.fixed_monthly_salary != null && heures > 0
      ? school.fixed_monthly_salary / (heures * SEMAINES_PAR_MOIS)
      : null
  const taux = tauxDepuisSalaireFixe ?? netHourlyRate
  // Arrondi systématique à 2 décimales : garantit une égalité stricte et fiable
  // avec calculerRendementHoraireNetReel (même arrondi) quand la fiabilité est
  // maximale — sans ça, le taux dérivé d'un salaire fixe (division non ronde)
  // pourrait sembler "ajusté" par un écart d'arrondi qui n'a rien à voir avec
  // la fiabilité.
  return taux != null ? Math.round(taux * 100) / 100 : null
}

/**
 * Rendement horaire net réel estimé (€/h) — indicateur simple et direct,
 * INDÉPENDANT du score pondéré, répondant à la question centrale du produit :
 * "combien je gagne vraiment de l'heure ici ?".
 *
 * La décote de fiabilité ne s'applique QUE si la fiabilité (automatique ou
 * corrigée manuellement) est réellement inférieure au maximum — une école de
 * musique standard, sans correction manuelle, a par construction une fiabilité
 * automatique maximale (voir calculerFiabiliteHeures/FIABILITE_BASE_INSTITUTION)
 * et retourne donc EXACTEMENT le taux net effectif, sans aucune décote. Seule
 * une structure réellement moins fiable (CESU par défaut, heures variables,
 * ou correction manuelle à la baisse) est décotée.
 *
 * Retourne null si aucune donnée de rémunération n'est disponible.
 */
export function calculerRendementHoraireNetReel(school, options = {}) {
  const tauxEffectif = calculerTauxNetEffectif(school, options)
  if (tauxEffectif == null) return null

  const fiabilite = calculerFiabiliteHeures(school)
  if (fiabilite >= FIABILITE_MAX) return Math.round(tauxEffectif * 100) / 100 // aucun risque identifié : pas de décote

  const facteurFiabilite = FACTEUR_FIABILITE_MIN +
    (fiabilite - FIABILITE_MIN) * ((1 - FACTEUR_FIABILITE_MIN) / (FIABILITE_MAX - FIABILITE_MIN))
  return Math.round(tauxEffectif * facteurFiabilite * 100) / 100
}
