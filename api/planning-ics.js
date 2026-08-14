import { createClient } from '@supabase/supabase-js'

// ─── Config ───────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY // clé service côté serveur

// ─── Helpers ICS ──────────────────────────────────────────────────────────────

/** Formate une date ISO + heure "HH:MM" en timestamp ICS local (sans Z) */
function toIcsLocal(isoDate, timeStr) {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-')
  const [hh, mm]  = (timeStr ?? '09:00').split(':')
  return `${y}${m}${d}T${hh}${mm}00`
}

/** Ajoute `durationMinutes` minutes à un timestamp ICS (YYYYMMDDTHHMMSS) */
function addMinutesToIcs(icsTs, durationMinutes) {
  const y   = parseInt(icsTs.slice(0,  4), 10)
  const mo  = parseInt(icsTs.slice(4,  6), 10) - 1
  const d   = parseInt(icsTs.slice(6,  8), 10)
  const h   = parseInt(icsTs.slice(9, 11), 10)
  const mi  = parseInt(icsTs.slice(11,13), 10)
  const dt  = new Date(Date.UTC(y, mo, d, h, mi))
  dt.setUTCMinutes(dt.getUTCMinutes() + (durationMinutes ?? 0))
  const pad = (n) => String(n).padStart(2, '0')
  return (
    dt.getUTCFullYear() +
    pad(dt.getUTCMonth() + 1) +
    pad(dt.getUTCDate()) + 'T' +
    pad(dt.getUTCHours()) +
    pad(dt.getUTCMinutes()) + '00'
  )
}

function escapeIcs(str) {
  return (str ?? '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
}

function stampNow() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return (
    now.getUTCFullYear() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) + 'T' +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds()) + 'Z'
  )
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const { token } = req.query

  if (!token || typeof token !== 'string') {
    res.status(401).send('Lien invalide.')
    return
  }

  if (!supabaseUrl || !supabaseKey) {
    res.status(500).send('Configuration serveur manquante.')
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1. Résoudre le token → teacher_id
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('calendar_token', token)
    .maybeSingle()

  if (profErr || !profile) {
    res.status(401).send('Lien expiré ou invalide.')
    return
  }

  const teacherId   = profile.id
  const teacherName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Professeur'
  const stamp       = stampNow()
  const today       = new Date().toISOString().slice(0, 10)
  const oneYearAgo  = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)

  // 2. Charger les cours (passé récent + futur) — jamais les annulés
  const { data: lessons, error: lessErr } = await supabase
    .from('lessons')
    .select(`
      id, lesson_date, lesson_time, duration_minutes, topic, status,
      students (first_name, last_name, school_name)
    `)
    .eq('teacher_id', teacherId)
    .not('status', 'in', '("annule_prof","annule_eleve")')
    .gte('lesson_date', oneYearAgo)
    .order('lesson_date')
    .order('lesson_time')

  if (lessErr) {
    res.status(500).send('Erreur lors du chargement des cours.')
    return
  }

  // 3. Générer le fichier ICS (RFC 5545)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hub Guitariste//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Cours de ${escapeIcs(teacherName)}`,
    'X-WR-TIMEZONE:Europe/Paris',
    'X-WR-CALDESC:Planning généré automatiquement par Hub Guitariste',
  ]

  for (const lesson of lessons ?? []) {
    const dtStart = toIcsLocal(lesson.lesson_date, lesson.lesson_time)
    const dtEnd   = addMinutesToIcs(dtStart, lesson.duration_minutes ?? 45)
    const student = lesson.students
    const studentName = student
      ? [student.first_name, student.last_name].filter(Boolean).join(' ')
      : 'Élève'
    const location = student?.school_name ?? ''
    const summary  = `Cours — ${studentName}`
    const uid      = lesson.id + '@hub-guitariste'

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Paris:${dtStart}`,
      `DTEND;TZID=Europe/Paris:${dtEnd}`,
      `SUMMARY:${escapeIcs(summary)}`,
      ...(location ? [`LOCATION:${escapeIcs(location)}`] : []),
      ...(lesson.topic ? [`DESCRIPTION:${escapeIcs(lesson.topic)}`] : []),
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')

  const icsContent = lines.join('\r\n')

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="planning.ics"')
  // Cache court : les agendas vérifient souvent toutes les 15-30 minutes
  res.setHeader('Cache-Control', 'public, max-age=900')
  res.status(200).send(icsContent)
}
