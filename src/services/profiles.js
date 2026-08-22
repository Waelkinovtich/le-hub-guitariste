import { supabase } from '../lib/supabase'
import { TABLES } from '../lib/tables'
import { fullName } from '../utils/format'
import { extractScoreWeights } from './schools'

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from(TABLES.profiles)
    .select('id, role, first_name, last_name, email, phone, home_address, whatsapp_link, messenger_link, discord_link, cloud_share_link, school_zone, nav_app, assistance_mode, created_at, home_latitude, home_longitude, score_weight_fiabilite, score_weight_remuneration, score_weight_distance, score_weight_perspectives, score_weight_ambiance, poids_regroupement_ecole, poids_adjacence, poids_alternance_debutants, poids_distance, poids_vacances, poids_regroupement_age, ecart_age_proche')
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
    phone:           profile.phone ?? profile.telephone,
    address:         profile.home_address    ?? null,
    whatsappLink:    profile.whatsapp_link   ?? null,
    messengerLink:   profile.messenger_link  ?? null,
    discordLink:     profile.discord_link    ?? null,
    cloudShareLink:  profile.cloud_share_link ?? null,
    createdAt: profile.created_at,
    schoolZone:     profile.school_zone ?? 'B',
    navApp:         profile.nav_app ?? 'google_maps',
    assistanceMode: profile.assistance_mode ?? false,
    // Domicile et poids de pondération du score de priorité des écoles
    // (voir services/schools.js — calculerDistanceScore, DEFAULT_SCORE_WEIGHTS).
    homeLatitude:  profile.home_latitude  ?? null,
    homeLongitude: profile.home_longitude ?? null,
    scoreWeights:  extractScoreWeights(profile),
    // Poids de pondération des facteurs du Planning intelligent (0–100).
    // null si la colonne n'existe pas encore en base (avant migration) → interprété comme 100 dans scoringCreneaux.js.
    scoringWeights: {
      poids_regroupement_ecole:  profile.poids_regroupement_ecole  ?? null,
      poids_adjacence:            profile.poids_adjacence            ?? null,
      poids_alternance_debutants: profile.poids_alternance_debutants ?? null,
      poids_distance:             profile.poids_distance             ?? null,
      poids_vacances:             profile.poids_vacances             ?? null,
      poids_regroupement_age:     profile.poids_regroupement_age     ?? 0,
      ecart_age_proche:           profile.ecart_age_proche           ?? 4,
    },
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
