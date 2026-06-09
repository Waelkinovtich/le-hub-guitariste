import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const STATUS_LABELS = {
  present: 'Pr\u00e9sent',
  absent: 'Absent',
  excuse: 'Excus\u00e9',
  annule_prof: 'Annul\u00e9 prof',
  planifie: 'Planifi\u00e9',
}

export function exportEmargementPDF({ lessons, school, period, teacherName }) {
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
  const annules = lessons.filter((l) => l.status === 'annule_prof').length
  const taux = total > 0 ? Math.round((presents / total) * 100) : 0

  const finalY = doc.lastAutoTable.finalY + 10
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  doc.text('R\u00e9capitulatif : ' + total + ' cours — ' + presents + ' pr\u00e9sents — ' + absents + ' absents — ' + excuses + ' excus\u00e9s — ' + annules + ' annul\u00e9s — Taux de pr\u00e9sence : ' + taux + '%', 14, finalY)

  const filename = 'emargement_' + (school || 'tous').replace(/\s/g, '_') + '_' + period.replace(/\s/g, '_') + '.pdf'
  doc.save(filename)
}
