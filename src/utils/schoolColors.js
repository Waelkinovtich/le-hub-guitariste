const SCHOOL_COLORS = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e63']

export function getSchoolColor(schoolName, allSchools) {
  if (!schoolName) return '#6b7280'
  const idx = allSchools.indexOf(schoolName)
  if (idx === -1) return SCHOOL_COLORS[allSchools.length % SCHOOL_COLORS.length]
  return SCHOOL_COLORS[idx % SCHOOL_COLORS.length]
}
