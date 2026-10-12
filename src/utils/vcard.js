// Construit une chaîne vCard 3.0 pour un élève (ou autre contact).
// Utilise itemN.X-ABLabel pour les libellés lisibles par Contacts.app / Google Contacts.
// Retourne la chaîne brute CRLF ; l'appelant décide du téléchargement.
export function buildVCardString(s) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${[s.firstName, s.lastName].filter(Boolean).join(' ')}`,
    `N:${s.lastName ?? ''};${s.firstName ?? ''};;;`,
  ]

  // Téléphone élève
  if (s.studentPhone || s.phone) {
    lines.push('item1.TEL;TYPE=CELL:' + (s.studentPhone || s.phone))
    lines.push('item1.X-ABLabel:Élève')
  }

  // Téléphone tuteur 1
  if (s.parent1Phone) {
    const label = s.parent1Name ? s.parent1Name : 'Tuteur 1'
    lines.push('item2.TEL;TYPE=HOME:' + s.parent1Phone)
    lines.push(`item2.X-ABLabel:${label}`)
  }

  // Téléphone tuteur 2
  if (s.parent2Phone) {
    const label = s.parent2Name ? s.parent2Name : 'Tuteur 2'
    lines.push('item3.TEL;TYPE=HOME:' + s.parent2Phone)
    lines.push(`item3.X-ABLabel:${label}`)
  }

  // E-mail élève
  if (s.email) {
    lines.push('item4.EMAIL:' + s.email)
    lines.push('item4.X-ABLabel:Élève')
  }

  // E-mail tuteur 1
  if (s.parent1Email) {
    const label = s.parent1Name ? s.parent1Name : 'Tuteur 1'
    lines.push('item5.EMAIL;TYPE=HOME:' + s.parent1Email)
    lines.push(`item5.X-ABLabel:${label}`)
  }

  if (s.schoolName) lines.push('ORG:' + s.schoolName)
  lines.push('END:VCARD')
  return lines.join('\r\n')
}

// Télécharge un .vcf pour un seul élève.
export function downloadVCard(s) {
  const content = buildVCardString(s)
  const blob = new Blob([content], { type: 'text/vcard;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${[s.firstName, s.lastName].filter(Boolean).join('_') || 'contact'}.vcf`
  a.click()
  URL.revokeObjectURL(url)
}

// Télécharge un .vcf groupé (plusieurs élèves dans un seul fichier).
export function downloadVCardGroup(students, filename = 'contacts') {
  const content = students.map(buildVCardString).join('\r\n')
  const blob = new Blob([content], { type: 'text/vcard;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.vcf`
  a.click()
  URL.revokeObjectURL(url)
}
