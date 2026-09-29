// Panneau unifié de gestion de la récurrence — cours individuel OU séance de groupe.
// Affiche l'état actuel de la série (première date, dernière date, intervalle) et
// permet de tout modifier en une seule action, y compris les dates rétroactives.
//
// Détecte automatiquement le type via lesson.planningStatus === 'groupe'.
// schoolZone (prop optionnelle) active le filtrage vacances scolaires.

import { useState, useEffect, useMemo } from 'react'
import { Repeat2, X, Loader2, CalendarDays } from 'lucide-react'
import {
  fetchSeriesDateRange,
  fetchGroupSeriesDateRange,
  updateRecurrenceRange,
  updateGroupSessionRange,
} from '../services/lessons'
import { isVacances } from '../utils/vacances'

const INTERVAL_OPTIONS = [
  { value: 1, label: 'Toutes les semaines' },
  { value: 2, label: 'Une semaine sur deux' },
  { value: 3, label: 'Toutes les 3 semaines' },
  { value: 4, label: 'Toutes les 4 semaines' },
]

/** Compte les occurrences entre firstDate et lastDate (intervalle en semaines), en filtrant les vacances si demandé. */
function countOccurrences(firstDate, lastDate, intervalWeeks, suspendHolidays, zone) {
  if (!firstDate || !lastDate || firstDate > lastDate) return 0
  const safeInterval = Math.max(1, Math.round(intervalWeeks))
  const pad = (n) => String(n).padStart(2, '0')
  let count = 0
  let current = new Date(firstDate + 'T00:00:00')
  const end    = new Date(lastDate   + 'T00:00:00')
  while (current <= end) {
    const iso = current.getFullYear() + '-' + pad(current.getMonth() + 1) + '-' + pad(current.getDate())
    if (!(suspendHolidays && zone != null && isVacances(iso, zone) != null)) count++
    current.setDate(current.getDate() + 7 * safeInterval)
  }
  return count
}

export default function RecurrencePanel({ lesson, onClose, onSaved, schoolZone = null }) {
  const isGroupe = lesson?.planningStatus === 'groupe'
  const seriesId = lesson?.recurrenceSeriesId ?? null
  const groupId  = isGroupe
    ? (lesson?._groupId ?? null)
    : (lesson?.recurrenceGroup ?? lesson?.recurrence_group ?? null)

  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  // Valeurs de la série — chargées depuis la base
  const [firstDate,     setFirstDate]     = useState('')
  const [lastDate,      setLastDate]      = useState('')
  const [intervalWeeks, setIntervalWeeks] = useState(1)
  // Suspendre pendant les vacances scolaires (activé si contextType ecole et zone fournie)
  const [suspendHolidays, setSuspendHolidays] = useState(false)

  // Fin d'année scolaire par défaut
  const defaultEndDate = (() => {
    const now = new Date()
    const y   = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
    return `${y}-06-30`
  })()

  useEffect(() => {
    if (!lesson) return
    let cancelled = false
    ;(async () => {
      try {
        let info = null
        if (isGroupe && seriesId) {
          info = await fetchGroupSeriesDateRange(seriesId)
        } else if (!isGroupe && groupId) {
          info = await fetchSeriesDateRange(groupId)
        }
        if (cancelled) return
        if (info) {
          setFirstDate(info.firstDate)
          setLastDate(info.lastDate)
          setIntervalWeeks(info.intervalWeeks)
        } else {
          // Série inexistante : initialiser depuis les props du cours
          setFirstDate(lesson.lessonDate ?? '')
          setLastDate(defaultEndDate)
          setIntervalWeeks(lesson.recurrenceIntervalWeeks ?? lesson.recurrence_interval_weeks ?? 1)
        }
        // Activer vacances par défaut si contexte école
        if (!cancelled && schoolZone) {
          const ctx = lesson.contextType ?? lesson.context_type ?? null
          setSuspendHolidays(ctx === 'ecole')
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Nombre d'occurrences selon les paramètres courants (recalculé en temps réel)
  const previewCount = useMemo(
    () => countOccurrences(firstDate, lastDate, intervalWeeks, suspendHolidays, schoolZone),
    [firstDate, lastDate, intervalWeeks, suspendHolidays, schoolZone]
  )

  const handleSave = async () => {
    if (!firstDate || !lastDate) { setError('Dates manquantes.'); return }
    if (firstDate > lastDate)    { setError('La première date doit être avant la dernière.'); return }
    setSaving(true)
    setError('')
    try {
      let count = 0
      if (isGroupe) {
        if (!seriesId) throw new Error('Pas de série récurrente associée à cette séance de groupe.')
        count = await updateGroupSessionRange({
          seriesId,
          groupId:              lesson._groupId,
          newStartDate:         firstDate,
          newEndDate:           lastDate,
          intervalWeeks,
          sessionTime:          lesson.lessonTime,
          durationMinutes:      lesson.durationMinutes,
          suspendDuringHolidays: suspendHolidays,
          zone:                 schoolZone,
        })
      } else {
        if (!groupId) throw new Error('Ce cours ne fait pas partie d\'une série récurrente.')
        count = await updateRecurrenceRange({
          groupId,
          newStartDate:         firstDate,
          newEndDate:           lastDate,
          intervalWeeks,
          suspendDuringHolidays: suspendHolidays,
          zone:                 schoolZone,
          template: {
            teacherId:       lesson.teacherId ?? lesson.teacher_id,
            studentId:       lesson._studentId ?? lesson.studentId ?? lesson.student_id,
            lessonTime:      lesson.lessonTime ?? lesson.lesson_time,
            durationMinutes: lesson.durationMinutes ?? lesson.duration_minutes,
            topic:           lesson.topic ?? 'Cours de guitare',
            notes:           lesson.notes ?? null,
            contextType:     lesson.contextType ?? lesson.context_type ?? null,
          },
        })
      }
      onSaved({ intervalWeeks, firstDate, lastDate, count })
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const fmt = (iso) => iso
    ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  const displayName = isGroupe
    ? (lesson?.studentName ?? 'Séance de groupe')
    : (lesson?.studentName ?? '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-void/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm glass-panel rounded-2xl p-6 shadow-2xl border border-border">
        {/* En-tête */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Repeat2 className="w-4 h-4 text-muted" />
            Récurrence
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">{displayName}</p>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Première occurrence */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                Première occurrence
              </label>
              <input
                type="date"
                value={firstDate}
                onChange={(e) => setFirstDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
              />
            </div>

            {/* Dernière occurrence */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                Dernière occurrence
              </label>
              <input
                type="date"
                value={lastDate}
                onChange={(e) => setLastDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle text-sm outline-none focus:border-guitar-600"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Actuellement : {fmt(lastDate)}
              </p>
            </div>

            {/* Intervalle */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Répétition</label>
              <div className="space-y-2">
                {INTERVAL_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setIntervalWeeks(value)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                      intervalWeeks === value
                        ? 'guitar-gradient text-white border-transparent'
                        : 'border-border-subtle hover:bg-surface-overlay'
                    }`}
                  >
                    <Repeat2 className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Vacances scolaires — visible uniquement si zone fournie */}
            {schoolZone && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={suspendHolidays}
                  onChange={(e) => setSuspendHolidays(e.target.checked)}
                  className="w-4 h-4 accent-guitar-600"
                />
                <span className="text-sm">Pas de cours pendant les vacances (zone {schoolZone})</span>
              </label>
            )}

            {/* Aperçu du nombre de séances */}
            {firstDate && lastDate && firstDate <= lastDate && (
              <p className="text-xs text-muted-foreground">
                → <strong>{previewCount}</strong> séance{previewCount > 1 ? 's' : ''} seront générées.
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-2 mt-4">
            {error}
          </p>
        )}

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat2 className="w-4 h-4" />}
            Appliquer
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-border-subtle text-sm font-medium hover:bg-surface-overlay transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
