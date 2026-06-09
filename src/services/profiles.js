import { supabase } from '../lib/supabase'
import { TABLES } from '../lib/tables'
import { fullName } from '../utils/format'

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from(TABLES.profiles)
    .select('id, role, first_name, last_name, email, phone, school_zone, created_at')
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
    schoolZone: profile.school_zone ?? 'B',
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
