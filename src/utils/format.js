const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const shortDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

export function fullName(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(' ').trim()
}

export function initials(firstName, lastName) {
  return [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase()
}

export function formatTime(time) {
  if (!time) return ''
  return time.slice(0, 5)
}

export function formatDateFr(dateStr) {
  if (!dateStr) return ''
  return dateFormatter.format(new Date(`${dateStr}T12:00:00`))
}

export function formatShortDate(dateStr) {
  if (!dateStr) return ''
  return shortDateFormatter.format(new Date(`${dateStr}T12:00:00`))
}

export function formatLessonDateLabel(dateStr) {
  if (!dateStr) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${dateStr}T12:00:00`)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Aujourd'hui"
  if (diffDays === 1) return 'Demain'
  if (diffDays === -1) return 'Hier'
  if (diffDays > 1 && diffDays < 7) {
    return target.toLocaleDateString('fr-FR', { weekday: 'long' })
  }
  return formatShortDate(dateStr)
}

export function toISODate(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
}

export function startOfWeek(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfWeek(date = new Date()) {
  const start = startOfWeek(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return end
}

export function formatWeekRange(date = new Date()) {
  const start = startOfWeek(date)
  const end = endOfWeek(date)
  const opts = { day: 'numeric', month: 'long' }
  const y = start.getFullYear() === end.getFullYear() ? '' : ` ${start.getFullYear()}`
  return `Semaine du ${start.toLocaleDateString('fr-FR', opts)} au ${end.toLocaleDateString('fr-FR', { ...opts, year: 'numeric' })}${y}`
}
