import { supabase } from '../lib/supabase'
import { TABLES } from '../lib/tables'
import { fullName, formatLessonDateLabel, formatTime } from '../utils/format'
import { isVacances } from '../utils/vacances'

// Retourne true si la date ISO tombe en vacances scolaires (zone requise, non null).
// Utilisé pour sauter les dates de vacances lors de la génération des séries récurrentes.
const enVacances = (iso, zone) => zone != null && isVacances(iso, zone) != null

const LESSON_SELECT = `
  id, teacher_id, student_id, lesson_date, lesson_time, duration_minutes, topic, notes, status, absence_reason, cancel_reason, recurrence_group, recurrence_interval_weeks, planning_status, context_type, rattrapage_de_lesson_id, students_notified, suspend_during_holidays,
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
    studentsNotified:       row.students_notified ?? false,
    suspendDuringHolidays:  row.suspend_during_holidays ?? false,
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

/**
 * Annule une séance de groupe « par le professeur ».
 * group_sessions.status → 'annulee', cancel_reason → 'annule_prof'.
 * Pour les groupes école (groupType !== 'ensemble') : crée une entrée lessons annule_prof
 * par membre ayant un student_id, afin qu'ils apparaissent dans la page Rattrapage.
 * Pour les ensembles : annule uniquement la séance, sans rattrapage individuel.
 * Tolère l'absence de la colonne cancel_reason (code 42703).
 */
export async function cancelGroupSession({ sessionId, groupType, members, teacherId, lessonDate, lessonTime, durationMinutes, schoolName }) {
  // 1. Marquer la séance annulée
  let upd = supabase.from('group_sessions').update({ status: 'annulee' }).eq('id', sessionId)
  const { error: e1 } = await upd
  if (e1 && e1.code !== '42703') throw new Error(e1.message)

  // Tenter d'ajouter cancel_reason (tolère si colonne absente)
  try {
    await supabase.from('group_sessions').update({ cancel_reason: 'annule_prof' }).eq('id', sessionId)
  } catch { /* colonne absente — migration non encore exécutée */ }

  // 2. Pour les groupes école seulement : créer des cours annule_prof par élève membre
  const isEnsemble = (groupType ?? '').toLowerCase().includes('ensemble')
  if (!isEnsemble && members?.length) {
    const inserts = members
      .filter(m => m.student_id)
      .map(m => ({
        teacher_id:       teacherId,
        student_id:       m.student_id,
        lesson_date:      lessonDate,
        lesson_time:      lessonTime,
        duration_minutes: durationMinutes ?? 60,
        status:           'annule_prof',
        context_type:     'ecole',
        cancel_reason:    null,
        school_name:      schoolName ?? null,
      }))
    if (inserts.length > 0) {
      const { error: e2 } = await supabase.from(TABLES.lessons).insert(inserts)
      if (e2) throw new Error(e2.message)
    }
  }
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

/**
 * Compte les cours à rattraper (annule_prof non encore rattrapés), avec les mêmes
 * filtres que RattrapagePage : exclusion CESU, rattrapage_abandonne, rattrapage_annule.
 * Utilisé par le badge Sidebar ET la page Rattrapage pour garantir la cohérence.
 */
export async function countRattrapageLessons(teacherId) {
  const { data, error } = await supabase
    .from(TABLES.lessons)
    .select('id, context_type, cancel_reason, student:' + TABLES.students + '(lesson_type)')
    .eq('teacher_id', teacherId)
    .eq('status', 'annule_prof')
  if (error) return 0
  const rows = data ?? []
  return rows.filter((r) => {
    if (r.context_type === 'cesu') return false
    if (r.student?.lesson_type === 'cesu') return false
    if (r.cancel_reason === 'rattrapage_annule') return false
    if (r.cancel_reason === 'rattrapage_abandonne') return false
    if (r.cancel_reason === 'vacances') return false
    return true
  }).length
}

/** Crée une série de cours récurrents depuis lessonDate jusqu'à untilDate.
 *  intervalWeeks : 1 = hebdomadaire (défaut), 2 = quinzomadaire, etc. */
export async function createRecurringLessons(teacherId, input, untilDate, intervalWeeks = 1, { suspendDuringHolidays = false, zone = null } = {}) {
  const safeInterval = Math.max(1, Math.round(intervalWeeks))
  const groupId = crypto.randomUUID()
  const rows = []
  const pad = (n) => String(n).padStart(2, '0')
  let current = new Date(input.lessonDate + 'T00:00:00')
  const end = new Date(untilDate + 'T00:00:00')
  while (current <= end) {
    const iso = current.getFullYear() + '-' + pad(current.getMonth() + 1) + '-' + pad(current.getDate())
    if (!(suspendDuringHolidays && enVacances(iso, zone))) {
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
        suspend_during_holidays:   suspendDuringHolidays,
      })
    }
    current.setDate(current.getDate() + 7 * safeInterval)
  }
  if (rows.length === 0) throw new Error('Aucune date générée (vérifiez les dates et les vacances).')
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
    .select('id, group_id, session_date, session_time, duration_minutes, status, cancel_reason, recurrence_series_id, recurrence_interval_weeks, suspend_during_holidays')
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
      cancelReason:           s.cancel_reason ?? null,
      suspendDuringHolidays:  s.suspend_during_holidays ?? false,
      studentName:            g.name,
      groupType:       g.type,
      sessionStatus:   s.status || 'prevue',
      schoolName:      g.school_name ?? null,
      dateLabel:       formatLessonDateLabel(s.session_date),
      timeLabel:       formatTime(s.session_time),
    }
  })
}

// ─── Récurrence des séances de groupe ─────────────────────────────────────────

/** Calcule les dates ISO d'une série récurrente à partir de firstDate jusqu'à endDate.
 *  suspendDuringHolidays=true + zone non-null → saute les dates en vacances scolaires. */
function buildGroupSessionDates(firstDate, endDate, intervalWeeks, { suspendDuringHolidays = false, zone = null } = {}) {
  const safeInterval = Math.max(1, Math.round(intervalWeeks))
  const pad = (n) => String(n).padStart(2, '0')
  const dates = []
  let current = new Date(firstDate + 'T00:00:00')
  const end    = new Date(endDate   + 'T00:00:00')
  while (current <= end) {
    const iso = current.getFullYear() + '-' + pad(current.getMonth() + 1) + '-' + pad(current.getDate())
    if (!(suspendDuringHolidays && enVacances(iso, zone))) dates.push(iso)
    current.setDate(current.getDate() + 7 * safeInterval)
  }
  return dates
}

/**
 * Crée une série récurrente de séances de groupe dans group_sessions.
 * Retourne l'id de la première séance créée (pour l'affichage immédiat).
 */
export async function createRecurringGroupSessions({ groupId, firstDate, sessionTime, durationMinutes, endDate, intervalWeeks = 1, suspendDuringHolidays = false, zone = null }) {
  const seriesId = crypto.randomUUID()
  const dates    = buildGroupSessionDates(firstDate, endDate, intervalWeeks, { suspendDuringHolidays, zone })
  if (dates.length === 0) throw new Error('Aucune date générée pour la série.')

  // Déduplication : ne jamais insérer sur une date déjà prise pour ce groupe
  const { data: existing } = await supabase
    .from('group_sessions').select('session_date').eq('group_id', groupId).in('session_date', dates)
  const existingDates = new Set((existing ?? []).map(r => r.session_date))
  const filteredDates = dates.filter(d => !existingDates.has(d))
  if (filteredDates.length === 0) throw new Error('Aucune date disponible — toutes les occurrences existent déjà.')

  const rows = filteredDates.map((d) => ({
    group_id:                  groupId,
    session_date:              d,
    session_time:              sessionTime,
    duration_minutes:          durationMinutes,
    recurrence_series_id:      seriesId,
    recurrence_interval_weeks: Math.max(1, Math.round(intervalWeeks)),
    suspend_during_holidays:   suspendDuringHolidays,
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

// ─── Récurrence étendue : info + mise à jour avec dates rétroactives ─────────

/**
 * Retourne la plage de dates d'une série de cours individuels.
 * Inclut les leçons de tout statut (planifie ET émargés) pour afficher l'état réel.
 */
export async function fetchSeriesDateRange(groupId) {
  const { data, error } = await supabase
    .from(TABLES.lessons)
    .select('lesson_date, recurrence_interval_weeks, status')
    .eq('recurrence_group', groupId)
    .order('lesson_date')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) return null
  return {
    firstDate:     data[0].lesson_date,
    lastDate:      data[data.length - 1].lesson_date,
    intervalWeeks: data[0].recurrence_interval_weeks ?? 1,
  }
}

/**
 * Retourne la plage de dates d'une série de séances de groupe.
 */
export async function fetchGroupSeriesDateRange(seriesId) {
  const { data, error } = await supabase
    .from('group_sessions')
    .select('session_date, recurrence_interval_weeks')
    .eq('recurrence_series_id', seriesId)
    .order('session_date')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) return null
  return {
    firstDate:     data[0].session_date,
    lastDate:      data[data.length - 1].session_date,
    intervalWeeks: data[0].recurrence_interval_weeks ?? 1,
  }
}

/**
 * Mise à jour complète d'une série individuelle : plage + intervalle.
 * Supprime uniquement les leçons au statut 'planifie', préserve tous les émargés.
 * Autorise un newStartDate dans le passé (séances rétroactives).
 */
export async function updateRecurrenceRange({ groupId, newStartDate, newEndDate, intervalWeeks, template, suspendDuringHolidays = false, zone = null }) {
  const safeInterval = Math.max(1, Math.round(intervalWeeks))

  // 1. Fetch toutes les occurrences de la série (émargées ET planifiées)
  const { data: allExisting, error: fetchErr } = await supabase
    .from(TABLES.lessons)
    .select('id, lesson_date, lesson_time, duration_minutes, status')
    .eq('recurrence_group', groupId)
  if (fetchErr) throw new Error(fetchErr.message)

  // Dates émargées (ne jamais toucher)
  const emargéDates = new Set(
    (allExisting ?? []).filter((r) => r.status !== 'planifie').map((r) => r.lesson_date)
  )

  // 2. Calculer le planning cible
  const pad = (n) => String(n).padStart(2, '0')
  const targetDates = new Set()
  let cur = new Date(newStartDate + 'T00:00:00')
  const end = new Date(newEndDate + 'T00:00:00')
  while (cur <= end) {
    const iso = cur.getFullYear() + '-' + pad(cur.getMonth() + 1) + '-' + pad(cur.getDate())
    if (!emargéDates.has(iso) && !(suspendDuringHolidays && enVacances(iso, zone))) {
      targetDates.add(iso)
    }
    cur.setDate(cur.getDate() + 7 * safeInterval)
  }

  // 3. Parmi les planifié, séparer "standard" (inchangés) et "modifiés manuellement"
  //    Un planifié est "modifié" si son heure ou sa durée diffèrent du template,
  //    ou si sa date n'est PAS dans le planning cible (cours déplacé manuellement).
  const planifiéLessons = (allExisting ?? []).filter((r) => r.status === 'planifie')
  const manuallyModified = planifiéLessons.filter((r) =>
    r.lesson_time !== template.lessonTime ||
    r.duration_minutes !== template.durationMinutes ||
    !targetDates.has(r.lesson_date)
  )
  const manualDates = new Set(manuallyModified.map((r) => r.lesson_date))
  const standardIds  = planifiéLessons
    .filter((r) => !manualDates.has(r.lesson_date))
    .map((r) => r.id)

  // 4. Supprimer seulement les occurrences standard (pas les modifiées)
  if (standardIds.length > 0) {
    const { error: delErr } = await supabase
      .from(TABLES.lessons)
      .delete()
      .in('id', standardIds)
    if (delErr) throw new Error(delErr.message)
  }

  // 5. Insérer les nouvelles occurrences, en sautant les dates déjà couvertes
  const occupiedDates = new Set([...emargéDates, ...manualDates])
  const rows = []
  for (const iso of targetDates) {
    if (!occupiedDates.has(iso)) {
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
        suspend_during_holidays:   suspendDuringHolidays,
      })
    }
  }
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from(TABLES.lessons).insert(rows)
    if (insErr) throw new Error(insErr.message)
  }

  return { inserted: rows.length, preserved: manuallyModified.length }
}

/**
 * Mise à jour complète d'une série de groupe : plage + intervalle.
 * Supprime uniquement les séances sans statut 'effectuee', préserve les effectuées.
 * Autorise un newStartDate dans le passé.
 */
export async function updateGroupSessionRange({ seriesId, groupId, newStartDate, newEndDate, intervalWeeks, sessionTime, durationMinutes, suspendDuringHolidays = false, zone = null }) {
  const safeInterval = Math.max(1, Math.round(intervalWeeks))

  // 1. Fetch toutes les séances de la série
  const { data: allExisting, error: fetchErr } = await supabase
    .from('group_sessions')
    .select('id, session_date, session_time, duration_minutes, status')
    .eq('recurrence_series_id', seriesId)
  if (fetchErr) throw new Error(fetchErr.message)

  const effectueeDates = new Set(
    (allExisting ?? []).filter((r) => r.status === 'effectuee').map((r) => r.session_date)
  )

  // 2. Calculer le planning cible
  const targetDates = new Set(
    buildGroupSessionDates(newStartDate, newEndDate, safeInterval, { suspendDuringHolidays, zone })
      .filter((d) => !effectueeDates.has(d))
  )

  // 3. Séparer planifiées standard vs modifiées manuellement
  const planifiees = (allExisting ?? []).filter((r) => r.status !== 'effectuee')
  const manuallyModified = planifiees.filter((r) =>
    r.session_time !== sessionTime ||
    r.duration_minutes !== durationMinutes ||
    !targetDates.has(r.session_date)
  )
  const manualDates = new Set(manuallyModified.map((r) => r.session_date))
  const standardIds = planifiees
    .filter((r) => !manualDates.has(r.session_date))
    .map((r) => r.id)

  // 4. Supprimer seulement les standard
  if (standardIds.length > 0) {
    const { error: delErr } = await supabase
      .from('group_sessions')
      .delete()
      .in('id', standardIds)
    if (delErr) throw new Error(delErr.message)
  }

  // 5. Déduplication globale : séances hors-série existantes pour ce groupe
  const occupied = new Set([...effectueeDates, ...manualDates])
  const candidateDates = [...targetDates].filter(d => !occupied.has(d))
  let extraOccupied = new Set()
  if (candidateDates.length > 0) {
    const { data: outsideSeries } = await supabase
      .from('group_sessions').select('session_date')
      .eq('group_id', groupId).neq('recurrence_series_id', seriesId)
      .in('session_date', candidateDates)
    extraOccupied = new Set((outsideSeries ?? []).map(r => r.session_date))
  }

  const rows = []
  for (const d of targetDates) {
    if (!occupied.has(d) && !extraOccupied.has(d)) {
      rows.push({
        group_id:                  groupId,
        session_date:              d,
        session_time:              sessionTime,
        duration_minutes:          durationMinutes,
        recurrence_series_id:      seriesId,
        recurrence_interval_weeks: safeInterval,
        suspend_during_holidays:   suspendDuringHolidays,
      })
    }
  }
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('group_sessions').insert(rows)
    if (insErr) throw new Error(insErr.message)
  }

  return { inserted: rows.length, preserved: manuallyModified.length + extraOccupied.size }
}

/**
 * Crée une série à partir d'une séance orpheline (sans recurrence_series_id).
 * Affecte le seriesId à la séance existante, puis génère les occurrences futures
 * via updateGroupSessionRange (qui déduplication les dates déjà prises).
 */
export async function initGroupSessionSeries({ sessionId, groupId, firstDate, endDate, intervalWeeks, sessionTime, durationMinutes, suspendDuringHolidays = false, zone = null }) {
  const seriesId = crypto.randomUUID()
  const safeInterval = Math.max(1, Math.round(intervalWeeks))
  // Rattacher la séance de départ à la nouvelle série
  const { error: updErr } = await supabase
    .from('group_sessions')
    .update({ recurrence_series_id: seriesId, recurrence_interval_weeks: safeInterval })
    .eq('id', sessionId)
  if (updErr) throw new Error(updErr.message)
  // Adopter dans la série toutes les séances orphelines du même groupe dans la plage cible
  const targetDates = buildGroupSessionDates(firstDate, endDate, safeInterval, { suspendDuringHolidays, zone })
  if (targetDates.length > 0) {
    const { data: orphans } = await supabase
      .from('group_sessions')
      .select('id').eq('group_id', groupId).is('recurrence_series_id', null)
      .in('session_date', targetDates)
    if (orphans && orphans.length > 0) {
      const orphanIds = orphans.map(o => o.id)
      await supabase.from('group_sessions')
        .update({ recurrence_series_id: seriesId, recurrence_interval_weeks: safeInterval })
        .in('id', orphanIds)
    }
  }
  // Générer les occurrences restantes (séances déjà existantes ignorées par déduplication)
  const result = await updateGroupSessionRange({ seriesId, groupId, newStartDate: firstDate, newEndDate: endDate, intervalWeeks, sessionTime, durationMinutes, suspendDuringHolidays, zone })
  return { seriesId, ...result }
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

/**
 * Retourne l'id d'une séance de groupe existante pour (groupId, sessionDate),
 * ou en crée une nouvelle si elle n'existe pas (get-or-create).
 * Utilisé quand on émarger depuis un créneau réservé lié à un groupe.
 */
export async function getOrCreateGroupSession({ groupId, sessionDate, sessionTime, durationMinutes }) {
  const { data: existing } = await supabase
    .from('group_sessions')
    .select('id')
    .eq('group_id', groupId)
    .eq('session_date', sessionDate)
    .maybeSingle()
  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from('group_sessions')
    .insert({
      group_id:         groupId,
      session_date:     sessionDate,
      session_time:     sessionTime ?? null,
      duration_minutes: durationMinutes ?? null,
      status:           'prevue',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return created.id
}

/**
 * Rétablit un cours suspendu pendant les vacances pour cet élève seulement.
 * Pose suspend_during_holidays=false sur la leçon identifiée par son id.
 */
export async function maintainLessonDuringHolidays(lessonId) {
  const { error } = await supabase.from(TABLES.lessons).update({ suspend_during_holidays: false }).eq('id', lessonId)
  if (error) throw new Error(error.message)
}

/**
 * Active suspend_during_holidays sur toutes les leçons planifie d'école du professeur.
 * N'efface aucune leçon, met uniquement le flag à true sur les lignes concernées.
 */
export async function applyHolidaysToAllSchoolSeries(teacherId) {
  const { error } = await supabase
    .from(TABLES.lessons)
    .update({ suspend_during_holidays: true })
    .eq('teacher_id', teacherId)
    .eq('context_type', 'ecole')
    .eq('status', 'planifie')
  if (error) throw new Error(error.message)
}

/** Compte et somme les minutes restantes à rattraper (annulé non cesu, hors raisons spéciales). */
export async function fetchRattrapageStats(teacherId) {
  const { data, error } = await supabase
    .from(TABLES.lessons)
    .select('id, duration_minutes, context_type, cancel_reason, student:' + TABLES.students + '(lesson_type)')
    .eq('teacher_id', teacherId)
    .eq('status', 'annule_prof')
  if (error) return { count: 0, minutesRestant: 0 }
  const rows = (data ?? []).filter((r) => {
    if (r.context_type === 'cesu') return false
    if (r.student?.lesson_type === 'cesu') return false
    if (r.cancel_reason === 'rattrapage_annule') return false
    if (r.cancel_reason === 'rattrapage_abandonne') return false
    if (r.cancel_reason === 'vacances') return false
    return true
  })
  return {
    count: rows.length,
    minutesRestant: rows.reduce((s, r) => s + (r.duration_minutes ?? 0), 0),
  }
}

export async function updateStudentsNotified(lessonId, value) {
  const { error } = await supabase
    .from(TABLES.lessons)
    .update({ students_notified: value })
    .eq('id', lessonId)
  if (error) throw new Error(error.message)
}

export async function updateLessonPlanningStatus(lessonId, planningStatus) {
  const { error } = await supabase
    .from(TABLES.lessons)
    .update({ planning_status: planningStatus })
    .eq('id', lessonId)
  if (error) throw new Error(error.message)
}

/**
 * Met à jour les champs éditables de ce cours et de tous les suivants de la même série.
 * Utilisé quand l'utilisateur choisit "toutes les suivantes" dans le dialogue de portée.
 */
export async function updateFutureLessonsInSeries(lessonId, recurrenceGroup, fromDate, input) {
  // Mise à jour du cours courant (peut avoir une date différente si déplacé)
  const { error: e1 } = await supabase
    .from(TABLES.lessons)
    .update({ lesson_time: input.lessonTime, duration_minutes: Number(input.durationMinutes), topic: input.topic, notes: input.notes ?? null, context_type: input.contextType ?? null })
    .eq('id', lessonId)
  if (e1) throw new Error(e1.message)
  // Mise à jour de tous les cours suivants de la même série (hors le cours courant)
  const { error: e2 } = await supabase
    .from(TABLES.lessons)
    .update({ lesson_time: input.lessonTime, duration_minutes: Number(input.durationMinutes), topic: input.topic, notes: input.notes ?? null, context_type: input.contextType ?? null })
    .eq('recurrence_group', recurrenceGroup)
    .gt('lesson_date', fromDate)
  if (e2) throw new Error(e2.message)
}
