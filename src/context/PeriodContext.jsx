import { createContext, useContext, useState, useCallback } from 'react'

/**
 * Modes disponibles :
 *   'toutes'             — aucun filtre
 *   'annee_scolaire'     — value = ["2024-2025"] ou ["2024-2025","2025-2026"]
 *   'annee_civile'       — value = ["2025"] ou ["2024","2025"]
 *   'plage_personnalisee'— value = { from: "2025-01-01", to: "2025-06-30" }
 *
 * Pour annee_scolaire et annee_civile, value est toujours un tableau (même si 1 seul élément).
 */

const STORAGE_KEY = 'hg_period'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Migrer l'ancien format (value scalaire) vers tableau.
    // Ne pas toucher aux objets {from, to} : c'est le nouveau format range.
    if (parsed && (parsed.mode === 'annee_scolaire' || parsed.mode === 'annee_civile')) {
      if (parsed.value && !Array.isArray(parsed.value) && typeof parsed.value !== 'object') {
        parsed.value = [parsed.value]
      }
    }
    return parsed
  } catch {
    return null
  }
}

const PeriodContext = createContext(null)

export function PeriodProvider({ children }) {
  const [period, setPeriodState] = useState(() => {
    const saved = loadFromStorage()
    return saved ?? { mode: 'toutes', value: null }
  })

  const setPeriod = useCallback((mode, value = null) => {
    const next = { mode, value }
    setPeriodState(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, [])

  const resetPeriod = useCallback(() => {
    const next = { mode: 'toutes', value: null }
    setPeriodState(next)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return (
    <PeriodContext.Provider value={{ period, setPeriod, resetPeriod }}>
      {children}
    </PeriodContext.Provider>
  )
}

export function usePeriod() {
  const ctx = useContext(PeriodContext)
  if (!ctx) throw new Error('usePeriod must be used inside PeriodProvider')
  return ctx
}

// ── Utilitaires ──────────────────────────────────────────────────────────────

/** Déduit l'année scolaire d'une date ISO (ex : "2025-09-01" → "2025-2026"). */
export function schoolYearFromDate(dateIso) {
  const d     = new Date(dateIso)
  const year  = d.getFullYear()
  const month = d.getMonth() + 1 // 1-12
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

/** Retourne l'année scolaire courante. */
export function currentSchoolYear() {
  return schoolYearFromDate(new Date().toISOString())
}

/** Plage de dates [Date, Date] pour une année scolaire "2024-2025". */
export function schoolYearRange(yearStr) {
  const [y1] = yearStr.split('-').map(Number)
  return [
    new Date(y1, 7, 1),
    new Date(y1 + 1, 6, 31, 23, 59, 59),
  ]
}

/**
 * Génère toutes les années scolaires de "2000-2001" jusqu'à (année courante + 1).
 * Retourne un tableau trié du plus récent au plus ancien.
 */
export function allSchoolYears() {
  const now     = new Date()
  const curYear = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1
  const maxYear = curYear + 1 // permet de préparer l'année suivante
  const years   = []
  for (let y = maxYear; y >= 2000; y--) {
    years.push(`${y}-${y + 1}`)
  }
  return years
}

/**
 * Génère toutes les années civiles de 2000 jusqu'à (année courante + 1).
 * Retourne un tableau trié du plus récent au plus ancien.
 */
export function allCivilYears() {
  const maxYear = new Date().getFullYear() + 1
  const years   = []
  for (let y = maxYear; y >= 2000; y--) {
    years.push(String(y))
  }
  return years
}

/**
 * Filtre un tableau de cours/séances selon le contexte de période.
 * Chaque objet doit avoir l'une des clés : lesson_date, lessonDate, session_date.
 */
export function filterLessonsByPeriod(lessons, period) {
  const { mode, value } = period
  if (mode === 'toutes' || !mode) return lessons

  return lessons.filter((l) => {
    const dateStr = l.lesson_date ?? l.lessonDate ?? l.session_date ?? null
    if (!dateStr) return true

    if (mode === 'annee_scolaire') {
      // Format plage { from, to } (nouveau sélecteur molette)
      if (value && !Array.isArray(value) && value.from && value.to) {
        const sy = schoolYearFromDate(dateStr)
        return sy >= value.from && sy <= value.to
      }
      // Rétrocompatibilité : tableau de sélection
      const selectedYears = Array.isArray(value) ? value : (value ? [value] : [])
      if (!selectedYears.length) return true
      return selectedYears.includes(schoolYearFromDate(dateStr))
    }

    if (mode === 'annee_civile') {
      // Format plage { from, to }
      if (value && !Array.isArray(value) && value.from && value.to) {
        const cy = String(new Date(dateStr).getFullYear())
        return cy >= value.from && cy <= value.to
      }
      const selectedYears = (Array.isArray(value) ? value : (value ? [value] : [])).map(Number)
      if (!selectedYears.length) return true
      return selectedYears.includes(new Date(dateStr).getFullYear())
    }

    if (mode === 'plage_personnalisee' && value?.from && value?.to) {
      return dateStr >= value.from && dateStr <= value.to
    }

    return true
  })
}

/** Filtre un tableau d'élèves selon le contexte de période. */
export function filterStudentsByPeriod(students, period) {
  const { mode, value } = period
  if (mode === 'toutes' || !mode) return students

  return students.filter((s) => {
    if (mode === 'annee_scolaire') {
      if (value && !Array.isArray(value) && value.from && value.to) {
        const sy = s.enrollment_school_year
          ?? schoolYearFromDate(s.created_at ?? s.createdAt ?? new Date().toISOString())
        return sy >= value.from && sy <= value.to
      }
      const selectedYears = Array.isArray(value) ? value : (value ? [value] : [])
      if (!selectedYears.length) return true
      if (s.enrollment_school_year) {
        return selectedYears.includes(s.enrollment_school_year)
      }
      const derived = schoolYearFromDate(s.created_at ?? s.createdAt ?? new Date().toISOString())
      return selectedYears.includes(derived)
    }

    if (mode === 'annee_civile') {
      if (value && !Array.isArray(value) && value.from && value.to) {
        if (s.enrollment_school_year) {
          const [y1, y2] = s.enrollment_school_year.split('-').map(Number)
          return String(y1) >= value.from && String(y1) <= value.to
            || String(y2) >= value.from && String(y2) <= value.to
        }
        const cy = String(new Date(s.created_at ?? s.createdAt ?? Date.now()).getFullYear())
        return cy >= value.from && cy <= value.to
      }
      const selectedYears = (Array.isArray(value) ? value : (value ? [value] : [])).map(Number)
      if (!selectedYears.length) return true
      if (s.enrollment_school_year) {
        const [y1, y2] = s.enrollment_school_year.split('-').map(Number)
        return selectedYears.includes(y1) || selectedYears.includes(y2)
      }
      const created = new Date(s.created_at ?? s.createdAt ?? Date.now())
      return selectedYears.includes(created.getFullYear())
    }

    if (mode === 'plage_personnalisee' && value?.from && value?.to) {
      const from    = new Date(value.from)
      const to      = new Date(value.to + 'T23:59:59')
      const created = new Date(s.created_at ?? s.createdAt ?? Date.now())
      return created >= from && created <= to
    }

    return true
  })
}
