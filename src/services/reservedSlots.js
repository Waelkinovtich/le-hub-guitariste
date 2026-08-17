// ─── Service : créneaux réservés par école ────────────────────────────────────
//
// Un créneau réservé = engagement contractuel envers une école, sans élève précis.
// Distinct des cours élèves (table lessons). Hebdomadaire par nature (jour_semaine).

import { supabase } from '../lib/supabase'

const SELECT = `
  id, teacher_id, school_id, jour_semaine, heure_debut, duree_minutes, libelle, notes, created_at,
  school:schools (id, name)
`

function mapSlot(row) {
  return {
    id:            row.id,
    teacherId:     row.teacher_id,
    schoolId:      row.school_id,
    schoolName:    row.school?.name ?? null,
    jourSemaine:   row.jour_semaine,  // 0=Dim, 1=Lun … 6=Sam (JS Date.getDay())
    heureDebut:    row.heure_debut,   // 'HH:MM'
    dureeMinutes:  row.duree_minutes,
    libelle:       row.libelle ?? '',
    notes:         row.notes ?? null,
    createdAt:     row.created_at,
  }
}

/** Tous les créneaux réservés d'un prof (pour la grille de planning). */
export async function fetchReservedSlots(teacherId) {
  const { data, error } = await supabase
    .from('school_reserved_slots')
    .select(SELECT)
    .eq('teacher_id', teacherId)
    .order('jour_semaine')
    .order('heure_debut')
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapSlot)
}

/** Créneaux réservés d'une école précise (pour la fiche école). */
export async function fetchReservedSlotsForSchool(schoolId) {
  const { data, error } = await supabase
    .from('school_reserved_slots')
    .select(SELECT)
    .eq('school_id', schoolId)
    .order('jour_semaine')
    .order('heure_debut')
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapSlot)
}

/** Crée un créneau réservé. */
export async function createReservedSlot({ teacherId, schoolId, jourSemaine, heureDebut, dureeMinutes, libelle, notes }) {
  const { data, error } = await supabase
    .from('school_reserved_slots')
    .insert({
      teacher_id:    teacherId,
      school_id:     schoolId,
      jour_semaine:  jourSemaine,
      heure_debut:   heureDebut,
      duree_minutes: dureeMinutes,
      libelle:       libelle ?? '',
      notes:         notes ?? null,
    })
    .select(SELECT)
    .single()
  if (error) throw new Error(error.message)
  return mapSlot(data)
}

/** Supprime un créneau réservé (par son id, RLS garantit l'appartenance). */
export async function deleteReservedSlot(slotId) {
  const { error } = await supabase
    .from('school_reserved_slots')
    .delete()
    .eq('id', slotId)
  if (error) throw new Error(error.message)
}
