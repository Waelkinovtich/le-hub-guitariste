import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// Transforme un titre libre en nom de fichier safe (sans accents, sans espaces)
function toSafeFilename(str) {
  return (str || 'document')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 60)
}

const STATUS_LABELS = {
  present: 'Présent',
  absent: 'Absent',
  excuse: 'Excusé',
  annulé_prof: 'Annulé prof',
  planifié: 'Planifié',
}

// En-tête professionnel commun à tous les PDF générés : identité et contact
// du professeur uniquement — jamais de logo ni de nom d'application. Ces
// documents sont envoyés directement aux directeurs d'école partenaires.
// Retourne la position Y (pt) juste après l'en-tête, pour enchaîner le
// contenu propre à chaque document sans chevauchement.
function drawProfessionalHeader(doc, { teacherName, teacherPhone, teacherEmail, documentTitle }) {
  doc.setFontSize(15)
  doc.setTextColor(192, 57, 43)
  doc.text(teacherName || 'Professeur de guitare', 14, 18)

  const contact = [teacherPhone, teacherEmail].filter(Boolean).join('  •  ')
  if (contact) {
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(contact, 14, 24)
  }

  const titleY = contact ? 34 : 30
  doc.setFontSize(13)
  doc.setTextColor(0, 0, 0)
  doc.text(documentTitle, 14, titleY)

  return titleY
}

export function exportÉmargementPDF({ lessons, school, period, teacherName, teacherPhone, teacherEmail }) {
  const doc = new jsPDF()

  let y = drawProfessionalHeader(doc, {
    teacherName,
    teacherPhone,
    teacherEmail,
    documentTitle: 'Feuille d’émargement',
  })
  y += 10

  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text('École : ' + (school || 'Tous'), 14, y); y += 7
  doc.text('Période : ' + period, 14, y); y += 7
  doc.text('Généré le : ' + new Date().toLocaleDateString('fr-FR'), 14, y); y += 9

  const rows = lessons.map((l) => [
    l.dateLabel,
    l.timeLabel,
    l.studentName,
    l.topic,
    l.durationMinutes + ' min',
    STATUS_LABELS[l.status] ?? l.status,
    l.absenceReason ?? '',
  ])

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Heure', 'Élève', 'Thème', 'Durée', 'Statut', 'Motif']],
    body: rows,
    headStyles: { fillColor: [192, 57, 43], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 16 }, 4: { cellWidth: 16 }, 5: { cellWidth: 22 } },
  })

  const total = lessons.length
  const presents = lessons.filter((l) => l.status === 'present').length
  const absents = lessons.filter((l) => l.status === 'absent').length
  const excuses = lessons.filter((l) => l.status === 'excuse').length
  const annulés = lessons.filter((l) => l.status === 'annulé_prof').length
  const taux = total > 0 ? Math.round((presents / total) * 100) : 0

  const finalY = doc.lastAutoTable.finalY + 10
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  doc.text('Récapitulatif : ' + total + ' cours — ' + presents + ' présents — ' + absents + ' absents — ' + excuses + ' excusés — ' + annulés + ' annulés — Taux de présence : ' + taux + '%', 14, finalY)

  const filename = 'emargement_' + (school || 'tous').replace(/\s/g, '_') + '_' + period.replace(/\s/g, '_') + '.pdf'
  doc.save(filename)
}

// ─── Feuille de route événement ───────────────────────────────────────────────

/**
 * Génère et télécharge la feuille de route d'un événement scolaire.
 * Même charte graphique que l'émargement (en-tête professionnel, autotable).
 *
 * @param {object} event        - Ligne school_notes_events (title, school_name, event_date, content)
 * @param {Array}  participants - Élèves sélectionnés : { first_name, last_name, email, phone }
 * @param {string} teacherName  - Nom du professeur (facultatif)
 * @param {string} teacherPhone - Téléphone du professeur (facultatif)
 * @param {string} teacherEmail - Email du professeur (facultatif)
 */
export function exportEventRoutePDF({ event, participants, teacherName, teacherPhone, teacherEmail }) {
  const doc = new jsPDF()

  let y = drawProfessionalHeader(doc, {
    teacherName,
    teacherPhone,
    teacherEmail,
    documentTitle: 'Feuille de route',
  })
  y += 10

  // ── Métadonnées ────────────────────────────────────────────────────────────
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text('Événement : ' + (event.title || ''), 14, y); y += 7
  doc.text('École : ' + (event.school_name || '—'), 14, y); y += 7
  doc.text('Date : ' + fmtDate(event.event_date), 14, y); y += 7
  doc.text('Généré le : ' + new Date().toLocaleDateString('fr-FR'), 14, y); y += 7

  // ── Description (facultative, avec retour à la ligne automatique) ──────────
  if (event.content) {
    y += 3
    doc.setFontSize(10)
    doc.setTextColor(60, 60, 60)
    doc.text('Description :', 14, y); y += 6
    doc.setTextColor(100, 100, 100)
    const lines = doc.splitTextToSize(event.content, 180)
    doc.text(lines, 14, y)
    // Chaque ligne occupe environ 5pt à fontSize 10
    y += lines.length * 5 + 6
  }

  // ── Tableau participants ───────────────────────────────────────────────────
  const rows = participants.map((p) => [
    [(p.first_name || ''), (p.last_name || '')].filter(Boolean).join(' '),
    [p.phone, p.email].filter(Boolean).join('  |  ') || '—',
  ])

  autoTable(doc, {
    startY: y + 4,
    head: [['Participant', 'Contact']],
    body: rows.length > 0 ? rows : [['Aucun participant sélectionné', '']],
    headStyles: { fillColor: [192, 57, 43], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 70 } },
  })

  // ── Récapitulatif ──────────────────────────────────────────────────────────
  const finalY = doc.lastAutoTable.finalY + 8
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(participants.length + ' participant' + (participants.length !== 1 ? 's' : '') + ' sur cette feuille de route.', 14, finalY)

  // Nom de fichier normalisé : "feuille-de-route-{titre}-{date}.pdf"
  const safeTitre = toSafeFilename(event.title)
  const safeDate  = (event.event_date || '').replace(/-/g, '')
  doc.save('feuille-de-route-' + safeTitre + (safeDate ? '-' + safeDate : '') + '.pdf')
}
