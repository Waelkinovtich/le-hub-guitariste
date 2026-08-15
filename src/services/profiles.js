import { supabase } from '../lib/supabase'
import { TABLES } from '../lib/tables'
import { fullName } from '../utils/format'
import { extractScoreWeights } from './schools'

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from(TABLES.profiles)
    .select('id, role, first_name, last_name, email, phone, school_zone, nav_app, assistance_mode, created_at, home_latitude, home_longitude, score_weight_fiabilite, score_weight_remuneration, score_weight_distance, score_weight_perspectives, score_weight_ambiance')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export function mapProfileToUser(profile) {
  if (!profile) return null
  const firstName = profile.first_name ?? profile.prenom ?? ''
  const lastName = profile.last_name ?? profile.nom ?? ''
  return {
    id: profile.id,
    role: profile.role,
    email: profile.email,
    firstName,
    lastName,
    name: fullName(firstName, lastName) || profile.email || 'Utilisateur',
    phone: profile.phone ?? profile.telephone,
    createdAt: profile.created_at,
    schoolZone:     profile.school_zone ?? 'B',
    navApp:         profile.nav_app ?? 'google_maps',
    assistanceMode: profile.assistance_mode ?? false,
    // Domicile et poids de pondération du score de priorité des écoles
    // (voir services/schools.js — calculerDistanceScore, DEFAULT_SCORE_WEIGHTS).
    homeLatitude:  profile.home_latitude  ?? null,
    homeLongitude: profile.home_longitude ?? null,
    scoreWeights:  extractScoreWeights(profile),
  }
}

export async function fetchStudentTeacherName(teacherId) {
  const { data, error } = await supabase
    .from(TABLES.profiles)
    .select('first_name, last_name')
    .eq('id', teacherId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return fullName(data.first_name, data.last_name)
}
