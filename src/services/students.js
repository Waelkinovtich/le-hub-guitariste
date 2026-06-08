import { supabase } from '../lib/supabase'
import { TABLES } from '../lib/tables'
import { fullName } from '../utils/format'

const STUDENT_COLUMNS = 'id, teacher_id, profile_id, first_name, last_name, email, phone, level, instrument, progress, lesson_type, school_name, birth_year, notes, parent1_name, parent1_phone, parent1_email, parent2_name, parent2_phone, parent2_email, student_phone, created_at'

export function mapStudent(row) {
  if (!row) return null
  const currentYear = new Date().getFullYear()
  return {
    id: row.id,
    teacherId: row.teacher_id,
    profileId: row.profile_id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: fullName(row.first_name, row.last_name),
    email: row.email,
    phone: row.phone,
    studentPhone: row.student_phone ?? '',
    level: row.level,
    instrument: row.instrument,
    progress: row.progress ?? 0,
    lessonType: row.lesson_type ?? 'particulier',
    schoolName: row.school_name ?? '',
    birthYear: row.birth_year ?? null,
    age: row.birth_year ? currentYear - row.birth_year : null,
    notes: row.notes ?? '',
    parent1Name: row.parent1_name ?? '',
    parent1Phone: row.parent1_phone ?? '',
    parent1Email: row.parent1_email ?? '',
    parent2Name: row.parent2_name ?? '',
    parent2Phone: row.parent2_phone ?? '',
    parent2Email: row.parent2_email ?? '',
    createdAt: row.created_at,
  }
}

export async function fetchTeacherStudents(teacherId) {
  const { data, error } = await supabase.from(TABLES.students).select(STUDENT_COLUMNS).eq('teacher_id', teacherId).order('last_name')
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapStudent)
}

export async function fetchStudentByProfileId(profileId) {
  const { data, error } = await supabase.from(TABLES.students).select(STUDENT_COLUMNS).eq('profile_id', profileId).maybeSingle()
  if (error) throw new Error(error.message)
  return mapStudent(data)
}

export async function createStudent(teacherId, input) {
  const { data, error } = await supabase.from(TABLES.students).insert({ teacher_id: teacherId, first_name: input.firstName.trim(), last_name: input.lastName.trim(), email: input.email?.trim() || null, phone: input.phone?.trim() || null, student_phone: input.studentPhone?.trim() || null, level: input.level?.trim() || null, instrument: input.instrument?.trim() || null, progress: input.progress ?? 0, lesson_type: input.lessonType ?? 'particulier', school_name: input.schoolName?.trim() || null, birth_year: input.birthYear ? Number(input.birthYear) : null, notes: input.notes?.trim() || null, parent1_name: input.parent1Name?.trim() || null, parent1_phone: input.parent1Phone?.trim() || null, parent1_email: input.parent1Email?.trim() || null, parent2_name: input.parent2Name?.trim() || null, parent2_phone: input.parent2Phone?.trim() || null, parent2_email: input.parent2Email?.trim() || null }).select(STUDENT_COLUMNS).single()
  if (error) throw new Error(error.message)
  return mapStudent(data)
}

export async function updateStudent(studentId, input) {
  const { data, error } = await supabase.from(TABLES.students).update({ first_name: input.firstName.trim(), last_name: input.lastName.trim(), email: input.email?.trim() || null, phone: input.phone?.trim() || null, student_phone: input.studentPhone?.trim() || null, level: input.level?.trim() || null, instrument: input.instrument?.trim() || null, progress: input.progress ?? 0, lesson_type: input.lessonType ?? 'particulier', school_name: input.schoolName?.trim() || null, birth_year: input.birthYear ? Number(input.birthYear) : null, notes: input.notes?.trim() || null, parent1_name: input.parent1Name?.trim() || null, parent1_phone: input.parent1Phone?.trim() || null, parent1_email: input.parent1Email?.trim() || null, parent2_name: input.parent2Name?.trim() || null, parent2_phone: input.parent2Phone?.trim() || null, parent2_email: input.parent2Email?.trim() || null }).eq('id', studentId).select(STUDENT_COLUMNS).single()
  if (error) throw new Error(error.message)
  return mapStudent(data)
}

export async function deleteStudent(studentId) {
  const { error } = await supabase.from(TABLES.students).delete().eq('id', studentId)
  if (error) throw new Error(error.message)
}

export async function fetchSchoolNames(teacherId) {
  const { data, error } = await supabase.from(TABLES.students).select('school_name').eq('teacher_id', teacherId).eq('lesson_type', 'ecole').not('school_name', 'is', null)
  if (error) throw new Error(error.message)
  const names = (data ?? []).map((r) => r.school_name).filter(Boolean)
  return [...new Set(names)]
}
