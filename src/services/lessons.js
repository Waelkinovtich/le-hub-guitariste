import { supabase } from '../lib/supabase'
import { TABLES } from '../lib/tables'
import { fullName, formatLessonDateLabel, formatTime } from '../utils/format'

const LESSON_SELECT = `
  id, teacher_id, student_id, lesson_date, lesson_time, duration_minutes, topic, notes, status, absence_reason, cancel_reason, recurrence_group,
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

export async function fetchLessonsInRange({ teacherId, from, to }) {
  let query = supabase.from(TABLES.lessons).select(LESSON_SELECT).gte('lesson_date', from).lte('lesson_date', to).order('lesson_date').order('lesson_time')
  if (teacherId) query = query.eq('teacher_id', teacherId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const lessons = (data ?? []).map(mapLesson)
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
  const { data, error } = await supabase.from(TABLES.lessons).insert({ teacher_id: teacherId, student_id: input.studentId, lesson_date: input.lessonDate, lesson_time: input.lessonTime, duration_minutes: input.durationMinutes ?? 45, topic: input.topic, notes: input.notes ?? null, status: 'planifie' }).select(LESSON_SELECT).single()
  if (error) throw new Error(error.message)
  return mapLesson(data)
}

export async function updateLesson(lessonId, input) {
  const { data, error } = await supabase.from(TABLES.lessons).update({ student_id: input.studentId, lesson_date: input.lessonDate, lesson_time: input.lessonTime, duration_minutes: Number(input.durationMinutes), topic: input.topic, notes: input.notes ?? null }).eq('id', lessonId).select(LESSON_SELECT).single()
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

export async function fetchCancelledLessons({ teacherId } = {}) {
  const { data, error } = await supabase.from(TABLES.lessons).select(LESSON_SELECT).eq('status', 'annule_prof').eq('teacher_id', teacherId).order('lesson_date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapLesson)
}

export async function createRecurringLessons(teacherId, input, untilDate) {
  const groupId = crypto.randomUUID()
  const rows = []
  let current = new Date(input.lessonDate + 'T00:00:00')
  const end = new Date(untilDate + 'T00:00:00')
  while (current <= end) {
    const pad = (n) => String(n).padStart(2, '0')
    const iso = current.getFullYear() + '-' + pad(current.getMonth() + 1) + '-' + pad(current.getDate())
    rows.push({
      teacher_id: teacherId,
      student_id: input.studentId,
      lesson_date: iso,
      lesson_time: input.lessonTime,
      duration_minutes: input.durationMinutes ?? 45,
      topic: input.topic,
      notes: input.notes ?? null,
      status: 'planifie',
      recurrence_group: groupId,
    })
    current.setDate(current.getDate() + 7)
  }
  const { error } = await supabase.from(TABLES.lessons).insert(rows)
  if (error) throw new Error(error.message)
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
    .select('id, group_id, session_date, session_time, duration_minutes, status')
    .in('group_id', groupIds)
    .gte('session_date', from)
    .lte('session_date', to)
    .order('session_date')
  if (sErr) throw new Error(sErr.message)

  return (sessions ?? []).map(s => {
    const g = groupMap[s.group_id] || {}
    return {
      id: 'group-' + s.id,
      isGroup: true,
      groupId: s.group_id,
      sessionId: s.id,
      lessonDate: s.session_date,
      lessonTime: s.session_time,
      durationMinutes: s.duration_minutes || g.duration_minutes,
      topic: g.name,
      status: 'planifie',
      studentName: g.name,
      groupType: g.type,
      sessionStatus: s.status || 'prevue',
      schoolName: g.school_name ?? null,
      dateLabel: formatLessonDateLabel(s.session_date),
      timeLabel: formatTime(s.session_time),
    }
  })
}
