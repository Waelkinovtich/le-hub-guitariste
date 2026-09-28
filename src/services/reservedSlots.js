// ─── Service : créneaux réservés par école ────────────────────────────────────
//
// Un créneau réservé = engagement contractuel envers une école, sans élève précis.
// Distinct des cours élèves (table lessons). Hebdomadaire par nature (jour_semaine).

import { supabase } from '../lib/supabase'

const SELECT = `
  id, teacher_id, school_id, jour_semaine, heure_debut, duree_minutes, libelle, notes, created_at,
  recurrence_interval_weeks,
  school:schools (id, name)
`

// SELECT de secours si la colonne recurrence_interval_weeks n'existe pas encore (BLOC 4 migration)
const SELECT_NO_INTERVAL = `
  id, teacher_id, school_id, jour_semaine, heure_debut, duree_minutes, libelle, notes, created_at,
  school:schools (id, name)
`

function mapSlot(row) {
  return {
    id:                      row.id,
    teacherId:               row.teacher_id,
    schoolId:                row.school_id,
    schoolName:              row.school?.name ?? null,
    jourSemaine:             row.jour_semaine,  // 0=Dim, 1=Lun … 6=Sam (JS Date.getDay())
    heureDebut:              row.heure_debut,   // 'HH:MM'
    dureeMinutes:            row.duree_minutes,
    libelle:                 row.libelle ?? '',
    notes:                   row.notes ?? null,
    createdAt:               row.created_at,
    recurrenceIntervalWeeks: row.recurrence_interval_weeks ?? 1,
  }
}

/** Tous les créneaux réservés d'un prof (pour la grille de planning). */
export async function fetchReservedSlots(teacherId) {
  const tryFetch = async (select) => supabase
    .from('school_reserved_slots')
    .select(select)
    .eq('teacher_id', teacherId)
    .order('jour_semaine')
    .order('heure_debut')

  let { data, error } = await tryFetch(SELECT)
  if (error?.code === '42703' && error.message.includes('recurrence_interval_weeks')) {
    // Colonne absente : BLOC 4 migration non encore exécuté — fallback sans la colonne
    ;({ data, error } = await tryFetch(SELECT_NO_INTERVAL))
  }
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
export async function createReservedSlot({ teacherId, schoolId, jourSemaine, heureDebut, dureeMinutes, libelle, notes, recurrenceIntervalWeeks = 1 }) {
  const { data, error } = await supabase
    .from('school_reserved_slots')
    .insert({
      teacher_id:               teacherId,
      school_id:                schoolId,
      jour_semaine:             jourSemaine,
      heure_debut:              heureDebut,
      duree_minutes:            dureeMinutes,
      libelle:                  libelle ?? '',
      notes:                    notes ?? null,
      recurrence_interval_weeks: Math.max(1, recurrenceIntervalWeeks),
    })
    .select(SELECT)
    .single()
  if (error) throw new Error(error.message)
  return mapSlot(data)
}

/** Met à jour un créneau réservé depuis la grille Planning. */
export async function updateReservedSlot({ id, jourSemaine, heureDebut, dureeMinutes, libelle, recurrenceIntervalWeeks }) {
  const patch = {
    jour_semaine:  jourSemaine,
    heure_debut:   heureDebut,
    duree_minutes: dureeMinutes,
    libelle:       libelle ?? '',
  }
  if (recurrenceIntervalWeeks !== undefined) {
    patch.recurrence_interval_weeks = Math.max(1, recurrenceIntervalWeeks)
  }
  const { error } = await supabase
    .from('school_reserved_slots')
    .update(patch)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Supprime un créneau réservé (par son id, RLS garantit l'appartenance). */
export async function deleteReservedSlot(slotId) {
  const { error } = await supabase
    .from('school_reserved_slots')
    .delete()
    .eq('id', slotId)
  if (error) throw new Error(error.message)
}

// ─── Exceptions ponctuelles (T2) ──────────────────────────────────────────────
// Permet de masquer ou déplacer un créneau réservé pour UNE date précise,
// sans modifier la règle récurrente dans school_reserved_slots.

/** Charge les exceptions sur une plage de dates (pour la semaine affichée). */
export async function fetchSlotExceptions(teacherId, fromDate, toDate) {
  const { data, error } = await supabase
    .from('school_reserved_slot_exceptions')
    .select('id, slot_id, exception_date, type, new_heure_debut, new_duree_minutes')
    .eq('teacher_id', teacherId)
    .gte('exception_date', fromDate)
    .lte('exception_date', toDate)
  if (error) {
    // Fail silently si la table n'existe pas encore (migration non exécutée)
    console.warn('fetchSlotExceptions: table absente ou erreur réseau', error.message)
    return []
  }
  return (data ?? []).map((r) => ({
    id:              r.id,
    slotId:          r.slot_id,
    exceptionDate:   r.exception_date,
    type:            r.type,
    newHeureDebut:   r.new_heure_debut   ?? null,
    newDureeMinutes: r.new_duree_minutes ?? null,
  }))
}

/**
 * Crée ou remplace une exception pour (slot_id, exception_date).
 * type='hidden'  → le créneau disparaît ce jour-là.
 * type='moved'   → le créneau apparaît à newHeureDebut / newDureeMinutes.
 */
export async function upsertSlotException({ teacherId, slotId, exceptionDate, type, newHeureDebut, newDureeMinutes }) {
  const { error } = await supabase
    .from('school_reserved_slot_exceptions')
    .upsert(
      {
        teacher_id:       teacherId,
        slot_id:          slotId,
        exception_date:   exceptionDate,
        type,
        new_heure_debut:   newHeureDebut   ?? null,
        new_duree_minutes: newDureeMinutes ?? null,
      },
      { onConflict: 'slot_id,exception_date' }
    )
  if (error) throw new Error(error.message)
}

/** Supprime une exception (restaure le comportement par défaut pour cette date). */
export async function deleteSlotException(exceptionId) {
  const { error } = await supabase
    .from('school_reserved_slot_exceptions')
    .delete()
    .eq('id', exceptionId)
  if (error) throw new Error(error.message)
}
