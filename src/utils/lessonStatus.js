export const LESSON_STATUSES = [
  { value: 'present', label: 'Présent', color: '#27ae60', emoji: '✅' },
  { value: 'absent', label: 'Absent (non excusé)', color: '#e74c3c', emoji: '❌' },
  { value: 'excuse', label: 'Absent excusé', color: '#e67e22', emoji: '⚠️' },
  { value: 'annule_prof', label: 'Annulé par le prof', color: '#9b59b6', emoji: '🔵' },
  { value: 'planifie', label: 'Planifié', color: '#7f8c8d', emoji: '📅' },
]

export function getStatusInfo(status) {
  return LESSON_STATUSES.find((s) => s.value === status) ?? LESSON_STATUSES[4]
}
