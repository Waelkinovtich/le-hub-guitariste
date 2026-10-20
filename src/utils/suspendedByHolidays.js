import { isVacances } from './vacances'

/**
 * Retourne true si un élément (cours ou séance de groupe) est suspendu pendant
 * les vacances et ne doit pas être affiché ni compté.
 *
 * Cours individuel (lessons) — suspendu si :
 *   · cancel_reason / cancelReason === 'vacances'  (rétro-compatibilité)
 *   · OU suspend_during_holidays === true  ET  context_type === 'ecole'
 *     ET  recurrence_group non vide  ET  rattrapage_de_lesson_id vide
 *     ET  la date est en vacances scolaires
 *
 * Séance de groupe (group_sessions) — suspendue si :
 *   · suspend_during_holidays === true  ET  status === 'prevue'
 *     ET  la date est en vacances scolaires
 *
 * Un rattrapage ou un cours isolé n'est JAMAIS suspendu.
 * cancel_reason = '' est traité comme null.
 *
 * @param {object} item  — mapped lesson or group session (camelCase ou snake_case tolérés)
 * @param {string} zone  — 'A' | 'B' | 'C'
 */
export function isSuspendedByHolidays(item, zone) {
  if (!item || !zone) return false

  const cr = item.cancelReason ?? item.cancel_reason ?? null
  if (cr === 'vacances') return true

  const sdh = item.suspendDuringHolidays ?? item.suspend_during_holidays ?? false
  if (!sdh) return false

  // Séance de groupe (détectée par la présence de sessionStatus ou isGroup)
  if (item.isGroup || 'sessionStatus' in item) {
    const status = item.sessionStatus ?? item.status ?? ''
    if (status !== 'prevue') return false
    const date = item.lessonDate ?? item.session_date ?? ''
    return Boolean(date && isVacances(date, zone))
  }

  // Cours individuel
  const ct = item.contextType ?? item.context_type ?? null
  if (ct !== 'ecole') return false

  const rg = item.recurrenceGroup ?? item.recurrence_group ?? null
  if (!rg) return false // cours isolé → jamais suspendu

  const rml = item.rattrapageDeLessonId ?? item.rattrapage_de_lesson_id ?? null
  if (rml) return false // rattrapage → jamais suspendu

  const date = item.lessonDate ?? item.lesson_date ?? ''
  return Boolean(date && isVacances(date, zone))
}
