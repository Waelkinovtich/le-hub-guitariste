export const LESSON_STATUSES = [
  { value: 'present', label: 'Present', color: '#27ae60', emoji: '✅' },
  { value: 'absent', label: 'Absent (non excuse)', color: '#e74c3c', emoji: '❌' },
  { value: 'excuse', label: 'Absent excuse', color: '#e67e22', emoji: '⚠️' },
  { value: 'annule_prof', label: 'Annule par le prof', color: '#9b59b6', emoji: '🔵' },
  { value: 'rattrape', label: 'Rattrape', color: '#2980b9', emoji: '🔄' },
  { value: 'planifie', label: 'Planifie', color: '#7f8c8d', emoji: '📅' },
]

export const RAISONS_ANNULATION_PROF = [
  { value: 'concert', label: 'Concert / prestation', emoji: '🎵' },
  { value: 'sante', label: 'Raison de sante', emoji: '🤒' },
  { value: 'personnel', label: 'Raison personnelle', emoji: '🔒' },
]

export function getStatusInfo(status) {
  return LESSON_STATUSES.find((s) => s.value === status) ?? LESSON_STATUSES[5]
}

export function getRaisonLabel(raison) {
  return RAISONS_ANNULATION_PROF.find((r) => r.value === raison) ?? null
}
