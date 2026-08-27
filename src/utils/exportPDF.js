import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { LESSON_STATUSES } from './lessonStatus'

// ─── Constantes de mise en page PDF ──────────────────────────────────────────
// Source : charte graphique interne — unités en points (pt), format A4.
const PDF_MARGIN_X    = 14   // marge gauche/droite de tout le document
const PDF_HEADER_Y    = 18   // position Y de départ de l'en-tête
const PDF_FONT_TITLE  = 15   // taille du titre principal (nom du document)
const PDF_FONT_NORMAL = 10   // taille du texte courant (métadonnées, corps)
const PDF_FONT_SMALL  =  9   // taille du texte secondaire (tableaux, récapitulatifs)
const PDF_LINE_H      =  7   // interligne standard entre deux lignes de texte

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

// Construit depuis lessonStatus.js — source unique de vérité pour les libellés de statut.
// Raccourcis les libellés longs pour la mise en page des tableaux PDF (espace contraint).
const STATUS_LABELS = LESSON_STATUSES.reduce((acc, s) => {
  acc[s.value] = s.label.replace('Annulé par le prof', 'Annulé prof').replace('Absent (non excusé)', 'Absent')
  return acc
}, {})

// En-tête professionnel commun à tous les PDF générés : identité et contact
// du professeur uniquement — jamais de logo ni de nom d'application. Ces
// documents sont envoyés directement aux directeurs d'école partenaires.
// Retourne la position Y (pt) juste après l'en-tête, pour enchaîner le
// contenu propre à chaque document sans chevauchement.
//
// teacherAddress est optionnel : affiché entre le nom et le contact si renseigné.
// Les appelants existants (émargement, feuilles de route) ne le passent pas —
// leur rendu reste donc strictement identique.
function drawProfessionalHeader(doc, { teacherName, teacherPhone, teacherAddress, teacherEmail, documentTitle }) {
  doc.setFontSize(PDF_FONT_TITLE)
  doc.setTextColor(192, 57, 43)
  doc.text(teacherName || 'Professeur de guitare', PDF_MARGIN_X, PDF_HEADER_Y)

  doc.setFontSize(PDF_FONT_SMALL)
  doc.setTextColor(100, 100, 100)
  let y = PDF_HEADER_Y + 6

  if (teacherAddress) {
    doc.text(teacherAddress, PDF_MARGIN_X, y)
    y += 6
  }

  const contact = [teacherPhone, teacherEmail].filter(Boolean).join('  •  ')
  if (contact) {
    doc.text(contact, PDF_MARGIN_X, y)
    y += 6
  }

  // Titre du document, séparé des coordonnées par 4 pt de marge
  const titleY = y + 4
  doc.setFontSize(13)
  doc.setTextColor(0, 0, 0)
  doc.text(documentTitle, PDF_MARGIN_X, titleY)

  return titleY
}

export function exportÉmargementPDF({ lessons, school, period, teacherName, teacherAddress, teacherPhone, teacherEmail }) {
  const doc = new jsPDF()

  let y = drawProfessionalHeader(doc, {
    teacherName,
    teacherAddress,
    teacherPhone,
    teacherEmail,
        documentTitle: "Feuille d’émargement",
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
export function exportEventRoutePDF({ event, participants, teacherName, teacherAddress, teacherPhone, teacherEmail }) {
  const doc = new jsPDF()

  let y = drawProfessionalHeader(doc, {
    teacherName,
    teacherAddress,
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

// ─── Fiche technique événement ────────────────────────────────────────────────

/**
 * Génère et télécharge la fiche technique d'un événement scolaire.
 * Inclut les informations logistiques de base et la liste des participants.
 *
 * @param {object} event        - Ligne school_notes_events
 * @param {Array}  participants - Élèves sélectionnés
 * @param {string} teacherName / teacherPhone / teacherAddress / teacherEmail
 */
export function exportFicheTechniquePDF({ event, participants, teacherName, teacherAddress, teacherPhone, teacherEmail }) {
  const doc = new jsPDF()

  let y = drawProfessionalHeader(doc, {
    teacherName, teacherAddress, teacherPhone, teacherEmail,
    documentTitle: 'Fiche technique',
  })
  y += 10

  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text('Événement : ' + (event.title || '—'), 14, y); y += 7
  doc.text('École : '     + (event.school_name || '—'), 14, y); y += 7
  doc.text('Date : '      + fmtDate(event.event_date), 14, y); y += 7
  doc.text('Nombre de participants : ' + participants.length, 14, y); y += 7
  doc.text('Généré le : ' + new Date().toLocaleDateString('fr-FR'), 14, y); y += 10

  // ── Besoins matériels standard ────────────────────────────────────────────
  doc.setFontSize(11)
  doc.setTextColor(60, 60, 60)
  doc.setFont(undefined, 'bold')
  doc.text('Besoins matériels', 14, y); y += 7
  doc.setFont(undefined, 'normal')

  const materielRows = [
    ['Chaises (interprètes)', String(participants.length), ''],
    ['Chaises (public)', '—', 'À préciser selon la salle'],
    ['Pupitres / porte-partitions', String(participants.length), ''],
    ['Système de sonorisation', '—', 'Selon la salle'],
    ['Micro(s) / DI box', '—', 'Selon le programme'],
    ['Tables pour instruments', '—', ''],
  ]

  autoTable(doc, {
    startY: y,
    head: [['Élément', 'Quantité', 'Remarque']],
    body: materielRows,
    headStyles: { fillColor: [192, 57, 43], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 25, halign: 'center' } },
  })

  y = doc.lastAutoTable.finalY + 10

  // ── Liste des participants ────────────────────────────────────────────────
  doc.setFontSize(11)
  doc.setTextColor(60, 60, 60)
  doc.setFont(undefined, 'bold')
  doc.text('Participants (' + participants.length + ')', 14, y); y += 4
  doc.setFont(undefined, 'normal')

  const partRows = participants.map((p) => [
    [(p.first_name || ''), (p.last_name || '')].filter(Boolean).join(' '),
    p.phone || '—',
  ])

  autoTable(doc, {
    startY: y,
    head: [['Nom', 'Téléphone']],
    body: partRows.length > 0 ? partRows : [['Aucun participant sélectionné', '']],
    headStyles: { fillColor: [192, 57, 43], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 9, cellPadding: 3 },
  })

  const safeTitre = toSafeFilename(event.title)
  const safeDate  = (event.event_date || '').replace(/-/g, '')
  doc.save('fiche-technique-' + safeTitre + (safeDate ? '-' + safeDate : '') + '.pdf')
}

// ─── Programme de concert ─────────────────────────────────────────────────────

/**
 * Génère et télécharge le programme de concert d'un événement scolaire.
 *
 * @param {object} event        - Ligne school_notes_events
 * @param {Array}  programItems - Items ordonnés : { ordre, titre_piece, compositeur, student_name, duree_minutes, note }
 * @param {string} teacherName / teacherPhone / teacherAddress / teacherEmail
 */
export function exportProgrammeConcertPDF({ event, programItems, teacherName, teacherAddress, teacherPhone, teacherEmail }) {
  const doc = new jsPDF()

  let y = drawProfessionalHeader(doc, {
    teacherName, teacherAddress, teacherPhone, teacherEmail,
    documentTitle: 'Programme de concert',
  })
  y += 10

  doc.setFontSize(14)
  doc.setTextColor(60, 60, 60)
  doc.setFont(undefined, 'bold')
  doc.text(event.title || 'Concert', 14, y); y += 8
  doc.setFont(undefined, 'normal')

  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  if (event.school_name) { doc.text(event.school_name, 14, y); y += 6 }
  doc.text(fmtDate(event.event_date), 14, y); y += 10

  if (event.content) {
    const lines = doc.splitTextToSize(event.content, 180)
    doc.text(lines, 14, y)
    y += lines.length * 5 + 8
  }

  // ── Tableau du programme ──────────────────────────────────────────────────
  const rows = programItems.map((item) => [
    String(item.ordre),
    item.titre_piece || '—',
    item.compositeur || '—',
    item.student_name || '—',
    item.duree_minutes ? item.duree_minutes + ' min' : '—',
    item.note || '',
  ])

  autoTable(doc, {
    startY: y,
    head: [['N°', 'Pièce', 'Compositeur', 'Interprète', 'Durée', 'Remarque']],
    body: rows.length > 0 ? rows : [['—', 'Programme vide', '', '', '', '']],
    headStyles: { fillColor: [192, 57, 43], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      4: { cellWidth: 18, halign: 'center' },
    },
  })

  // Durée totale
  const dureeTotal = programItems.reduce((s, i) => s + (i.duree_minutes ?? 0), 0)
  if (dureeTotal > 0) {
    const finalY = doc.lastAutoTable.finalY + 6
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('Durée totale estimée : ' + dureeTotal + ' min', 14, finalY)
  }

  const safeTitre = toSafeFilename(event.title)
  const safeDate  = (event.event_date || '').replace(/-/g, '')
  doc.save('programme-concert-' + safeTitre + (safeDate ? '-' + safeDate : '') + '.pdf')
}

// ─── Déplacements professionnels ──────────────────────────────────────────────

const CATEGORY_LABELS_PDF = {
  trajet_recurrent:  'Trajets récurrents (école)',
  reunion_direction: 'Réunions / rendez-vous direction',
  autre:             'Autres déplacements professionnels',
}

/**
 * Génère un relevé PDF de déplacements professionnels, utilisable pour la
 * déclaration fiscale (frais réels). Sobre : en-tête nom/contact prof,
 * tableau autotable, récapitulatif km + coût. Sans logo ni marque app.
 *
 * @param {Array}  entries        - Entrées travel_entries filtrées à exporter
 * @param {string|null} category  - Catégorie filtrée, ou null pour toutes
 * @param {string} periodLabel    - Libellé humain de la période (ex : "2025-2026")
 * @param {string} teacherName    - Nom du professeur (identité fiscale)
 * @param {string} teacherAddress - Adresse du domicile (facultatif, affiché si renseigné)
 * @param {string} teacherPhone   - Numéro de téléphone (facultatif)
 * @param {string} teacherEmail   - Email du professeur (facultatif)
 */
export function exportTravelPDF({ entries, category, periodLabel, teacherName, teacherAddress, teacherPhone, teacherEmail }) {
  const doc = new jsPDF()
  const catLabel = category ? (CATEGORY_LABELS_PDF[category] ?? category) : 'Tous déplacements'

  let y = drawProfessionalHeader(doc, {
    teacherName,
    teacherAddress,
    teacherPhone,
    teacherEmail,
    documentTitle: 'Déplacements professionnels',
  })
  y += 10

  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text('Catégorie : ' + catLabel, 14, y); y += 7
  doc.text('Période : ' + (periodLabel || 'Toutes périodes'), 14, y); y += 7
  doc.text('Généré le : ' + new Date().toLocaleDateString('fr-FR'), 14, y); y += 7

  const rows = entries.map(e => {
    const dateStr = new Date(e.date + 'T00:00:00').toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
    const km   = Number(e.kilometres).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' km'
    const cout = e.cout_calcule
      ? Number(e.cout_calcule).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
      : '—'
    return [dateStr, e.motif || '—', km, cout]
  })

  autoTable(doc, {
    startY: y + 4,
    head: [['Date', 'Motif', 'Km', 'Coût estimé']],
    body: rows.length > 0 ? rows : [['Aucun déplacement', '', '', '']],
    headStyles:          { fillColor: [192, 57, 43], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles:  { fillColor: [245, 245, 245] },
    styles:              { fontSize: 9, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 24 }, 2: { cellWidth: 22 }, 3: { cellWidth: 26 } },
  })

  const totalKm   = entries.reduce((acc, e) => acc + Number(e.kilometres ?? 0), 0)
  const totalCout = entries.filter(e => e.cout_calcule).reduce((acc, e) => acc + Number(e.cout_calcule), 0)

  const finalY = doc.lastAutoTable.finalY + 10
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  const kmStr   = totalKm.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
  const coutStr = totalCout > 0
    ? totalCout.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
    : '—'
  doc.text(
    `Total : ${kmStr} km — Coût estimé : ${coutStr} — ${entries.length} déplacement${entries.length !== 1 ? 's' : ''}`,
    14, finalY,
  )

  const safeCat  = toSafeFilename(catLabel)
  const safeDate = new Date().toISOString().slice(0, 10)
  doc.save('deplacements-' + safeCat + '-' + safeDate + '.pdf')
}
