import { supabase } from '../lib/supabase'
import { TABLES } from '../lib/tables'
import { fullName } from '../utils/format'

const STUDENT_COLUMNS =
  'id, teacher_id, profile_id, first_name, last_name, email, phone, level, instrument, progress, created_at'

export function mapStudent(row) {
  if (!row) return null
  return {
    id: row.id,
    teacherId: row.teacher_id,
    profileId: row.profile_id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: fullName(row.first_name, row.last_name),
    email: row.email,
    phone: row.phone,
    level: row.level,
    instrument: row.instrument,
    progress: row.progress ?? 0,
    createdAt: row.created_at,
  }
}

export async function fetchTeacherStudents(teacherId) {
  const { data, error } = await supabase
    .from(TABLES.students)
    .select(STUDENT_COLUMNS)
    .eq('teacher_id', teacherId)
    .order('last_name')

  if (error) throw new Error(error.message)
  return (data ?? []).map(mapStudent)
}

export async function fetchStudentByProfileId(profileId) {
  const { data, error } = await supabase
    .from(TABLES.students)
    .select(STUDENT_COLUMNS)
    .eq('profile_id', profileId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return mapStudent(data)
}

export async function createStudent(teacherId, input) {
  const { data, error } = await supabase
    .from(TABLES.students)
    .insert({
      teacher_id: teacherId,
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      level: input.level?.trim() || null,
      instrument: input.instrument?.trim() || null,
      progress: input.progress ?? 0,
    })
    .select(STUDENT_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return mapStudent(data)
}

export async function updateStudent(studentId, input) {
  const { data, error } = await supabase
    .from(TABLES.students)
    .update({
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      level: input.level?.trim() || null,
      instrument: input.instrument?.trim() || null,
      progress: input.progress ?? 0,
    })
    .eq('id', studentId)
    .select(STUDENT_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return mapStudent(data)
}

export async function deleteStudent(studentId) {
  const { error } = await supabase
    .from(TABLES.students)
    .delete()
    .eq('id', studentId)

  if (error) throw new Error(error.message)
}
