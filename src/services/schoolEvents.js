// ─── Service : Notes & Événements école (school_notes_events) ─────────────────
//
// SchoolNotesPage utilise Supabase directement (historique).
// Ce service expose les fonctions nécessaires au Planning pour lire et créer
// des événements — pas de duplication avec SchoolNotesPage.

import { supabase } from '../lib/supabase'

/** Événements école sur une plage de dates (pour affichage dans le Planning). */
export async function fetchEventsInRange(teacherId, fromDate, toDate) {
  const { data, error } = await supabase
    .from('school_notes_events')
    .select('id, title, event_date, type_evenement, school_name, start_time, duration_minutes, recurrence_series_id')
    .eq('teacher_id', teacherId)
    .eq('type', 'evenement')
    .gte('event_date', fromDate)
    .lte('event_date', toDate)
    .order('event_date')
  if (error) {
    // Fallback si colonnes start_time/duration_minutes absentes (BLOC T7e non exécuté)
    if (error.code === '42703') {
      const { data: d2 } = await supabase
        .from('school_notes_events')
        .select('id, title, event_date, type_evenement, school_name')
        .eq('teacher_id', teacherId)
        .eq('type', 'evenement')
        .gte('event_date', fromDate)
        .lte('event_date', toDate)
        .order('event_date')
      return d2 ?? []
    }
    console.warn('fetchEventsInRange:', error.message)
    return []
  }
  return data ?? []
}

/**
 * Crée un événement depuis le Planning.
 * Si intervalWeeks > 1 ou endDate fourni, crée une série récurrente jusqu'à endDate.
 * Retourne la première ligne créée.
 */
export async function createSchoolEvent({ teacherId, schoolName, title, content, eventDate, typeEvenement, intervalWeeks = 1, endDate = null, startTime = null, durationMinutes = null }) {
  const seriesId = (intervalWeeks > 1 || endDate) ? crypto.randomUUID() : null

  // Génère les dates de la série
  const dates = []
  const pad = (n) => String(n).padStart(2, '0')
  let current = new Date(eventDate + 'T00:00:00')
  const stop = endDate ? new Date(endDate + 'T00:00:00') : current
  const safeInterval = Math.max(1, Math.round(intervalWeeks))
  while (current <= stop) {
    dates.push(current.getFullYear() + '-' + pad(current.getMonth() + 1) + '-' + pad(current.getDate()))
    if (!endDate || safeInterval < 1) break
    current.setDate(current.getDate() + 7 * safeInterval)
  }

  const rows = dates.map(d => ({
    teacher_id:                teacherId,
    school_name:               schoolName,
    type:                      'evenement',
    title:                     title.trim(),
    content:                   content?.trim() || null,
    event_date:                d,
    type_evenement:            typeEvenement ?? 'autre',
    recurrence_series_id:      seriesId,
    recurrence_interval_weeks: safeInterval,
    start_time:                startTime || null,
    duration_minutes:          durationMinutes ? Number(durationMinutes) : null,
  }))

  const { data, error } = await supabase
    .from('school_notes_events')
    .insert(rows)
    .select('*')
  if (error) {
    // Fallback si colonnes récurrence absentes (BLOC T9 non exécuté) : insérer sans elles
    if (error.code === '42703') {
      const { data: d2, error: e2 } = await supabase
        .from('school_notes_events')
        .insert({ teacher_id: teacherId, school_name: schoolName, type: 'evenement', title: title.trim(), content: content?.trim() || null, event_date: eventDate, type_evenement: typeEvenement ?? 'autre' })
        .select('*')
        .single()
      if (e2) throw new Error(e2.message)
      return d2
    }
    throw new Error(error.message)
  }
  return data?.[0] ?? null
}

/** Modifie une seule occurrence d'événement. */
export async function updateSchoolEventOccurrence(id, { title, startTime, durationMinutes, typeEvenement, schoolName }) {
  const { error } = await supabase
    .from('school_notes_events')
    .update({
      title:            title.trim(),
      start_time:       startTime || null,
      duration_minutes: durationMinutes ? Number(durationMinutes) : null,
      type_evenement:   typeEvenement ?? 'autre',
      school_name:      schoolName || null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Modifie toutes les occurrences d'une série d'événements. */
export async function updateSchoolEventSeries(seriesId, { title, startTime, durationMinutes, typeEvenement, schoolName }) {
  const { error } = await supabase
    .from('school_notes_events')
    .update({
      title:            title.trim(),
      start_time:       startTime || null,
      duration_minutes: durationMinutes ? Number(durationMinutes) : null,
      type_evenement:   typeEvenement ?? 'autre',
      school_name:      schoolName || null,
    })
    .eq('recurrence_series_id', seriesId)
  if (error) throw new Error(error.message)
}

/** Supprime une seule occurrence d'événement. */
export async function deleteSchoolEventOccurrence(id) {
  const { error } = await supabase.from('school_notes_events').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
