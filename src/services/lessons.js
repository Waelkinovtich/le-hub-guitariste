import { supabase } from '../lib/supabase'
import { TABLES } from '../lib/tables'
import { fullName, formatLessonDateLabel, formatTime } from '../utils/format'

const LESSON_SELECT = `
  id,
  teacher_id,
  student_id,
  lesson_date,
  lesson_time,
  duration_minutes,
  topic,
  notes,
  student:${TABLES.students} (
    id,
    first_name,
    last_name,
    level,
    instrument
  )
`

function mapLesson(row) {
  const student = row.student
  const studentName = student
    ? fullName(student.first_name, student.last_name)
    : ''

  return {
    id: row.id,
    teacherId: row.teacher_id,
    studentId: row.student_id,
    lessonDate: row.lesson_date,
    lessonTime: row.lesson_time,
    durationMinutes: row.duration_minutes,
    topic: row.topic,
    notes: row.notes,
    studentName,
    dateLabel: formatLessonDateLabel(row.lesson_date),
    timeLabel: formatTime(row.lesson_time),
    student,
  }
}

export async function fetchUpcomingLessons({ teacherId, studentId, limit = 20 } = {}) {
  const today = new Date().toISOString().slice(0, 10)
  let query = supabase
    .from(TABLES.lessons)
    .select(LESSON_SELECT)
    .gte('lesson_date', today)
    .order('lesson_date')
    .order('lesson_time')

  if (teacherId) query = query.eq('teacher_id', teacherId)
  if (studentId) query = query.eq('student_id', studentId)
  if (limit) query = query.limit(limit)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapLesson)
}

export async function fetchPastLessons({ teacherId, studentId, limit = 20 } = {}) {
  const today = new Date().toISOString().slice(0, 10)
  let query = supabase
    .from(TABLES.lessons)
    .select(LESSON_SELECT)
    .lt('lesson_date', today)
    .order('lesson_date', { ascending: false })
    .order('lesson_time', { ascending: false })

  if (teacherId) query = query.eq('teacher_id', teacherId)
  if (studentId) query = query.eq('student_id', studentId)
  if (limit) query = query.limit(limit)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapLesson)
}

export async function fetchLessonsInRange({ teacherId, from, to }) {
  let query = supabase
    .from(TABLES.lessons)
    .select(LESSON_SELECT)
    .gte('lesson_date', from)
    .lte('lesson_date', to)
    .order('lesson_date')
    .order('lesson_time')

  if (teacherId) query = query.eq('teacher_id', teacherId)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapLesson)
}

/** Prochain cours par élève (une requête groupée côté client) */
export function buildNextLessonByStudent(lessons) {
  const map = new Map()
  for (const lesson of lessons) {
    if (!map.has(lesson.studentId)) {
      map.set(lesson.studentId, lesson)
    }
  }
  return map
}

export function formatNextLessonLabel(lesson) {
  if (!lesson) return '—'
  return `${lesson.dateLabel} ${lesson.timeLabel}`
}

export async function createLesson(teacherId, input) {
  const { data, error } = await supabase
    .from(TABLES.lessons)
    .insert({
      teacher_id: teacherId,
      student_id: input.studentId,
      lesson_date: input.lessonDate,
      lesson_time: input.lessonTime,
      duration_minutes: input.durationMinutes ?? 45,
      topic: input.topic,
      notes: input.notes ?? null,
    })
    .select(LESSON_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return mapLesson(data)
}
