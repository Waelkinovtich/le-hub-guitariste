import { supabase } from '../lib/supabase'
import { TABLES } from '../lib/tables'
import { fullName } from '../utils/format'

const STUDENT_COLUMNS = 'id, teacher_id, profile_id, first_name, last_name, email, phone, level, instrument, progress, lesson_type, school_name, school_id, birth_year, notes, parent1_name, parent1_phone, parent1_email, parent2_name, parent2_phone, parent2_email, student_phone, created_at'

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
    schoolId: row.school_id ?? null,
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
  const { data, error } = await supabase.from(TABLES.students).insert({ teacher_id: teacherId, first_name: input.firstName.trim(), last_name: input.lastName.trim(), email: input.email?.trim() || null, phone: input.phone?.trim() || null, student_phone: input.studentPhone?.trim() || null, level: input.level?.trim() || null, instrument: input.instrument?.trim() || null, progress: input.progress ?? 0, lesson_type: input.lessonType ?? 'particulier', school_name: input.schoolName?.trim() || null, school_id: input.schoolId ?? null, birth_year: input.birthYear ? Number(input.birthYear) : null, notes: input.notes?.trim() || null, parent1_name: input.parent1Name?.trim() || null, parent1_phone: input.parent1Phone?.trim() || null, parent1_email: input.parent1Email?.trim() || null, parent2_name: input.parent2Name?.trim() || null, parent2_phone: input.parent2Phone?.trim() || null, parent2_email: input.parent2Email?.trim() || null }).select(STUDENT_COLUMNS).single()
  if (error) throw new Error(error.message)
  return mapStudent(data)
}

export async function updateStudent(studentId, input) {
  const { data, error } = await supabase.from(TABLES.students).update({ first_name: input.firstName.trim(), last_name: input.lastName.trim(), email: input.email?.trim() || null, phone: input.phone?.trim() || null, student_phone: input.studentPhone?.trim() || null, level: input.level?.trim() || null, instrument: input.instrument?.trim() || null, progress: input.progress ?? 0, lesson_type: input.lessonType ?? 'particulier', school_name: input.schoolName?.trim() || null, school_id: input.schoolId ?? null, birth_year: input.birthYear ? Number(input.birthYear) : null, notes: input.notes?.trim() || null, parent1_name: input.parent1Name?.trim() || null, parent1_phone: input.parent1Phone?.trim() || null, parent1_email: input.parent1Email?.trim() || null, parent2_name: input.parent2Name?.trim() || null, parent2_phone: input.parent2Phone?.trim() || null, parent2_email: input.parent2Email?.trim() || null }).eq('id', studentId).select(STUDENT_COLUMNS).single()
  if (error) throw new Error(error.message)
  return mapStudent(data)
}

export async function deleteStudent(studentId) {
  const { error } = await supabase.from(TABLES.students).delete().eq('id', studentId)
  if (error) throw new Error(error.message)
}

// ─── Contextes de cours par élève ────────────────────────────────────────────

/**
 * Récupère les contextes de cours d'un élève (école, CESU, taux horaires associés).
 * Retourne un tableau vide si aucun contexte n'est enregistré.
 */
export async function fetchStudentContexts(studentId) {
  const { data, error } = await supabase
    .from('student_contexts')
    .select('id, context_type, school_id, school_name, hourly_rate, payer_student_id, created_at')
    .eq('student_id', studentId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Récupère tous les contextes de cours pour l'ensemble des élèves d'un professeur,
 * indexés par student_id.
 * Utilisé dans la liste élèves pour affiner le filtrage par type de cours.
 */
export async function fetchAllContextsByStudent(teacherId) {
  const { data, error } = await supabase
    .from('student_contexts')
    .select('id, student_id, context_type, school_id, school_name, hourly_rate')
    .eq('teacher_id', teacherId)
  if (error) throw new Error(error.message)
  const map = {}
  ;(data ?? []).forEach((c) => {
    if (!map[c.student_id]) map[c.student_id] = []
    map[c.student_id].push(c)
  })
  return map
}

/** Ajoute un contexte de cours à un élève. */
export async function addStudentContext(teacherId, studentId, { contextType, schoolId, schoolName, hourlyRate, payerStudentId }) {
  const { data, error } = await supabase
    .from('student_contexts')
    .insert({
      teacher_id:       teacherId,
      student_id:       studentId,
      context_type:     contextType,
      school_id:        schoolId ?? null,
      school_name:      schoolName ?? null,
      hourly_rate:      hourlyRate !== '' && hourlyRate != null ? Number(hourlyRate) : null,
      payer_student_id: payerStudentId ?? null,
    })
    .select('id, context_type, school_id, school_name, hourly_rate, payer_student_id, created_at')
    .single()
  if (error) throw new Error(error.message)
  return data
}

/** Supprime un contexte de cours. */
export async function deleteStudentContext(contextId) {
  const { error } = await supabase.from('student_contexts').delete().eq('id', contextId)
  if (error) throw new Error(error.message)
}

/**
 * Synchronise les lignes student_contexts après enregistrement du formulaire élève.
 * Crée les nouveaux contextes, supprime les contextes désactivés, met à jour si les données ont changé.
 *
 * Choix de conception : si une case est décochée, le contexte est supprimé immédiatement
 * (pas de désactivation logique). L'opération n'est pas atomique — une erreur partielle
 * laisse les données en état cohérent (l'utilisateur peut ré-enregistrer).
 *
 * @param {string}      teacherId
 * @param {string}      studentId
 * @param {object|null} ecoleConfig - null = désactivé ; sinon { schoolId, schoolName, hourlyRate }
 * @param {object|null} cesuConfig  - null = désactivé ; sinon { payMode, schoolId, schoolName, payerStudentId, hourlyRate }
 * @param {Array}       existingContexts - résultat de fetchStudentContexts (peut être [])
 */
export async function syncStudentContexts(teacherId, studentId, ecoleConfig, cesuConfig, existingContexts) {
  const toNumber = (v) => (v !== '' && v != null) ? Number(v) : null

  const existingEcole = existingContexts.find((c) => c.context_type === 'ecole')
  const existingCesu  = existingContexts.find((c) => c.context_type === 'cesu')

  // ── Contexte École ─────────────────────────────────────────────────────
  if (ecoleConfig) {
    const newRate = toNumber(ecoleConfig.hourlyRate)
    const changed = !existingEcole
      || existingEcole.school_id    !== (ecoleConfig.schoolId ?? null)
      || existingEcole.hourly_rate  !== newRate
    if (existingEcole && changed) await deleteStudentContext(existingEcole.id)
    if (!existingEcole || changed) {
      await addStudentContext(teacherId, studentId, {
        contextType: 'ecole', schoolId: ecoleConfig.schoolId ?? null,
        schoolName: ecoleConfig.schoolName ?? null, hourlyRate: ecoleConfig.hourlyRate, payerStudentId: null,
      })
    }
  } else if (existingEcole) {
    await deleteStudentContext(existingEcole.id)
  }

  // ── Contexte CESU ──────────────────────────────────────────────────────
  if (cesuConfig) {
    const newSchoolId = cesuConfig.payMode === 'employeur'   ? (cesuConfig.schoolId       ?? null) : null
    const newPayerId  = cesuConfig.payMode === 'autre_eleve' ? (cesuConfig.payerStudentId ?? null) : null
    const newRate     = toNumber(cesuConfig.hourlyRate)
    const changed = !existingCesu
      || existingCesu.school_id        !== newSchoolId
      || existingCesu.payer_student_id !== newPayerId
      || existingCesu.hourly_rate      !== newRate
    if (existingCesu && changed) await deleteStudentContext(existingCesu.id)
    if (!existingCesu || changed) {
      await addStudentContext(teacherId, studentId, {
        contextType: 'cesu', schoolId: newSchoolId,
        schoolName:     cesuConfig.payMode === 'employeur' ? (cesuConfig.schoolName ?? null) : null,
        hourlyRate:     cesuConfig.hourlyRate,
        payerStudentId: newPayerId,
      })
    }
  } else if (existingCesu) {
    await deleteStudentContext(existingCesu.id)
  }
}

export async function fetchSchoolNames(teacherId) {
  // Exclure les employeurs CESU (particulier_cesu) — ce ne sont pas des écoles de musique
  const { data: schoolsData } = await supabase
    .from('schools')
    .select('name, structure_type')
    .eq('teacher_id', teacherId)
    .or('structure_type.is.null,structure_type.neq.particulier_cesu')
    .order('name')
  if (schoolsData && schoolsData.length > 0) return schoolsData.map((r) => r.name)
  const { data, error } = await supabase.from(TABLES.students).select('school_name').eq('teacher_id', teacherId).eq('lesson_type', 'ecole').not('school_name', 'is', null)
  if (error) throw new Error(error.message)
  const names = (data ?? []).map((r) => r.school_name).filter(Boolean)
  return [...new Set(names)]
}

/**
 * Retourne les élèves rattachés à une école via student_contexts (context_type = 'ecole').
 * Même pattern que fetchStudentsPaidBySchool, mais pour les contextes d'école de musique.
 */
export async function fetchStudentsAttachedToSchool(schoolId, teacherId) {
  const { data, error } = await supabase
    .from('student_contexts')
    .select('student_id, student:students!student_id(id, first_name, last_name)')
    .eq('school_id', schoolId)
    .eq('teacher_id', teacherId)
    .eq('context_type', 'ecole')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    studentId: row.student_id,
    id: row.student?.id ?? row.student_id,
    firstName: row.student?.first_name ?? '',
    lastName: row.student?.last_name ?? '',
    name: [row.student?.first_name, row.student?.last_name].filter(Boolean).join(' '),
  }))
}

/**
 * Retourne les élèves dont les cours CESU sont payés par un employeur donné
 * (student_contexts.school_id = schoolId et context_type = 'cesu').
 */
export async function fetchStudentsPaidBySchool(schoolId, teacherId) {
  const { data, error } = await supabase
    .from('student_contexts')
    .select('student_id, student:students!student_id(id, first_name, last_name)')
    .eq('school_id', schoolId)
    .eq('teacher_id', teacherId)
    .eq('context_type', 'cesu')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    studentId: row.student_id,
    id: row.student?.id ?? row.student_id,
    firstName: row.student?.first_name ?? '',
    lastName: row.student?.last_name ?? '',
    name: [row.student?.first_name, row.student?.last_name].filter(Boolean).join(' '),
  }))
}

/**
 * Retourne les élèves dont les cours CESU sont payés par un élève donné
 * (student_contexts.payer_student_id = payerStudentId).
 */
export async function fetchStudentsPaidByStudent(payerStudentId, teacherId) {
  const { data, error } = await supabase
    .from('student_contexts')
    .select('student_id, student:students!student_id(id, first_name, last_name)')
    .eq('payer_student_id', payerStudentId)
    .eq('teacher_id', teacherId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    studentId: row.student_id,
    id: row.student?.id ?? row.student_id,
    firstName: row.student?.first_name ?? '',
    lastName: row.student?.last_name ?? '',
    name: [row.student?.first_name, row.student?.last_name].filter(Boolean).join(' '),
  }))
}
