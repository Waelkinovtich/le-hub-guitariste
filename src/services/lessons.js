import { supabase } from '../lib/supabase'
import { TABLES } from '../lib/tables'
import { fullName, formatLessonDateLabel, formatTime } from '../utils/format'

const LESSON_SELECT = `
  id, teacher_id, student_id, lesson_date, lesson_time, duration_minutes, topic, notes, status, absence_reason, cancel_reason, recurrence_group, recurrence_interval_weeks, planning_status, context_type, rattrapage_de_lesson_id,
  student:${TABLES.students} (id, first_name, last_name, level, instrument, lesson_type, school_name)
`

function mapLesson(row) {
  const student = row.student
  const studentName = student ? fullName(student.first_name, student.last_name) : ''
  return {
    id: row.id,
    teacherId: row.teacher_id,
    studentId: row.student_id,
    lessonDate: row.lesson_date,
    lessonTime: row.lesson_time,
    durationMinutes: row.duration_minutes,
    topic: row.topic,
    notes: row.notes,
    status: row.status ?? 'planifie',
    absenceReason: row.absence_reason ?? null,
    cancelReason: row.cancel_reason ?? null,
    recurrenceGroup: row.recurrence_group ?? null,
    recurrenceIntervalWeeks: row.recurrence_interval_weeks ?? 1,
    planningStatus:       row.planning_status ?? 'confirme',
    contextType:          row.context_type ?? null,
    rattrapageDeLessonId: row.rattrapage_de_lesson_id ?? null,
    studentName,
    dateLabel: formatLessonDateLabel(row.lesson_date),
    timeLabel: formatTime(row.lesson_time),
    lessonType: student?.lesson_type ?? null,
    schoolName: student?.school_name ?? null,
    student,
  }
}

export async function fetchUpcomingLessons({ teacherId, studentId, limit = 20 } = {}) {
  const today = new Date().toISOString().slice(0, 10)
  let query = supabase.from(TABLES.lessons).select(LESSON_SELECT).gte('lesson_date', today).order('lesson_date').order('lesson_time')
  if (teacherId) query = query.eq('teacher_id', teacherId)
  if (studentId) query = query.eq('student_id', studentId)
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapLesson)
}

export async function fetchPastLessons({ teacherId, studentId, limit = 20 } = {}) {
  const today = new Date().toISOString().slice(0, 10)
  let query = supabase.from(TABLES.lessons).select(LESSON_SELECT).lt('lesson_date', today).order('lesson_date', { ascending: false }).order('lesson_time', { ascending: false })
  if (teacherId) query = query.eq('teacher_id', teacherId)
  if (studentId) query = query.eq('student_id', studentId)
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapLesson)
}

// LESSON_SELECT sans recurrence_interval_weeks — utilisé comme fallback si la
// colonne n'existe pas encore en DB (migration BLOC 0 non exécutée).
const LESSON_SELECT_NO_INTERVAL = LESSON_SELECT.replace(', recurrence_interval_weeks', '')

export async function fetchLessonsInRange({ teacherId, from, to }) {
  const buildQuery = (select) => {
    let q = supabase.from(TABLES.lessons).select(select).gte('lesson_date', from).lte('lesson_date', to).order('lesson_date').order('lesson_time')
    if (teacherId) q = q.eq('teacher_id', teacherId)
    return q
  }

  let { data, error } = await buildQuery(LESSON_SELECT)
  if (error?.code === '42703' && error.message.includes('recurrence_interval_weeks')) {
    // Colonne absente (BLOC 0 migration en attente) — on recharge sans elle, valeur forcée à 1
    const fallback = await buildQuery(LESSON_SELECT_NO_INTERVAL)
    data  = fallback.data
    error = fallback.error
  }
  if (error) throw new Error(error.message)
  const lessons = (data ?? []).map((row) => mapLesson({ ...row, recurrence_interval_weeks: row.recurrence_interval_weeks ?? 1 }))
  let groupSessions = []
  try {
    groupSessions = await fetchGroupSessionsInRange({ teacherId, from, to })
  } catch (e) {
    console.error('Erreur seances groupe:', e)
  }
  return [...lessons, ...groupSessions]
}

export function buildNextLessonByStudent(lessons) {
  const map = new Map()
  for (const lesson of lessons) {
    if (!map.has(lesson.studentId)) map.set(lesson.studentId, lesson)
  }
  return map
}

export function formatNextLessonLabel(lesson) {
  if (!lesson) return '--'
  return lesson.dateLabel + ' ' + lesson.timeLabel
}

export async function createLesson(teacherId, input) {
  const { data, error } = await supabase.from(TABLES.lessons).insert({ teacher_id: teacherId, student_id: input.studentId, lesson_date: input.lessonDate, lesson_time: input.lessonTime, duration_minutes: input.durationMinutes ?? 45, topic: input.topic, notes: input.notes ?? null, status: 'planifie', context_type: input.contextType ?? null }).select(LESSON_SELECT).single()
  if (error) throw new Error(error.message)
  return mapLesson(data)
}

export async function updateLesson(lessonId, input) {
  const { data, error } = await supabase.from(TABLES.lessons).update({ student_id: input.studentId, lesson_date: input.lessonDate, lesson_time: input.lessonTime, duration_minutes: Number(input.durationMinutes), topic: input.topic, notes: input.notes ?? null, context_type: input.contextType ?? null }).eq('id', lessonId).select(LESSON_SELECT).single()
  if (error) throw new Error(error.message)
  return mapLesson(data)
}

export async function deleteLesson(lessonId) {
  const { error } = await supabase.from(TABLES.lessons).delete().eq('id', lessonId)
  if (error) throw new Error(error.message)
}

export async function updateLessonStatus(lessonId, status, absenceReason, cancelReason) {
  const { error } = await supabase.from(TABLES.lessons).update({ status, absence_reason: absenceReason ?? null, cancel_reason: cancelReason ?? null }).eq('id', lessonId)
  if (error) throw new Error(error.message)
}

// Remonte les cours annulés par le prof ET ceux déjà rattrapés (pour le tableau de bord Heures à rattraper)
export async function fetchCancelledLessons({ teacherId } = {}) {
  const { data, error } = await supabase
    .from(TABLES.lessons)
    .select(LESSON_SELECT)
    .in('status', ['annule_prof', 'rattrape'])
    .eq('teacher_id', teacherId)
    .order('lesson_date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapLesson)
}

/** Crée une série de cours récurrents depuis lessonDate jusqu'à untilDate.
 *  intervalWeeks : 1 = hebdomadaire (défaut), 2 = quinzomadaire, etc. */
export async function createRecurringLessons(teacherId, input, untilDate, intervalWeeks = 1) {
  const safeInterval = Math.max(1, Math.round(intervalWeeks))
  const groupId = crypto.randomUUID()
  const rows = []
  const pad = (n) => String(n).padStart(2, '0')
  let current = new Date(input.lessonDate + 'T00:00:00')
  const end = new Date(untilDate + 'T00:00:00')
  while (current <= end) {
    const iso = current.getFullYear() + '-' + pad(current.getMonth() + 1) + '-' + pad(current.getDate())
    rows.push({
      teacher_id:                teacherId,
      student_id:                input.studentId,
      lesson_date:               iso,
      lesson_time:               input.lessonTime,
      duration_minutes:          input.durationMinutes ?? 45,
      topic:                     input.topic,
      notes:                     input.notes ?? null,
      status:                    'planifie',
      context_type:              input.contextType ?? null,
      recurrence_group:          groupId,
      recurrence_interval_weeks: safeInterval,
    })
    current.setDate(current.getDate() + 7 * safeInterval)
  }
  const { error } = await supabase.from(TABLES.lessons).insert(rows)
  if (error) throw new Error(error.message)
  return rows.length
}

/**
 * Régénère les occurrences FUTURES d'une série récurrente avec un nouvel intervalle.
 *
 * Limites techniques documentées :
 *  - Supprime toutes les occurrences futures (gte fromDate) du recurrence_group.
 *  - Recrée les occurrences de fromDate jusqu'à endDate selon le nouvel intervalle.
 *  - Les occurrences PASSÉES (< fromDate) ne sont jamais touchées.
 *  - Les modifications manuelles (durée, notes) sur des occurrences futures sont perdues.
 *
 * @param {object} p
 * @param {string} p.groupId           - UUID de la série (recurrence_group)
 * @param {string} p.fromDate          - Date ISO à partir de laquelle régénérer (incluse)
 * @param {string} p.endDate           - Date ISO de fin de génération (ex: fin d'année scolaire)
 * @param {number} p.intervalWeeks     - Nouvel intervalle en semaines (1–4)
 * @param {object} p.template          - Modèle pour les nouvelles lignes (teacherId, studentId, …)
 */
export async function updateRecurrenceInterval({ groupId, fromDate, endDate, intervalWeeks, template }) {
  const safeInterval = Math.max(1, Math.round(intervalWeeks))

  // 1. Supprime les occurrences futures de la série — jamais les passées
  const { error: delErr } = await supabase
    .from(TABLES.lessons)
    .delete()
    .eq('recurrence_group', groupId)
    .gte('lesson_date', fromDate)
  if (delErr) throw new Error(delErr.message)

  // 2. Recrée les occurrences selon le nouvel intervalle
  const pad = (n) => String(n).padStart(2, '0')
  const rows = []
  let current = new Date(fromDate + 'T00:00:00')
  const end    = new Date(endDate + 'T00:00:00')
  while (current <= end) {
    const iso = current.getFullYear() + '-' + pad(current.getMonth() + 1) + '-' + pad(current.getDate())
    rows.push({
      teacher_id:                template.teacherId,
      student_id:                template.studentId,
      lesson_date:               iso,
      lesson_time:               template.lessonTime,
      duration_minutes:          template.durationMinutes,
      topic:                     template.topic ?? 'Cours de guitare',
      notes:                     template.notes ?? null,
      status:                    'planifie',
      context_type:              template.contextType ?? null,
      recurrence_group:          groupId,
      recurrence_interval_weeks: safeInterval,
    })
    current.setDate(current.getDate() + 7 * safeInterval)
  }
  if (rows.length === 0) return 0
  const { error: insErr } = await supabase.from(TABLES.lessons).insert(rows)
  if (insErr) throw new Error(insErr.message)
  return rows.length
}

export async function deleteRecurrenceGroup(groupId, fromDate) {
  let query = supabase.from(TABLES.lessons).delete().eq('recurrence_group', groupId)
  if (fromDate) query = query.gte('lesson_date', fromDate)
  const { error } = await query
  if (error) throw new Error(error.message)
}

export async function countRecurrenceGroup(groupId, fromDate) {
  let query = supabase.from(TABLES.lessons).select('id', { count: 'exact', head: true }).eq('recurrence_group', groupId)
  if (fromDate) query = query.gte('lesson_date', fromDate)
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function fetchGroupSessionsInRange({ teacherId, from, to }) {
  const { data: groups, error: gErr } = await supabase
    .from('music_groups')
    .select('id, name, type, duration_minutes, school_name')
    .eq('teacher_id', teacherId)
  if (gErr) throw new Error(gErr.message)
  if (!groups || groups.length === 0) return []

  const groupMap = {}
  groups.forEach(g => { groupMap[g.id] = g })
  const groupIds = groups.map(g => g.id)

  const { data: sessions, error: sErr } = await supabase
    .from('group_sessions')
    .select('id, group_id, session_date, session_time, duration_minutes, status, recurrence_series_id, recurrence_interval_weeks')
    .in('group_id', groupIds)
    .gte('session_date', from)
    .lte('session_date', to)
    .order('session_date')
  if (sErr) throw new Error(sErr.message)

  return (sessions ?? []).map(s => {
    const g = groupMap[s.group_id] || {}
    return {
      id:              'group-' + s.id,
      // Champs calqués sur le shape attendu par WeekGridPlanning pour les groupes
      planningStatus:  'groupe',
      _groupId:        s.group_id,
      _groupSessionId: s.id,
      // Récurrence (BLOC 3 migration requis — NULL avant)
      recurrenceSeriesId:     s.recurrence_series_id ?? null,
      recurrenceIntervalWeeks: s.recurrence_interval_weeks ?? 1,
      isGroup:         true,
      groupId:         s.group_id,
      sessionId:       s.id,
      lessonDate:      s.session_date,
      lessonTime:      s.session_time,
      durationMinutes: s.duration_minutes || g.duration_minutes,
      topic:           g.name,
      status:          s.status || 'planifie',
      studentName:     g.name,
      groupType:       g.type,
      sessionStatus:   s.status || 'prevue',
      schoolName:      g.school_name ?? null,
      dateLabel:       formatLessonDateLabel(s.session_date),
      timeLabel:       formatTime(s.session_time),
    }
  })
}

// ─── Récurrence des séances de groupe ─────────────────────────────────────────

/** Calcule les dates ISO d'une série récurrente à partir de firstDate jusqu'à endDate. */
function buildGroupSessionDates(firstDate, endDate, intervalWeeks) {
  const safeInterval = Math.max(1, Math.round(intervalWeeks))
  const pad = (n) => String(n).padStart(2, '0')
  const dates = []
  let current = new Date(firstDate + 'T00:00:00')
  const end    = new Date(endDate   + 'T00:00:00')
  while (current <= end) {
    dates.push(current.getFullYear() + '-' + pad(current.getMonth() + 1) + '-' + pad(current.getDate()))
    current.setDate(current.getDate() + 7 * safeInterval)
  }
  return dates
}

/**
 * Crée une série récurrente de séances de groupe dans group_sessions.
 * Retourne l'id de la première séance créée (pour l'affichage immédiat).
 */
export async function createRecurringGroupSessions({ groupId, firstDate, sessionTime, durationMinutes, endDate, intervalWeeks = 1 }) {
  const seriesId = crypto.randomUUID()
  const dates    = buildGroupSessionDates(firstDate, endDate, intervalWeeks)
  if (dates.length === 0) throw new Error('Aucune date générée pour la série.')

  const rows = dates.map((d) => ({
    group_id:                  groupId,
    session_date:              d,
    session_time:              sessionTime,
    duration_minutes:          durationMinutes,
    recurrence_series_id:      seriesId,
    recurrence_interval_weeks: Math.max(1, Math.round(intervalWeeks)),
  }))

  const { data, error } = await supabase.from('group_sessions').insert(rows).select('id').limit(1)
  if (error) throw new Error(error.message)
  return { seriesId, firstSessionId: data?.[0]?.id ?? null, count: rows.length }
}

/**
 * Régénère les séances FUTURES d'une série de groupe avec un nouvel intervalle.
 * Les séances passées (< fromDate) ne sont jamais modifiées.
 */
export async function updateGroupSessionRecurrence({ seriesId, groupId, fromDate, endDate, sessionTime, durationMinutes, intervalWeeks }) {
  const safeInterval = Math.max(1, Math.round(intervalWeeks))

  const { error: delErr } = await supabase
    .from('group_sessions')
    .delete()
    .eq('recurrence_series_id', seriesId)
    .gte('session_date', fromDate)
  if (delErr) throw new Error(delErr.message)

  const dates = buildGroupSessionDates(fromDate, endDate, safeInterval)
  if (dates.length === 0) return 0
  const rows = dates.map((d) => ({
    group_id:                  groupId,
    session_date:              d,
    session_time:              sessionTime,
    duration_minutes:          durationMinutes,
    recurrence_series_id:      seriesId,
    recurrence_interval_weeks: safeInterval,
  }))
  const { error: insErr } = await supabase.from('group_sessions').insert(rows)
  if (insErr) throw new Error(insErr.message)
  return rows.length
}

// ─── Présence aux séances de groupe (group_session_attendance) ───────────────

/**
 * Retourne les lignes d'émargement pour une séance de groupe.
 * Appelé par les tuiles groupe (T5) et EmargementPage (T6).
 */
export async function fetchGroupSessionAttendance(sessionId) {
  const { data, error } = await supabase
    .from('group_session_attendance')
    .select('id, student_id, participant_id, status')
    .eq('session_id', sessionId)
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Émarger un membre (upsert) — crée ou met à jour la ligne.
 * memberKey : { student_id } OU { participant_id }.
 */
export async function upsertGroupAttendance({ teacherId, sessionId, memberKey, status }) {
  const row = { teacher_id: teacherId, session_id: sessionId, status, ...memberKey }
  const conflictCols = memberKey.student_id
    ? 'session_id, student_id'
    : 'session_id, participant_id'
  const { error } = await supabase
    .from('group_session_attendance')
    .upsert(row, { onConflict: conflictCols })
  if (error) throw new Error(error.message)
}

export async function updateLessonPlanningStatus(lessonId, planningStatus) {
  const { error } = await supabase
    .from(TABLES.lessons)
    .update({ planning_status: planningStatus })
    .eq('id', lessonId)
  if (error) throw new Error(error.message)
}
