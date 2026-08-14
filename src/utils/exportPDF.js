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
  present: 'Pr\u00e9sent',
  absent: 'Absent',
  excuse: 'Excus\u00e9',
  annulé_prof: 'Annul\u00e9 prof',
  planifié: 'Planifi\u00e9',
}

export function exportÉmargementPDF({ lessons, school, period, teacherName }) {
  const doc = new jsPDF()

  doc.setFontSize(18)
  doc.setTextColor(192, 57, 43)
  doc.text('Hub du Guitariste', 14, 20)

  doc.setFontSize(13)
  doc.setTextColor(0, 0, 0)
  doc.text('Feuille d\u2019\u00e9margement', 14, 30)

  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text('Professeur : ' + (teacherName || ''), 14, 40)
  doc.text('École : ' + (school || 'Tous'), 14, 47)
  doc.text('P\u00e9riode : ' + period, 14, 54)
  doc.text('G\u00e9n\u00e9r\u00e9 le : ' + new Date().toLocaleDateString('fr-FR'), 14, 61)

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
    startY: 70,
    head: [['Date', 'Heure', 'Él\u00e8ve', 'Th\u00e8me', 'Dur\u00e9e', 'Statut', 'Motif']],
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
  doc.text('R\u00e9capitulatif : ' + total + ' cours — ' + presents + ' pr\u00e9sents — ' + absents + ' absents — ' + excuses + ' excus\u00e9s — ' + annulés + ' annul\u00e9s — Taux de pr\u00e9sence : ' + taux + '%', 14, finalY)

  const filename = 'emargement_' + (school || 'tous').replace(/\s/g, '_') + '_' + period.replace(/\s/g, '_') + '.pdf'
  doc.save(filename)
}

// ─── Feuille de route événement ───────────────────────────────────────────────

/**
 * Génère et télécharge la feuille de route d'un événement scolaire.
 * Même charte graphique que l'émargement (rouge hub-guitariste, autotable).
 *
 * @param {object} event       - Ligne school_notes_events (title, school_name, event_date, content)
 * @param {Array}  participants - Élèves sélectionnés : { first_name, last_name, email, phone }
 * @param {string} teacherName - Nom du professeur (facultatif)
 */
export function exportEventRoutePDF({ event, participants, teacherName }) {
  const doc = new jsPDF()

  // ── En-tête rouge ──────────────────────────────────────────────────────────
  doc.setFontSize(18)
  doc.setTextColor(192, 57, 43)
  doc.text('Hub du Guitariste', 14, 20)

  doc.setFontSize(13)
  doc.setTextColor(0, 0, 0)
  doc.text('Feuille de route', 14, 30)

  // ── Métadonnées ────────────────────────────────────────────────────────────
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  let y = 40
  if (teacherName) { doc.text('Professeur : ' + teacherName, 14, y); y += 7 }
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
