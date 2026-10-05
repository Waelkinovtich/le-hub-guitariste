/**
 * Synchronise les statuts de cours avec les déclarations d'absence actives.
 *
 * Forward  : planifié + déclaration active → excuse/absent
 *            + absence_reason = 'declaration_eleve'
 * Backward : absent/excuse avec absence_reason='declaration_eleve'
 *            mais sans déclaration active → planifié (efface la raison)
 *
 * Ne touche JAMAIS un cours dont absence_reason ≠ 'declaration_eleve'
 * (= status posé manuellement par le professeur).
 *
 * @param {object} p
 * @param {object} p.supabaseClient   - client Supabase authentifié
 * @param {string} p.teacherId
 * @param {string} p.from             - date ISO début de plage
 * @param {string} p.to               - date ISO fin de plage
 * @param {Array}  p.lessons          - cours chargés (non-isGroup)
 * @param {Function} p.updateStatus   - async (id, status, absReason, cancelReason) => void
 * @param {Function} p.onOverride     - (id, status) => void  [mise à jour optimiste]
 * @param {Function} p.onClearOverride - (id) => void  [suppression override si erreur]
 * @returns {Promise<{applied: number, reset: number}>}
 */
export async function syncAbsenceDeclarations({
  supabaseClient,
  teacherId,
  from,
  to,
  lessons,
  updateStatus,
  onOverride,
  onClearOverride,
}) {
  if (!lessons?.length) return { applied: 0, reset: 0 }

  const toHHMM = (t) => (t ?? '').slice(0, 5)

  // 1. Récupérer toutes les déclarations actives dans la plage
  const { data: decls, error } = await supabaseClient
    .from('absence_declarations')
    .select('student_id,lesson_date,lesson_time,excused,cancelled_at')
    .eq('teacher_id', teacherId)
    .gte('lesson_date', from)
    .lte('lesson_date', to)
    .is('cancelled_at', null)
  if (error) return { applied: 0, reset: 0 }

  const declMap = new Map()
  for (const d of decls ?? []) {
    declMap.set(`${d.student_id}|${d.lesson_date}|${toHHMM(d.lesson_time)}`, d)
  }

  let applied = 0
  let reset = 0

  for (const lesson of lessons) {
    if (lesson.isGroup) continue
    const key = `${lesson.studentId}|${lesson.lessonDate}|${toHHMM(lesson.lessonTime)}`
    const decl = declMap.get(key)

    if (decl && lesson.status === 'planifie') {
      // Forward : cours planifié → absent / excusé par déclaration
      const newStatus = decl.excused ? 'excuse' : 'absent'
      onOverride?.(lesson.id, newStatus)
      try {
        await updateStatus(lesson.id, newStatus, 'declaration_eleve', null)
        applied++
      } catch {
        onClearOverride?.(lesson.id)
      }
    } else if (!decl && lesson.absenceReason === 'declaration_eleve') {
      // Backward : déclaration annulée, remettre à planifié
      onOverride?.(lesson.id, 'planifie')
      try {
        await updateStatus(lesson.id, 'planifie', null, null)
        reset++
      } catch {
        onClearOverride?.(lesson.id)
      }
    }
  }

  return { applied, reset }
}
