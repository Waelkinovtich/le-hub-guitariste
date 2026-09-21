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
    .select('id, title, event_date, type_evenement, school_name')
    .eq('teacher_id', teacherId)
    .eq('type', 'evenement')
    .gte('event_date', fromDate)
    .lte('event_date', toDate)
    .order('event_date')
  if (error) {
    console.warn('fetchEventsInRange:', error.message)
    return []
  }
  return data ?? []
}

/** Crée un événement depuis le Planning. Retourne la ligne créée. */
export async function createSchoolEvent({ teacherId, schoolName, title, content, eventDate, typeEvenement }) {
  const { data, error } = await supabase
    .from('school_notes_events')
    .insert({
      teacher_id:    teacherId,
      school_name:   schoolName,
      type:          'evenement',
      title:         title.trim(),
      content:       content?.trim() || null,
      event_date:    eventDate,
      type_evenement: typeEvenement ?? 'autre',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}
