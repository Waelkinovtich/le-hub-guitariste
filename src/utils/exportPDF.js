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

// ─── Export Planning intelligent ─────────────────────────────────────────────

/**
 * Formate une map de disponibilités en texte compact pour la page récapitulatif.
 * Ex : { Lundi: ["09:00–09:15","09:15–09:30"], Mardi: ["14:00–14:15"] }
 *   → "Lundi 09:00–10:00, Mardi 14:00–14:15"
 * On fusionne les créneaux de 15 min contigus en un seul bloc pour la lisibilité.
 */
function formatDisposPDF(availabilities) {
  if (!availabilities || typeof availabilities !== 'object') return '—'
  const ORDRE_JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
  const parts = []
  for (const jour of ORDRE_JOURS) {
    const slots = availabilities[jour]
    if (!Array.isArray(slots) || slots.length === 0) continue
    // Fusionne les plages contigus pour ne pas afficher "09:00–09:15, 09:15–09:30"
    const blocs = []
    let debut = null, fin = null
    for (const slot of slots) {
      const [start, end] = slot.split('–').map((s) => s.trim())
      if (!debut) { debut = start; fin = end; continue }
      // Contigu si le début du nouveau = la fin du précédent
      if (start === fin) { fin = end } else { blocs.push(`${debut}–${fin}`); debut = start; fin = end }
    }
    if (debut) blocs.push(`${debut}–${fin}`)
    parts.push(`${jour} ${blocs.join(', ')}`)
  }
  return parts.length > 0 ? parts.join(' · ') : '—'
}

/**
 * Convertit "HH:MM" en nombre de minutes depuis minuit (pour tri et fusion).
 */
function hhmm(t) {
  const [h, m] = (t ?? '00:00').split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * Génère le planning de la semaine au format PDF 2 pages :
 *  - Page 1 (paysage A4) : grille visuelle jours × horaires avec noms d'élèves
 *  - Page 2 (portrait A4) : tableau récapitulatif avec créneaux assignés vs demandés
 *
 * @param {object[]} lessons          - Leçons/propositions à inclure (proposalLessons ou équivalent)
 * @param {object[]} responses        - survey_responses pour les disponibilités déclarées
 * @param {string[]} joursInclus      - Noms de jours FR à afficher (ex. ['Lundi','Mardi'])
 * @param {string}   dateLabel        - Libellé de la période (ex. "semaine du 08/09/2026")
 * @param {string}   teacherName      - Nom complet du professeur
 * @param {string}   teacherPhone     - Téléphone
 * @param {string}   teacherEmail     - Email
 * @param {string}   teacherAddress   - Adresse (optionnel)
 */
export function exportPlanningPDF({
  lessons, responses, joursInclus, dateLabel,
  teacherName, teacherPhone, teacherEmail, teacherAddress,
}) {
  // ── Constantes de mise en page grille ────────────────────────────────────────
  const HEURE_DEBUT  = 8    // 8h00
  const HEURE_FIN    = 19   // 19h00 — limite à 19h pour tenir 8mm/tranche sur A4 paysage
  const NB_TRANCHES  = (HEURE_FIN - HEURE_DEBUT) * 2  // tranches de 30 min
  const COL_HEURE_W  = 16   // largeur colonne "Heure" (mm)
  const HEADER_ROW_H = 9    // hauteur ligne d'en-tête des jours (mm)
  const ROW_H        = 8    // hauteur d'une tranche de 30 min (mm) — espace pour annotation manuelle
  const MARGIN       = 10   // marge gauche/droite page paysage (mm)
  // Calcul vérifié : gridY(26) + header(9) + 22×8(176) = 211mm ≈ A4 paysage hauteur 210mm ✓

  // ── Ordre des jours ─────────────────────────────────────────────────────────
  // JOURS_JS : ordre de Date.getDay() — 0=Dimanche, 1=Lundi, ..., 6=Samedi.
  // Utilisé UNIQUEMENT pour convertir une date ISO en nom de jour.
  const JOURS_JS    = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
  // JOURS_ORDRE : ordre d'affichage (convention FR : Lundi en premier).
  // Utilisé pour filtrer/ordonner les colonnes et l'affichage.
  const JOURS_ORDRE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

  // Convertit une date ISO en nom de jour FR via l'ordre JS natif (0=Dimanche)
  function isoToJourFR(iso) { return JOURS_JS[new Date(iso + 'T12:00:00').getDay()] }

  // ── Filtrage des leçons par jours sélectionnés ───────────────────────────────
  const joursOrdonnes  = JOURS_ORDRE.filter((j) => joursInclus.includes(j))

  // Associe chaque leçon à son jour FR réel via la date ISO
  const lessonsByJour = {}
  for (const j of joursOrdonnes) lessonsByJour[j] = []
  for (const l of lessons) {
    if (!l.lessonDate) continue
    const nomJour = isoToJourFR(l.lessonDate)   // ← correction T1 : JOURS_JS indexé par getDay()
    if (lessonsByJour[nomJour]) lessonsByJour[nomJour].push(l)
  }

  // ── Page 1 — Grille paysage ───────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()   // ≈ 297 mm
  const nbJours = joursOrdonnes.length || 1
  // Limite pratique : au-delà de 6 jours la colonne devient trop étroite pour annoter.
  // 7 jours tient sur la page (≈37mm/colonne) mais l'espace d'annotation est réduit.
  const colDayW = (pageW - MARGIN * 2 - COL_HEURE_W) / nbJours

  // En-tête professionnel compact (paysage)
  doc.setFontSize(12)
  doc.setTextColor(192, 57, 43)
  doc.text(teacherName || 'Professeur de guitare', MARGIN, 10)
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  const contactLine = [teacherPhone, teacherEmail].filter(Boolean).join('  •  ')
  if (contactLine) doc.text(contactLine, MARGIN, 16)
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  doc.text('Planning — ' + (dateLabel || ''), MARGIN, 22)
  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  doc.text('Document confidentiel — ' + new Date().toLocaleDateString('fr-FR'), pageW - MARGIN, 22, { align: 'right' })

  // Grille : point de départ Y (compact pour maximiser l'espace disponible)
  let gridY = 26

  // Ligne d'en-tête : cellule "Heure" + une cellule par jour
  doc.setFillColor(192, 57, 43)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.rect(MARGIN, gridY, COL_HEURE_W, HEADER_ROW_H, 'F')
  doc.text('Heure', MARGIN + COL_HEURE_W / 2, gridY + HEADER_ROW_H - 2.5, { align: 'center' })
  for (let i = 0; i < joursOrdonnes.length; i++) {
    const x = MARGIN + COL_HEURE_W + i * colDayW
    doc.rect(x, gridY, colDayW, HEADER_ROW_H, 'F')
    doc.text(joursOrdonnes[i], x + colDayW / 2, gridY + HEADER_ROW_H - 2.5, { align: 'center' })
  }
  gridY += HEADER_ROW_H

  // Lignes de créneaux 30 min (8h → 19h)
  doc.setTextColor(0, 0, 0)
  for (let t = 0; t < NB_TRANCHES; t++) {
    const totalMin = HEURE_DEBUT * 60 + t * 30
    const hh       = String(Math.floor(totalMin / 60)).padStart(2, '0')
    const mm       = String(totalMin % 60).padStart(2, '0')
    const rowY     = gridY + t * ROW_H
    const isHeure  = mm === '00'

    // Fond légèrement alterné toutes les heures pour guider l'œil
    if (isHeure) {
      doc.setFillColor(248, 248, 248)
      doc.rect(MARGIN, rowY, pageW - MARGIN * 2, ROW_H * 2, 'F')
    }

    // Colonne horaire — libellé uniquement aux heures pleines
    doc.setDrawColor(210, 210, 210)
    doc.rect(MARGIN, rowY, COL_HEURE_W, ROW_H)
    if (isHeure) {
      doc.setFontSize(7)
      doc.setTextColor(80, 80, 80)
      doc.text(`${hh}:${mm}`, MARGIN + COL_HEURE_W / 2, rowY + ROW_H - 2, { align: 'center' })
    }

    // Colonnes jours — trait plus léger pour la demi-heure, normal pour l'heure
    doc.setDrawColor(isHeure ? 180 : 220, isHeure ? 180 : 220, isHeure ? 180 : 220)
    for (let i = 0; i < joursOrdonnes.length; i++) {
      const x = MARGIN + COL_HEURE_W + i * colDayW
      doc.rect(x, rowY, colDayW, ROW_H)
    }
  }

  // Superpose les leçons sous forme de blocs colorés sur la grille
  const LESSON_COLORS = {
    envisage: [100, 140, 240],
    groupe:   [16, 185, 129],
    ensemble: [124, 58, 237],
    confirme: [60, 60, 60],
    default:  [80, 130, 200],
  }
  for (let i = 0; i < joursOrdonnes.length; i++) {
    const jour = joursOrdonnes[i]
    const x    = MARGIN + COL_HEURE_W + i * colDayW + 0.5
    for (const l of lessonsByJour[jour]) {
      const startMin = hhmm(l.lessonTime ?? l.timeLabel)
      const durée    = l.durationMinutes ?? 30
      const offsetT  = (startMin - HEURE_DEBUT * 60) / 30  // tranches 30min depuis 8h
      if (offsetT < 0 || offsetT >= NB_TRANCHES) continue
      // blockH laisse 2mm de blanc sous le bloc pour l'annotation manuelle
      const blockH = Math.min((durée / 30) * ROW_H, (NB_TRANCHES - offsetT) * ROW_H) - 2
      const blockY = gridY + offsetT * ROW_H + 0.5
      const rgb    = LESSON_COLORS[l.planningStatus] ?? LESSON_COLORS.default

      // Fond coloré de la leçon
      doc.setFillColor(...rgb)
      doc.setDrawColor(...rgb)
      doc.roundedRect(x, blockY, colDayW - 1, blockH, 1.5, 1.5, 'F')

      // Texte élève — plus grand et mieux espacé qu'avant
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(7)
      const nameLines = doc.splitTextToSize(l.studentName ?? 'Élève', colDayW - 4)
      doc.text(nameLines[0], x + 2, blockY + 4.5)
      if (nameLines.length > 1 && blockH > 9) doc.text(nameLines[1], x + 2, blockY + 9)
      // École — petite police, en bas du bloc si assez de place
      if (l.schoolName && blockH > 11) {
        doc.setFontSize(5.5)
        doc.setTextColor(210, 225, 255)
        const ecoleLines = doc.splitTextToSize(l.schoolName, colDayW - 4)
        doc.text(ecoleLines[0], x + 2, blockY + blockH - 1.5)
      }
    }
  }

  // ── Page 2 — Tableau récapitulatif (portrait) ─────────────────────────────────
  doc.addPage('a4', 'portrait')

  let y2 = drawProfessionalHeader(doc, {
    teacherName, teacherAddress, teacherPhone, teacherEmail,
    documentTitle: 'Récapitulatif élèves — ' + (dateLabel || ''),
  })
  y2 += 10

  // Construit une map responseId → response pour les disponibilités
  const responseById = {}
  for (const r of (responses ?? [])) responseById[r.id] = r

  // Trie les leçons par jour (ordre d'affichage) puis par heure
  const allLessons = joursOrdonnes.flatMap((j) => lessonsByJour[j])
    .sort((a, b) => {
      const dA = joursOrdonnes.indexOf(isoToJourFR(a.lessonDate ?? ''))  // ← correction T1
      const dB = joursOrdonnes.indexOf(isoToJourFR(b.lessonDate ?? ''))
      if (dA !== dB) return dA - dB
      return hhmm(a.lessonTime ?? '') - hhmm(b.lessonTime ?? '')
    })

  const rows2 = allLessons.map((l) => {
    const responseId = l._responseId
    const response   = responseById[responseId]
    const nomJour    = isoToJourFR(l.lessonDate ?? '')   // ← correction T1
    const créneau    = `${nomJour} ${l.lessonTime ?? '—'} (${l.durationMinutes ?? '?'} min)`
    const dispos     = response ? formatDisposPDF(response.availabilities) : '—'
    return [
      l.studentName ?? '—',
      l.schoolName  ?? '—',
      créneau,
      dispos,
    ]
  })

  autoTable(doc, {
    startY: y2,
    head: [['Élève', 'École', 'Créneau assigné', 'Disponibilités demandées']],
    body: rows2,
    headStyles: { fillColor: [192, 57, 43], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    styles: { fontSize: 8, cellPadding: 3, valign: 'middle', overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 38 },
      2: { cellWidth: 44 },
      3: { cellWidth: 'auto' },
    },
    didDrawPage: (data) => {
      // Pied de page : numéro de page
      doc.setFontSize(7)
      doc.setTextColor(150, 150, 150)
      doc.text(
        `Page ${data.pageNumber}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' },
      )
    },
  })

  // ── Nom du fichier : lisible, daté, jours inclus ──────────────────────────────
  const dateISO    = new Date().toISOString().slice(0, 10)
  const joursAbrev = joursOrdonnes.map((j) => j.slice(0, 3)).join('-')
  doc.save(`Planning-${dateISO}-${joursAbrev}.pdf`)
}
