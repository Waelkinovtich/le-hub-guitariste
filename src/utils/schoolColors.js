// Palette de 8 couleurs vives accessibles (contraste suffisant sur fond clair et foncé).
// L'affectation est positionnelle : école #1 → couleur 0, école #2 → couleur 1, etc.
// Au-delà de 8 écoles, le cycle reprend depuis le début (modulo 8).
const SCHOOL_COLORS = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e63']

// Couleur de repli pour une école sans couleur attribuée (ex : école inconnue, cours CESU).
export const SCHOOL_COLOR_DEFAULT = '#6b7280'

export function getSchoolColor(schoolName, allSchools) {
  if (!schoolName) return SCHOOL_COLOR_DEFAULT
  const idx = allSchools.indexOf(schoolName)
  if (idx === -1) return SCHOOL_COLORS[allSchools.length % SCHOOL_COLORS.length]
  return SCHOOL_COLORS[idx % SCHOOL_COLORS.length]
}
