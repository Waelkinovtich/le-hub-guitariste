// Génération de fichiers .ics (RFC 5545) entièrement côté client.
// Les horaires sont exprimés en heure locale flottante (sans suffixe Z),
// ce qui garantit l'importation correcte dans Calendrier (macOS/iOS).

function pad(n) { return String(n).padStart(2, '0') }

function toIcsDate(dateStr, timeStr) {
  // dateStr : 'YYYY-MM-DD', timeStr : 'HH:MM' ou 'HH:MM:SS'
  const [y, m, d] = dateStr.split('-')
  const [hh, mm] = (timeStr ?? '00:00').split(':')
  return `${y}${m}${d}T${pad(Number(hh))}${pad(Number(mm))}00`
}

function addMinutes(dateStr, timeStr, minutes) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [hh, mm] = (timeStr ?? '00:00').split(':').map(Number)
  const dt = new Date(y, mo - 1, d, hh, mm + minutes)
  return (
    `${dt.getFullYear()}` +
    `${pad(dt.getMonth() + 1)}` +
    `${pad(dt.getDate())}` +
    `T${pad(dt.getHours())}${pad(dt.getMinutes())}00`
  )
}

function escapeIcs(str) {
  if (!str) return ''
  return String(str).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function foldLine(line) {
  // RFC 5545 : lignes de max 75 octets, continuation avec CRLF + SPACE
  const bytes = [...line]
  if (bytes.length <= 75) return line
  const parts = []
  let i = 0
  while (i < bytes.length) {
    parts.push(bytes.slice(i, i + (i === 0 ? 75 : 74)).join(''))
    i += i === 0 ? 75 : 74
  }
  return parts.join('\r\n ')
}

export function generateIcs(lessons) {
  const now = new Date()
  const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

  const events = lessons.map((l) => {
    const dtStart = toIcsDate(l.lessonDate, l.lessonTime ?? l.timeLabel)
    const dtEnd   = addMinutes(l.lessonDate, l.lessonTime ?? l.timeLabel, l.durationMinutes ?? 45)

    const summary = ['Cours de guitare', l.studentName].filter(Boolean).join(' — ')

    const descParts = []
    if (l.studentName) descParts.push(`Élève : ${l.studentName}`)
    if (l.schoolName)  descParts.push(`École : ${l.schoolName}`)
    if (l.topic)       descParts.push(`Thème : ${l.topic}`)
    if (l.notes)       descParts.push(`Notes : ${l.notes}`)
    const description = escapeIcs(descParts.join(' | '))

    const lines = [
      'BEGIN:VEVENT',
      `UID:hubguitariste-lesson-${l.id}@hubguitariste.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcs(summary)}`,
      description ? `DESCRIPTION:${description}` : null,
      l.schoolName ? `LOCATION:${escapeIcs(l.schoolName)}` : null,
      'END:VEVENT',
    ].filter(Boolean)

    return lines.map(foldLine).join('\r\n')
  })

  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hub du Guitariste//Planning//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')

  return calendar
}

export function downloadIcs(lessons, filename = 'planning-guitare.ics') {
  if (!lessons.length) return
  const content = generateIcs(lessons)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
