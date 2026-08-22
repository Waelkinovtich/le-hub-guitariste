import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { Trash2, Copy } from 'lucide-react'
import { updateLesson } from '../services/lessons'
import { getSchoolColor } from '../utils/schoolColors'
import DeleteLessonModal from './DeleteLessonModal'

// ─── Constantes ───────────────────────────────────────────────────────────────

const START_HOUR     = 8
const END_HOUR       = 22
const TOTAL_SLOTS    = (END_HOUR - START_HOUR) * 4  // 56 créneaux de 15 min
const SLOT_H         = 18                            // px par créneau
const MOVE_THRESHOLD = 10                            // px avant activation du déplacement
const CESU_COLOR     = '#3b82f6'                     // bleu fixe pour cours particuliers
const RESERVED_OPACITY = 0.85                        // opacité du fond hachuré des créneaux réservés

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function slotToTimeStr(slot) {
  const totalMin = START_HOUR * 60 + slot * 15
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function timeToSlot(timeStr) {
  if (!timeStr) return 0
  const [h, m] = timeStr.split(':').map(Number)
  return (h - START_HOUR) * 4 + Math.floor(m / 15)
}

function durationToSlots(minutes) {
  return Math.max(1, Math.round(minutes / 15))
}

function groupByDay(lessons) {
  const map = {}
  for (const l of lessons) {
    if (!map[l.lessonDate]) map[l.lessonDate] = []
    map[l.lessonDate].push(l)
  }
  return map
}

function hasOverlap(lessonsByDay, excludeId, targetDay, targetStart, slotCount) {
  const dayLessons = (lessonsByDay[targetDay] ?? []).filter((l) => l.id !== excludeId)
  const targetEnd  = targetStart + slotCount - 1
  return dayLessons.some((l) => {
    const lStart = timeToSlot(l.lessonTime)
    const lEnd   = lStart + durationToSlots(l.durationMinutes ?? 45) - 1
    return targetStart <= lEnd && targetEnd >= lStart
  })
}

/**
 * Construit un index des créneaux réservés par date ISO, pour la semaine affichée.
 * Chaque créneau réservé est hebdomadaire (jourSemaine = 0..6 JS convention).
 * weekDays[i].iso → date ISO du jour. On filtre par jourSemaine.
 */
function indexReservedByDay(reservedSlots, weekDays) {
  const map = {}
  for (const day of weekDays) {
    const jourJs = new Date(day.iso + 'T12:00:00').getDay()  // évite les ambiguïtés de fuseau
    map[day.iso] = (reservedSlots ?? []).filter((s) => s.jourSemaine === jourJs)
  }
  return map
}

/** Vérifie si un créneau nouveau empiète sur un créneau réservé (même jour ISO). */
function hasReservedOverlap(reservedByDay, targetDay, targetStart, slotCount) {
  const slots = reservedByDay[targetDay] ?? []
  const targetEnd = targetStart + slotCount - 1
  return slots.some((rs) => {
    const rsStart = timeToSlot(rs.heureDebut)
    const rsEnd   = rsStart + durationToSlots(rs.dureeMinutes) - 1
    return targetStart <= rsEnd && targetEnd >= rsStart
  })
}

// ─── Composant principal ──────────────────────────────────────────────────────

/**
 * Grille hebdomadaire interactive (08:00–22:00, créneaux 15 min).
 *
 * Props :
 *   weekDays      — [{ label, dayNum, iso, isToday }]
 *   lessons       — cours de la semaine (lessonDate, lessonTime, durationMinutes, …)
 *   onNewLesson({ lessonDate, lessonTime, durationMinutes })
 *   onSelectLesson(lesson)
 */
/**
 * Grille hebdomadaire interactive (08:00–22:00, créneaux 15 min).
 *
 * Props :
 *   weekDays      — [{ label, dayNum, iso, isToday }]
 *   lessons       — cours de la semaine (lessonDate, lessonTime, durationMinutes, …)
 *   reservedSlots — créneaux réservés par école ({ jourSemaine, heureDebut, dureeMinutes, libelle, schoolName })
 *   onNewLesson({ lessonDate, lessonTime, durationMinutes })
 *   onSelectLesson(lesson)
 */
// onDeleteLesson : si fourni, le bouton poubelle appelle cette fonction au lieu
// d'ouvrir DeleteLessonModal — permet d'utiliser ce composant hors contexte "cours élèves"
// (ex. SchoolSchedulePage pour les créneaux disponibles par école).
export default function WeekGridPlanning({ weekDays, lessons, reservedSlots = [], onNewLesson, onSelectLesson, onDuplicate, onDeleteLesson }) {
  // ── État local des cours (permet la mise à jour optimiste sans reload) ─────
  const [localLessons, setLocalLessons] = useState(lessons)

  // Synchronise quand PlanningPage recharge (ajout, édition, etc.)
  useEffect(() => { setLocalLessons(lessons) }, [lessons])

  // ── Refs ──────────────────────────────────────────────────────────────────
  const gridRef    = useRef(null)
  // Mode A : tracé d'un nouveau créneau
  const newSlotRef = useRef({ active: false, day: null, startSlot: null, endSlot: null, pointerId: null })
  // Mode B : déplacement d'un cours existant
  const moveRef    = useRef({
    pending: false, active: false,
    lesson: null, origDay: null, origStartSlot: null, slotCount: 0,
    currentDay: null, currentStartSlot: null,
    grabOffset: 0, startX: 0, startY: 0, pointerId: null,
  })

  // ── États visuels ─────────────────────────────────────────────────────────
  const [selection,  setSelection]  = useState(null)  // Mode A : { day, startSlot, endSlot }
  const [movePreview, setMovePreview] = useState(null) // { day, startSlot, slotCount, lessonId }
  const [moveError,  setMoveError]  = useState('')
  const [isDragging, setIsDragging] = useState(false)
  // Cours en attente de confirmation de suppression (réutilise DeleteLessonModal,
  // déjà utilisé sur Émargement — même service deleteLesson, aucune logique dupliquée)
  const [deleteLessonItem, setDeleteLessonItem] = useState(null)

  const lessonsByDay    = useMemo(() => groupByDay(localLessons), [localLessons])
  const reservedByDay   = useMemo(() => indexReservedByDay(reservedSlots, weekDays), [reservedSlots, weekDays])

  const allSchoolNames = useMemo(() => {
    const names = new Set()
    for (const l of localLessons) { if (l.schoolName) names.add(l.schoolName) }
    return [...names].sort()
  }, [localLessons])

  const lessonColor = useCallback((lesson) => {
    if (!lesson.schoolName || lesson.lessonType === 'particulier') return CESU_COLOR
    return getSchoolColor(lesson.schoolName, allSchoolNames)
  }, [allSchoolNames])

  // ── Recherche de cellule sous le pointeur ─────────────────────────────────
  const cellAt = useCallback((x, y) => {
    const el = document.elementFromPoint(x, y)
    return el?.closest('[data-slot]') ?? null
  }, [])

  // ── Affichage d'une erreur temporaire ─────────────────────────────────────
  const showMoveError = useCallback((msg) => {
    setMoveError(msg)
    setTimeout(() => setMoveError(''), 4000)
  }, [])

  // ── Mode A : nouveau créneau ──────────────────────────────────────────────

  const startNewSlot = useCallback((e, dayIso, slotIdx) => {
    newSlotRef.current = { active: true, day: dayIso, startSlot: slotIdx, endSlot: slotIdx, pointerId: e.pointerId }
    gridRef.current?.setPointerCapture(e.pointerId)
    setIsDragging(true)
    setSelection({ day: dayIso, startSlot: slotIdx, endSlot: slotIdx })
  }, [])

  const updateNewSlot = useCallback((x, y) => {
    if (!newSlotRef.current.active) return
    const cell = cellAt(x, y)
    if (!cell) return
    const cellDay  = cell.dataset.day
    const cellSlot = parseInt(cell.dataset.slot, 10)
    if (cellDay !== newSlotRef.current.day || cellSlot === newSlotRef.current.endSlot) return
    newSlotRef.current.endSlot = cellSlot
    setSelection({ day: newSlotRef.current.day, startSlot: newSlotRef.current.startSlot, endSlot: cellSlot })
  }, [cellAt])

  const endNewSlot = useCallback(() => {
    if (!newSlotRef.current.active) return
    const { day, startSlot, endSlot } = newSlotRef.current
    newSlotRef.current = { active: false, day: null, startSlot: null, endSlot: null, pointerId: null }
    setSelection(null)
    setIsDragging(false)
    const minSlot  = Math.min(startSlot, endSlot)
    const maxSlot  = Math.max(startSlot, endSlot)
    const slotCount = maxSlot - minSlot + 1
    // Bloquer la création si le créneau chevauche un créneau réservé
    if (hasReservedOverlap(reservedByDay, day, minSlot, slotCount)) {
      showMoveError("Ce créneau est réservé pour une intervention école — impossible d'y ajouter un cours.")
      return
    }
    onNewLesson({ lessonDate: day, lessonTime: slotToTimeStr(minSlot), durationMinutes: slotCount * 15 })
  }, [onNewLesson, reservedByDay, showMoveError])

  // ── Mode B : déplacement d'un cours ──────────────────────────────────────

  const startMove = useCallback((e, lesson, day, startSlot, slotCount) => {
    // nonMovable : créneaux école ou tout bloc qu'on veut rendre non-déplaçable
    if (lesson.nonMovable) { onSelectLesson?.(lesson); return }
    const clickedSlot = parseInt(cellAt(e.clientX, e.clientY)?.dataset.slot ?? startSlot, 10)
    const grabOffset  = Math.max(0, Math.min(clickedSlot - startSlot, slotCount - 1))
    moveRef.current = {
      pending: true, active: false,
      lesson, origDay: day, origStartSlot: startSlot, slotCount,
      currentDay: day, currentStartSlot: startSlot,
      grabOffset, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId,
    }
    gridRef.current?.setPointerCapture(e.pointerId)
  }, [cellAt])

  const updateMove = useCallback((x, y) => {
    const m = moveRef.current
    if (!m.pending && !m.active) return
    const dx = x - m.startX
    const dy = y - m.startY
    if (!m.active) {
      if (Math.sqrt(dx * dx + dy * dy) < MOVE_THRESHOLD) return
      moveRef.current.active = true
      setIsDragging(true)
    }
    const cell = cellAt(x, y)
    if (!cell) return
    const targetDay  = cell.dataset.day
    const targetSlot = parseInt(cell.dataset.slot, 10)
    const snapped    = Math.max(0, Math.min(targetSlot - m.grabOffset, TOTAL_SLOTS - m.slotCount))
    if (targetDay === m.currentDay && snapped === m.currentStartSlot) return
    moveRef.current.currentDay       = targetDay
    moveRef.current.currentStartSlot = snapped
    setMovePreview({ day: targetDay, startSlot: snapped, slotCount: m.slotCount, lessonId: m.lesson.id })
  }, [cellAt])

  const endMove = useCallback(async () => {
    // Capture les valeurs avant de réinitialiser le ref
    const m = { ...moveRef.current }
    moveRef.current = {
      pending: false, active: false, lesson: null, origDay: null, origStartSlot: null,
      slotCount: 0, currentDay: null, currentStartSlot: null, grabOffset: 0,
      startX: 0, startY: 0, pointerId: null,
    }
    setMovePreview(null)
    setIsDragging(false)

    if (!m.pending && !m.active) return

    // Clic simple (< seuil) → ouvre la modale d'édition
    if (!m.active) {
      onSelectLesson(m.lesson)
      return
    }

    // Pas de déplacement réel
    if (m.currentDay === m.origDay && m.currentStartSlot === m.origStartSlot) return

    // Vérification de chevauchement avec les cours existants
    if (hasOverlap(lessonsByDay, m.lesson.id, m.currentDay, m.currentStartSlot, m.slotCount)) {
      showMoveError('Ce créneau est déjà occupé par un autre cours.')
      return
    }
    // Vérification de chevauchement avec les créneaux réservés
    if (hasReservedOverlap(reservedByDay, m.currentDay, m.currentStartSlot, m.slotCount)) {
      showMoveError('Ce créneau est réservé pour une intervention école — déplacement impossible.')
      return
    }

    const newTime = slotToTimeStr(m.currentStartSlot)
    const { lesson } = m

    // ── Mise à jour optimiste (immédiate, sans spinner) ─────────────────────
    setLocalLessons((prev) => prev.map((l) =>
      l.id === lesson.id
        ? { ...l, lessonDate: m.currentDay, lessonTime: newTime, timeLabel: newTime }
        : l
    ))

    // ── Persistance serveur en arrière-plan ─────────────────────────────────
    try {
      await updateLesson(lesson.id, {
        studentId:       lesson.studentId,
        lessonDate:      m.currentDay,
        lessonTime:      newTime,
        durationMinutes: lesson.durationMinutes,
        topic:           lesson.topic ?? '',
        notes:           lesson.notes ?? null,
      })
      // Succès : l'état local est déjà correct, rien de plus à faire
    } catch (err) {
      // Échec : rollback immédiat vers la position d'origine
      setLocalLessons((prev) => prev.map((l) =>
        l.id === lesson.id ? lesson : l
      ))
      showMoveError(err.message ?? 'Impossible de déplacer le cours — annulation.')
    }
  }, [lessonsByDay, onSelectLesson, showMoveError])

  // ── Handlers pointer du conteneur de grille ───────────────────────────────

  const handlePointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return
    const cell = e.target.closest('[data-slot]')
    if (!cell) return
    e.preventDefault()
    startNewSlot(e, cell.dataset.day, parseInt(cell.dataset.slot, 10))
  }, [startNewSlot])

  const handlePointerMove = useCallback((e) => {
    if (moveRef.current.pending || moveRef.current.active) {
      updateMove(e.clientX, e.clientY)
    } else if (newSlotRef.current.active) {
      updateNewSlot(e.clientX, e.clientY)
    }
  }, [updateMove, updateNewSlot])

  const handlePointerUp = useCallback(() => {
    if (moveRef.current.pending || moveRef.current.active) {
      endMove()
    } else {
      endNewSlot()
    }
  }, [endMove, endNewSlot])

  const handlePointerCancel = useCallback(() => {
    newSlotRef.current = { active: false, day: null, startSlot: null, endSlot: null, pointerId: null }
    moveRef.current    = { pending: false, active: false }
    setSelection(null)
    setMovePreview(null)
    setIsDragging(false)
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  const totalH = TOTAL_SLOTS * SLOT_H

  return (
    <div className="glass-panel rounded-2xl overflow-hidden select-none">
      {/* Message d'erreur déplacement */}
      {moveError && (
        <div className="px-4 py-2.5 bg-guitar-600/15 border-b border-guitar-600/30 text-sm text-guitar-400 font-medium">
          {moveError}
        </div>
      )}

      {/* En-têtes des jours */}
      <div
        className="grid border-b border-border-subtle bg-surface/80 sticky top-0 z-20"
        style={{ gridTemplateColumns: `3rem repeat(${weekDays.length}, 1fr)` }}
      >
        <div className="py-2" />
        {weekDays.map((day) => (
          <div
            key={day.iso}
            className={`py-2 text-center border-l border-border-subtle ${day.isToday ? 'text-guitar-400' : 'text-muted-foreground'}`}
          >
            <p className="text-[10px] font-medium uppercase tracking-wider">{day.label}</p>
            <p className={`text-lg font-semibold leading-tight ${day.isToday ? 'text-guitar-400' : ''}`}>{day.dayNum}</p>
          </div>
        ))}
      </div>

      {/* Zone scrollable */}
      <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
        <div
          ref={gridRef}
          className="grid cursor-crosshair"
          style={{
            gridTemplateColumns: `3rem repeat(${weekDays.length}, 1fr)`,
            height: totalH,
            touchAction: isDragging ? 'none' : 'pan-y',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {/* Colonne des heures */}
          <div className="relative z-10 pointer-events-none">
            {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
              <div key={i} style={{ height: SLOT_H, top: i * SLOT_H, position: 'absolute', left: 0, right: 0 }}>
                {i % 4 === 0 && (
                  <span className="absolute right-1.5 -top-2 text-[9px] text-muted/60 font-mono">
                    {slotToTimeStr(i)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Colonnes des jours */}
          {weekDays.map((day) => {
            const dayLessons = lessonsByDay[day.iso] ?? []

            return (
              <div key={day.iso} className="relative border-l border-border-subtle">
                {/* Créneaux réservés — affichés avant les lignes de fond pour être derrière les cours,
                    mais avec pointer-events qui stoppent la propagation pour bloquer la création */}
                {(reservedByDay[day.iso] ?? []).map((rs) => {
                  const rsStart  = timeToSlot(rs.heureDebut)
                  const rsSlots  = durationToSlots(rs.dureeMinutes)
                  const rsColor  = rs.schoolName
                    ? getSchoolColor(rs.schoolName, allSchoolNames)
                    : '#6b7280'
                  if (rsStart < 0 || rsStart >= TOTAL_SLOTS) return null
                  return (
                    <div
                      key={rs.id}
                      style={{
                        top:    rsStart * SLOT_H,
                        height: Math.min(rsSlots, TOTAL_SLOTS - rsStart) * SLOT_H,
                        left: 0, right: 0,
                        position: 'absolute', zIndex: 8,
                        // Motif hachuré : fond semi-transparent + diagonales pour distinguer visuellement
                        // d'un cours élève (qui a un fond uni). Pattern via repeating-linear-gradient.
                        background: `repeating-linear-gradient(
                          45deg,
                          ${rsColor}22 0px,
                          ${rsColor}22 4px,
                          ${rsColor}08 4px,
                          ${rsColor}08 10px
                        )`,
                        borderLeft:  `3px dashed ${rsColor}`,
                        borderTop:   `1px solid ${rsColor}30`,
                        pointerEvents: 'all',
                        cursor: 'not-allowed',
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      title={`Réservé : ${rs.libelle || rs.schoolName || 'Intervention école'} (${rs.heureDebut}, ${rs.dureeMinutes} min)`}
                    >
                      <div className="px-1 py-0.5 overflow-hidden h-full flex flex-col justify-start">
                        <p className="text-[9px] font-semibold leading-tight truncate" style={{ color: rsColor, opacity: RESERVED_OPACITY }}>
                          🔒 {rs.libelle || 'Réservé'}
                        </p>
                        {rsSlots >= 3 && (
                          <p className="text-[8px] leading-tight opacity-60" style={{ color: rsColor }}>
                            {rs.heureDebut} · {rs.dureeMinutes} min
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Lignes de fond */}
                {Array.from({ length: TOTAL_SLOTS }).map((_, slotIdx) => {
                  const isHour  = slotIdx % 4 === 0
                  const isHalfH = slotIdx % 2 === 0
                  const inSel   =
                    selection?.day === day.iso &&
                    slotIdx >= Math.min(selection.startSlot, selection.endSlot) &&
                    slotIdx <= Math.max(selection.startSlot, selection.endSlot)

                  return (
                    <div
                      key={slotIdx}
                      data-day={day.iso}
                      data-slot={slotIdx}
                      style={{ height: SLOT_H, top: slotIdx * SLOT_H, position: 'absolute', left: 0, right: 0 }}
                      className={[
                        'transition-colors',
                        isHour  ? 'border-t border-border-subtle/60'
                                : isHalfH ? 'border-t border-border-subtle/25' : '',
                        inSel   ? 'bg-guitar-600/20'
                                : day.isToday ? 'bg-guitar-600/3 hover:bg-guitar-600/8' : 'hover:bg-surface-overlay/50',
                      ].join(' ')}
                    />
                  )
                })}

                {/* Aperçu de déplacement (fantôme) */}
                {movePreview?.day === day.iso && (() => {
                  const { startSlot, slotCount, lessonId } = movePreview
                  const lesson = localLessons.find((l) => l.id === lessonId)
                  const color  = lesson ? lessonColor(lesson) : '#6b7280'
                  return (
                    <div
                      style={{
                        top: startSlot * SLOT_H,
                        height: Math.min(slotCount, TOTAL_SLOTS - startSlot) * SLOT_H,
                        left: 2, right: 2,
                        position: 'absolute', zIndex: 20,
                        opacity: 0.6, pointerEvents: 'none',
                      }}
                      className="rounded overflow-hidden"
                    >
                      <div
                        className="h-full px-1 py-0.5"
                        style={{ background: color + '40', borderLeft: `3px solid ${color}` }}
                      />
                    </div>
                  )
                })()}

                {/* Cours existants */}
                {dayLessons.map((lesson) => {
                  const startSlot    = timeToSlot(lesson.lessonTime)
                  const slotCount    = durationToSlots(lesson.durationMinutes ?? 45)
                  const color        = lessonColor(lesson)
                  const isEnvisage   = lesson.planningStatus === 'envisage'
                  const isBeingMoved = movePreview?.lessonId === lesson.id

                  if (startSlot < 0 || startSlot >= TOTAL_SLOTS) return null

                  return (
                    <div
                      key={lesson.id}
                      style={{
                        top: startSlot * SLOT_H,
                        height: Math.min(slotCount, TOTAL_SLOTS - startSlot) * SLOT_H,
                        left: 2, right: 2,
                        position: 'absolute', zIndex: 10,
                        opacity: isBeingMoved ? 0.25 : isEnvisage ? 0.6 : 1,
                        cursor: 'grab',
                      }}
                      className="rounded overflow-hidden group"
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        startMove(e, lesson, day.iso, startSlot, slotCount)
                      }}
                      title={`${lesson.studentName ?? 'Élève'} — ${lesson.timeLabel} (${lesson.durationMinutes} min)`}
                    >
                      <div
                        className="h-full px-1 py-0.5 flex flex-col gap-0.5 overflow-hidden"
                        style={{
                          background:  color + '30',
                          borderLeft: `3px ${isEnvisage ? 'dashed' : 'solid'} ${color}`,
                        }}
                      >
                        <p className="text-[10px] font-semibold leading-tight truncate" style={{ color }}>
                          {lesson.studentName || 'Élève'}
                        </p>
                        {slotCount >= 3 && (
                          <p className="text-[9px] leading-tight opacity-70" style={{ color }}>
                            {lesson.timeLabel} · {lesson.durationMinutes} min
                          </p>
                        )}
                      </div>

                      {/* Actions rapides (survol/focus) — propagation stoppée pour ne pas
                          déclencher le drag ni l'ouverture de l'édition */}

                      {/* Suppression */}
                      <button
                        type="button"
                        aria-label="Supprimer ce cours"
                        title="Supprimer ce cours"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); onDeleteLesson ? onDeleteLesson(lesson) : setDeleteLessonItem(lesson) }}
                        className="absolute top-0 right-0 z-20 p-0.5 rounded-bl-md bg-void/50 text-white/80
                                   opacity-0 group-hover:opacity-100 hover:text-guitar-400 transition-opacity
                                   focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-guitar-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>

                      {/* Duplication — pré-remplit élève/durée/sujet, date à préciser */}
                      {onDuplicate && (
                        <button
                          type="button"
                          aria-label="Dupliquer ce cours"
                          title="Dupliquer ce cours (élève et durée pré-remplis)"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); onDuplicate(lesson) }}
                          className="absolute bottom-0 right-0 z-20 p-0.5 rounded-tl-md bg-void/50 text-white/80
                                     opacity-0 group-hover:opacity-100 hover:text-guitar-400 transition-opacity
                                     focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-guitar-400"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {deleteLessonItem && (
        <DeleteLessonModal
          lesson={deleteLessonItem}
          onClose={() => setDeleteLessonItem(null)}
          onDeleted={() => {
            // Mise à jour optimiste immédiate, même principe que le déplacement :
            // pas d'attente d'un rechargement réseau pour retirer le cours de la grille.
            setLocalLessons((prev) => prev.filter((l) => l.id !== deleteLessonItem.id))
          }}
        />
      )}
    </div>
  )
}
