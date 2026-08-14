import { supabase } from '../lib/supabase'

// ─── Champs de base ───────────────────────────────────────────────────────────

export async function fetchTeacherSchools(teacherId) {
  const { data, error } = await supabase
    .from('schools')
    .select('id, name, structure_type, current_weekly_hours, desired_weekly_hours, manual_priority_rating, premises_quality_rating, work_atmosphere_rating, student_engagement_rating, team_stability_rating, equipment_rating, growth_perspective_rating, contract_type, hours_stability, access_restriction_type, latitude, longitude, tags, contract_end_date')
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

export async function findOrCreateSchool(teacherId, name) {
  const trimmed = name.trim()
  const { data: existing } = await supabase
    .from('schools')
    .select('id, name')
    .eq('teacher_id', teacherId)
    .eq('name', trimmed)
    .maybeSingle()
  if (existing) return existing
  return createSchool(teacherId, trimmed)
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
  'payment_delay', 'payment_duration', 'payment_smoothing', 'fixed_monthly_salary',
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
  'tags', 'notes',
  // Historique de collaboration
  'contract_first_date', 'contract_end_date',
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

  const [countsRes, ratesRes] = await Promise.all([
    supabase.from('students').select('school_id').eq('teacher_id', teacherId).in('school_id', schoolIds),
    supabase.from('schools_hourly_rates').select('school_id, school_year, net_hourly_rate').in('school_id', schoolIds),
  ])

  const currentYear = currentSchoolYear()
  const countMap = {}
  const rateMap = {}
  schoolIds.forEach((id) => { countMap[id] = 0; rateMap[id] = null })
  ;(countsRes.data ?? []).forEach((r) => { if (r.school_id) countMap[r.school_id] = (countMap[r.school_id] ?? 0) + 1 })
  ;(ratesRes.data ?? []).forEach((r) => { if (r.school_year === currentYear) rateMap[r.school_id] = r.net_hourly_rate })

  return schools.map((s) => ({
    ...s,
    studentCount: countMap[s.id] ?? 0,
    currentNetRate: rateMap[s.id],
    priorityScore: computePriorityScore(s),
  }))
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

export function currentSchoolYear() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

/**
 * Score de priorité (sur 5, arrondi au dixième).
 *
 * BASE — moyenne des notes 1-5 renseignées parmi :
 *   premises_quality_rating, work_atmosphere_rating,
 *   student_engagement_rating, manual_priority_rating,
 *   equipment_rating, growth_perspective_rating
 *   (poids égal ; les nulls sont exclus sans pénalité)
 *
 * BONUS CONTRAT :
 *   CDI + "Heures garanties / bloquées"  → +0,50
 *   CDI + autre hours_stability          → +0,25
 *   CDI sans hours_stability             → +0,25
 *   CDD / Autre / non renseigné         →  0,00
 *
 * BONUS DISTANCE (si home_lat/lon et school lat/lon renseignés) :
 *   pénalité proportionnelle à la distance Haversine
 *   0–5 km → 0,00 | 5–15 km → -0,10 | 15–30 km → -0,20 | > 30 km → -0,30
 *
 * RESTRICTIONS D'ACCÈS :
 *   "Rattrapages uniquement pendant les vacances scolaires" → +0,10
 *   "Rattrapages uniquement en dehors des vacances"         → -0,10
 *
 * Résultat final = Math.min(5, Math.max(1, base + bonus)), ou null si aucune note renseignée.
 * Les champs non renseignés n'ont JAMAIS d'impact négatif.
 */
export function computePriorityScore(school, profile = null) {
  const ratings = [
    school.premises_quality_rating,
    school.work_atmosphere_rating,
    school.student_engagement_rating,
    school.team_stability_rating,
    school.manual_priority_rating,
    school.equipment_rating,
    school.growth_perspective_rating,
  ].filter((v) => v != null && v >= 1 && v <= 5)

  if (ratings.length === 0) return null

  const base = ratings.reduce((a, b) => a + b, 0) / ratings.length

  // ── Bonus contrat ────────────────────────────────────────────────────────
  let bonus = 0
  if (school.contract_type === 'CDI') {
    bonus = school.hours_stability === 'Heures garanties / bloquées' ? 0.5 : 0.25
  }

  // ── Pénalité distance (Haversine) ────────────────────────────────────────
  // Pour un particulier CESU le trajet concerne un seul élève isolé (sans
  // mutualisation), donc la pénalité distance est doublée.
  const homeLat  = profile?.home_latitude  ?? null
  const homeLon  = profile?.home_longitude ?? null
  const schoolLat = school.latitude  ?? null
  const schoolLon = school.longitude ?? null
  if (homeLat && homeLon && schoolLat && schoolLon) {
    const R = 6371
    const dLat = (schoolLat - homeLat) * Math.PI / 180
    const dLon = (schoolLon - homeLon) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(homeLat * Math.PI / 180) * Math.cos(schoolLat * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const isCesu = school.structure_type === 'particulier_cesu'
    const penaltyMultiplier = isCesu ? 2 : 1
    if      (distKm > 30) bonus -= 0.30 * penaltyMultiplier
    else if (distKm > 15) bonus -= 0.20 * penaltyMultiplier
    else if (distKm >  5) bonus -= 0.10 * penaltyMultiplier
    // 0-5 km → pénalité nulle
  }

  // ── Restrictions d'accès (codes courts depuis migration-cesu-refonte.sql) ──
  if (school.access_restriction_type === 'vacances_uniquement') {
    bonus += 0.10 // souplesse valorisée (rattrapages en vacances)
  } else if (school.access_restriction_type === 'hors_vacances_uniquement') {
    bonus -= 0.10 // contrainte pénalisée légèrement
  }

  return Math.round(Math.min(5, Math.max(1, base + bonus)) * 10) / 10
}

/** Retourne true si le score est incomplet (moins de 5 notes renseignées sur 7). */
export function isScoreIncomplete(school) {
  const ratings = [
    school.premises_quality_rating,
    school.work_atmosphere_rating,
    school.student_engagement_rating,
    school.team_stability_rating,
    school.manual_priority_rating,
    school.equipment_rating,
    school.growth_perspective_rating,
  ].filter((v) => v != null && v >= 1 && v <= 5)
  return ratings.length < 5
}
