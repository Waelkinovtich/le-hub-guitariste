import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { Trash2, Copy, UserRound, ChevronLeft, ChevronRight, Clock, Loader2, X } from 'lucide-react'
import { updateLesson } from '../services/lessons'
import { getSchoolColor, SCHOOL_COLOR_DEFAULT } from '../utils/schoolColors'
import DeleteLessonModal from './DeleteLessonModal'
import { supabase } from '../lib/supabase'

// ─── Constantes ───────────────────────────────────────────────────────────────

// Durées sélectionnables depuis la grille (identique à DUREES_SONDAGE côté SurveyResultsPage).
const DUREES_MODIFIABLES = [15, 30, 45, 60, 90, 120]

const START_HOUR     = 8
const END_HOUR       = 22
const TOTAL_SLOTS    = (END_HOUR - START_HOUR) * 4  // 56 créneaux de 15 min
const SLOT_H         = 18                            // px par créneau en vue semaine
const SLOT_H_JOUR    = 32                            // px par créneau en vue jour (plus lisible)
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

// Calcule l'index de colonne et le nombre total de colonnes UNIQUEMENT pour les
// leçons en conflit qui se chevauchent entre elles. Seules les leçons conflit
// participent à ce calcul — les cours réels et propositions conservent leur
// pleine largeur (colIdx:0, colCount:1) indépendamment des conflits.
// L'ordre dans chaque groupe est stabilisé par l'id pour un rendu déterministe.
function computeConflictColumns(conflitLessons) {
  const result = new Map()
  for (const lesson of conflitLessons) {
    const start = timeToSlot(lesson.lessonTime)
    const end   = start + durationToSlots(lesson.durationMinutes ?? 45)
    // Groupe = toutes les leçons conflit qui chevauchent temporellement celle-ci
    const group = conflitLessons
      .filter((other) => {
        const oStart = timeToSlot(other.lessonTime)
        const oEnd   = oStart + durationToSlots(other.durationMinutes ?? 45)
        return oStart < end && oEnd > start
      })
      // Comparateur strict : retourne 0 pour ids égaux (sort stable garanti)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    result.set(lesson.id, {
      colIdx:   group.findIndex((o) => o.id === lesson.id),
      colCount: group.length,
    })
  }
  return result
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

/** Retourne le premier cours chevauchant (excluant excludeId), ou null. Utilisé pour la cascade DnD. */
function findOverlappingLesson(lessonsByDay, excludeId, targetDay, targetStart, slotCount) {
  const dayLessons = (lessonsByDay[targetDay] ?? []).filter((l) => l.id !== excludeId)
  const targetEnd  = targetStart + slotCount - 1
  return dayLessons.find((l) => {
    const lStart = timeToSlot(l.lessonTime)
    const lEnd   = lStart + durationToSlots(l.durationMinutes ?? 45) - 1
    return targetStart <= lEnd && targetEnd >= lStart
  }) ?? null
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

// ─── Panneau de modification de durée ────────────────────────────────────────
/**
 * Approche de persistance (priorité décroissante) :
 *   1. Si l'élève est connu (_studentId) : met à jour student_contexts.duree_cours_minutes
 *      → durée contractuelle la plus haute priorité dans le moteur de scoring.
 *   2. Sinon : met à jour survey_responses.desired_duration_minutes (_responseId).
 * Après sauvegarde, appelle onSaved(newMinutes) pour que le parent
 * mette à jour responses[].effective_duration_minutes et déclenche le recalcul.
 */
function DurationEditPanel({ lesson, onClose, onSaved }) {
  const [selected, setSelected] = useState(lesson.durationMinutes ?? 30)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const handleSave = async () => {
    if (selected === lesson.durationMinutes) { onClose(); return }
    setSaving(true)
    setError('')
    try {
      if (lesson._studentId) {
        // Cherche un contexte existant avant de créer (pas de contrainte unique garantie côté SQL)
        // PostgreSQL distingue NULL et '' : .eq('school_name', '') ne matche pas les lignes IS NULL.
        let ctxQuery = supabase
          .from('student_contexts')
          .select('id')
          .eq('student_id', lesson._studentId)
        ctxQuery = lesson.schoolName
          ? ctxQuery.eq('school_name', lesson.schoolName)
          : ctxQuery.is('school_name', null)
        const { data: ctx } = await ctxQuery.maybeSingle()

        if (ctx) {
          const { error: updErr } = await supabase
            .from('student_contexts')
            .update({ duree_cours_minutes: selected })
            .eq('id', ctx.id)
          if (updErr) throw new Error(updErr.message)
        } else {
          const { error: insErr } = await supabase
            .from('student_contexts')
            .insert({ student_id: lesson._studentId, school_name: lesson.schoolName || null, duree_cours_minutes: selected })
          if (insErr) throw new Error(insErr.message)
        }
      } else if (lesson._responseId) {
        const { error: updErr } = await supabase
          .from('survey_responses')
          .update({ desired_duration_minutes: selected })
          .eq('id', lesson._responseId)
        if (updErr) throw new Error(updErr.message)
      }
      onSaved(selected)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-void/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm glass-panel rounded-2xl p-6 shadow-2xl border border-border">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted" />
            Durée du cours
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-overlay transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          {lesson.studentName} —{' '}
          {lesson._studentId
            ? 'modifie la durée dans la fiche élève (priorité haute)'
            : 'modifie la durée dans la réponse au sondage'}
        </p>

        <div className="grid grid-cols-3 gap-2 mb-5">
          {DUREES_MODIFIABLES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setSelected(d)}
              className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                selected === d
                  ? 'guitar-gradient text-white border-transparent shadow-md shadow-guitar-600/20'
                  : 'border-border-subtle text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              {d} min
            </button>
          ))}
        </div>

        {error && (
          <p className="text-xs text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-2 mb-3">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl guitar-gradient text-white text-sm font-medium disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            Enregistrer
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

// ─── Composant principal ──────────────────────────────────────────────────────

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
// onMoveLesson : si fourni, remplace l'appel à updateLesson lors du déplacement.
// Signature : onMoveLesson({ lesson, newDate, newTime, durationMinutes }) → Promise<void>
// Utile pour les pages qui affichent des "faux cours" non persistés dans la table lessons.
// onDragStart(lesson) : appelé quand un drag commence — permet à l'appelant de calculer
//   les zones valides à surligner (ex : disponibilités déclarées par un élève).
// onDragEnd() : appelé à la fin du drag (dépôt ou annulation).
// validDropZones : zones à surligner pendant le drag (fond vert léger) :
//   [{ date: 'YYYY-MM-DD', startTime: 'HH:MM', durationMinutes: 15 }]
// onViewStudent(lesson) : appelé au clic sur "Voir la fiche" d'une proposition planifiée
//   (tuiles envisage/conflit uniquement). Permet d'ouvrir la fiche élève depuis la grille.
// onDurationChange(lesson, newMinutes) : appelé après sauvegarde en base pour que
// le parent mette à jour effective_duration_minutes et relance le calcul de propositions.
// allowOverlap : quand true, un dépôt sur un emplacement occupé n'est pas bloqué.
// Réservé au mode édition provisoire (SchedulingAssistantPage) — PlanningPage laisse false.
// L'appelant doit signaler les chevauchements résiduels avant toute validation finale.
// conflictSelectedIds : Set<responseId> des leçons en conflit sélectionnées pour regroupement.
// onToggleConflictSelect(responseId) : appelé au clic sur une leçon planningStatus:'conflit'.
// cascadeEnabled : quand true, un dépôt sur une proposition déplaçable déclenche onCascadeRequest.
// onCascadeRequest(displacedLesson, newDay, newTime, durationMinutes) : intercepte le DnD
//   pour que le parent recalcule un créneau alternatif pour la leçon déplacée.
export default function WeekGridPlanning({ weekDays, lessons, reservedSlots = [], validDropZones = [], onNewLesson, onSelectLesson, onDuplicate, onDeleteLesson, onMoveLesson, onDragStart, onDragEnd, onViewStudent, onDurationChange, allowOverlap = false, conflictSelectedIds = null, onToggleConflictSelect = null, cascadeEnabled = false, onCascadeRequest = null }) {
  // ── État local des cours (permet la mise à jour optimiste sans reload) ─────
  const [localLessons, setLocalLessons] = useState(lessons)

  // Synchronise quand PlanningPage recharge (ajout, édition, etc.)
  useEffect(() => { setLocalLessons(lessons) }, [lessons])

  // ── Vue : 'semaine' (grille 7 colonnes) ou 'jour' (colonne unique) ────────
  const [vueMode,   setVueMode]   = useState('semaine')
  // Index du jour actif dans weekDays (0 = premier jour de la semaine).
  // Initialisé sur "aujourd'hui" s'il est dans la semaine, sinon sur le premier jour.
  const [jourIdx, setJourIdx] = useState(() => {
    const todayIso = new Date().toISOString().slice(0, 10)
    const idx = weekDays.findIndex((d) => d.iso === todayIso)
    return idx >= 0 ? idx : 0
  })
  // Resynchronise si la semaine change (weekOffset) — on reste sur le même numéro de jour si possible.
  useEffect(() => {
    setJourIdx((prev) => Math.min(prev, weekDays.length - 1))
  }, [weekDays])

  // Jours effectivement affichés : tous en mode semaine, un seul en mode jour.
  const activeDays = vueMode === 'jour' ? [weekDays[jourIdx] ?? weekDays[0]] : weekDays
  // Hauteur d'un créneau selon la vue
  const slotH = vueMode === 'jour' ? SLOT_H_JOUR : SLOT_H

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
  const [deleteLessonItem,   setDeleteLessonItem]   = useState(null)
  // Proposition dont on modifie la durée depuis la grille (ouvre DurationEditPanel)
  const [durationEditLesson, setDurationEditLesson] = useState(null)

  const lessonsByDay    = useMemo(() => groupByDay(localLessons), [localLessons])
  const reservedByDay   = useMemo(() => indexReservedByDay(reservedSlots, weekDays), [reservedSlots, weekDays])

  // Ids des cours en chevauchement actif (uniquement utile quand allowOverlap=true).
  // En mode édition provisoire, deux propositions peuvent temporairement se superposer
  // en attendant que l'utilisateur réorganise — signalé en orange dans la grille.
  const idsEnChevauchement = useMemo(() => {
    if (!allowOverlap) return new Set()
    const ids = new Set()
    for (const dayLessons of Object.values(lessonsByDay)) {
      for (let i = 0; i < dayLessons.length; i++) {
        for (let j = i + 1; j < dayLessons.length; j++) {
          const aStart = timeToSlot(dayLessons[i].lessonTime)
          const aEnd   = aStart + durationToSlots(dayLessons[i].durationMinutes ?? 45)
          const bStart = timeToSlot(dayLessons[j].lessonTime)
          const bEnd   = bStart + durationToSlots(dayLessons[j].durationMinutes ?? 45)
          if (aStart < bEnd && aEnd > bStart) {
            ids.add(dayLessons[i].id)
            ids.add(dayLessons[j].id)
          }
        }
      }
    }
    return ids
  }, [lessonsByDay, allowOverlap])

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
  // elementsFromPoint (pluriel) traverse TOUS les éléments au point donné, dans
  // l'ordre de rendu (topmost d'abord). Indispensable ici : les tuiles de cours
  // (zIndex: 10) masquent les cellules [data-slot] à elementFromPoint classique,
  // ce qui retournait null → grabOffset/updateMove cassés.
  const cellAt = useCallback((x, y) => {
    const elements = document.elementsFromPoint(x, y)
    return elements.find((el) => el.hasAttribute?.('data-slot')) ?? null
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

  // grabOffset : nombre de créneaux entre le haut de la tuile et le point de saisie.
  // Calculé par l'appelant (onPointerDown) depuis getBoundingClientRect(), puis passé ici.
  // Ne plus utiliser cellAt ici : la tuile (zIndex 10) masque [data-slot] à elementFromPoint.
  const startMove = useCallback((e, lesson, day, startSlot, slotCount, grabOffset = 0) => {
    // nonMovable : créneaux école ou tout bloc qu'on veut rendre non-déplaçable
    if (lesson.nonMovable) { onSelectLesson?.(lesson); return }
    moveRef.current = {
      pending: true, active: false,
      lesson, origDay: day, origStartSlot: startSlot, slotCount,
      currentDay: day, currentStartSlot: startSlot,
      grabOffset, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId,
    }
    gridRef.current?.setPointerCapture(e.pointerId)
    // Notifier l'appelant pour qu'il affiche les zones valides (ex. disponibilités élève)
    onDragStart?.(lesson)
  }, [onDragStart])

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
    // Fin du drag — l'appelant masque les zones surlignées
    onDragEnd?.()

    if (!m.pending && !m.active) return

    // Clic simple (< seuil) : leçon en conflit → toggle sélection pour regroupement ;
    // sinon ouvre la modale d'édition standard.
    if (!m.active) {
      if (m.lesson.planningStatus === 'conflit' && onToggleConflictSelect) {
        onToggleConflictSelect(m.lesson._responseId)
      } else {
        onSelectLesson(m.lesson)
      }
      return
    }

    // Pas de déplacement réel
    if (m.currentDay === m.origDay && m.currentStartSlot === m.origStartSlot) return

    // Vérification de chevauchement avec les cours existants.
    // En mode allowOverlap (planning provisoire), le dépôt est autorisé même en cas de
    // chevauchement — la grille l'affiche en orange pour inviter à résoudre avant validation.
    if (hasOverlap(lessonsByDay, m.lesson.id, m.currentDay, m.currentStartSlot, m.slotCount)) {
      if (!allowOverlap) {
        showMoveError('Ce créneau est déjà occupé par un autre cours.')
        return
      }
      // Mode cascade : délègue au parent qui recalcule un créneau alternatif pour la leçon déplacée.
      if (cascadeEnabled && onCascadeRequest) {
        const displaced = findOverlappingLesson(lessonsByDay, m.lesson.id, m.currentDay, m.currentStartSlot, m.slotCount)
        if (displaced?._responseId) {
          // Passe aussi la leçon en cours de drag pour que le parent mette à jour les deux overrides.
          onCascadeRequest(m.lesson, displaced, m.currentDay, slotToTimeStr(m.currentStartSlot), m.lesson.durationMinutes)
          // Le parent gère les deux overrides — pas d'optimiste local ni d'appel onMoveLesson.
          return
        }
      }
      // Mode provisoire sans cascade : avertissement temporaire visible 2 s
      showMoveError('Chevauchement temporaire — résolvez-le avant d\'acter le planning.')
    }
    // Les créneaux réservés (écoles) restent bloquants en toutes circonstances.
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
      if (onMoveLesson) {
        // Mode externe : l'appelant gère la persistance (ex. school_schedules)
        await onMoveLesson({ lesson, newDate: m.currentDay, newTime, durationMinutes: lesson.durationMinutes })
      } else {
        await updateLesson(lesson.id, {
          studentId:       lesson.studentId,
          lessonDate:      m.currentDay,
          lessonTime:      newTime,
          durationMinutes: lesson.durationMinutes,
          topic:           lesson.topic ?? '',
          notes:           lesson.notes ?? null,
        })
      }
      // Succès : l'état local est déjà correct, rien de plus à faire
    } catch (err) {
      // Échec : rollback immédiat vers la position d'origine
      setLocalLessons((prev) => prev.map((l) =>
        l.id === lesson.id ? lesson : l
      ))
      showMoveError(err.message ?? 'Impossible de déplacer le cours — annulation.')
    }
  }, [lessonsByDay, onSelectLesson, showMoveError, onMoveLesson])

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
    onDragEnd?.()
  }, [onDragEnd])

  // ── Render ────────────────────────────────────────────────────────────────

  const totalH = TOTAL_SLOTS * slotH

  return (
    <div className="glass-panel rounded-2xl overflow-hidden select-none">
      {/* Barre de vue Semaine / Jour */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border-subtle bg-surface/80">
        <div className="flex gap-1 p-0.5 rounded-lg bg-surface-raised border border-border-subtle">
          <button
            type="button"
            onClick={() => setVueMode('semaine')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${vueMode === 'semaine' ? 'guitar-gradient text-white' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Semaine
          </button>
          <button
            type="button"
            onClick={() => setVueMode('jour')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${vueMode === 'jour' ? 'guitar-gradient text-white' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Jour
          </button>
        </div>

        {/* Navigation jour — visible uniquement en mode Jour */}
        {vueMode === 'jour' && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setJourIdx((i) => Math.max(0, i - 1))}
              disabled={jourIdx === 0}
              className="p-1 rounded-lg border border-border-subtle hover:bg-surface-overlay transition-colors disabled:opacity-30"
              aria-label="Jour précédent"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-medium min-w-[90px] text-center">
              {activeDays[0]?.label} {activeDays[0]?.dayNum}
            </span>
            <button
              type="button"
              onClick={() => setJourIdx((i) => Math.min(weekDays.length - 1, i + 1))}
              disabled={jourIdx === weekDays.length - 1}
              className="p-1 rounded-lg border border-border-subtle hover:bg-surface-overlay transition-colors disabled:opacity-30"
              aria-label="Jour suivant"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Message d'erreur déplacement */}
      {moveError && (
        <div className="px-4 py-2.5 bg-guitar-600/15 border-b border-guitar-600/30 text-sm text-guitar-400 font-medium">
          {moveError}
        </div>
      )}

      {/* En-têtes des jours */}
      <div
        className="grid border-b border-border-subtle bg-surface/80 sticky top-0 z-20"
        style={{ gridTemplateColumns: `3rem repeat(${activeDays.length}, 1fr)` }}
      >
        <div className="py-2" />
        {activeDays.map((day) => (
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
            gridTemplateColumns: `3rem repeat(${activeDays.length}, 1fr)`,
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
              <div key={i} style={{ height: slotH, top: i * slotH, position: 'absolute', left: 0, right: 0 }}>
                {i % 4 === 0 && (
                  <span className="absolute right-1.5 -top-2 text-[9px] text-muted/60 font-mono">
                    {slotToTimeStr(i)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Colonnes des jours */}
          {activeDays.map((day) => {
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
                    : SCHOOL_COLOR_DEFAULT
                  if (rsStart < 0 || rsStart >= TOTAL_SLOTS) return null
                  return (
                    <div
                      key={rs.id}
                      style={{
                        top:    rsStart * slotH,
                        height: Math.min(rsSlots, TOTAL_SLOTS - rsStart) * slotH,
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

                {/* Zones valides pour le drag en cours — surlignage vert léger pendant le glisser.
                    Affichées sous les cours (zIndex 7) mais au-dessus du fond de grille. */}
                {validDropZones.filter((z) => z.date === day.iso).map((z, i) => {
                  const zStart = timeToSlot(z.startTime)
                  const zSlots = durationToSlots(z.durationMinutes)
                  if (zStart < 0 || zStart >= TOTAL_SLOTS) return null
                  return (
                    <div
                      key={i}
                      style={{
                        top:    zStart * slotH,
                        height: Math.min(zSlots, TOTAL_SLOTS - zStart) * slotH,
                        left: 0, right: 0,
                        position: 'absolute', zIndex: 7,
                        background: '#22c55e14',
                        borderLeft: '2px solid #22c55e35',
                        pointerEvents: 'none',
                      }}
                    />
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
                      style={{ height: slotH, top: slotIdx * slotH, position: 'absolute', left: 0, right: 0 }}
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
                  const color  = lesson ? lessonColor(lesson) : SCHOOL_COLOR_DEFAULT
                  return (
                    <div
                      style={{
                        top: startSlot * slotH,
                        height: Math.min(slotCount, TOTAL_SLOTS - startSlot) * slotH,
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

                {/* Cours existants — affichage côte à côte pour les conflits superposés */}
                {(() => {
                  // Seules les leçons conflit participent au calcul de colonnes.
                  // Les cours réels et propositions restent toujours en pleine largeur.
                  const conflitDuJour    = dayLessons.filter((l) => l.planningStatus === 'conflit')
                  const conflictColumnMap = computeConflictColumns(conflitDuJour)

                  return dayLessons.map((lesson) => {
                  const startSlot    = timeToSlot(lesson.lessonTime)
                  const slotCount    = durationToSlots(lesson.durationMinutes ?? 45)
                  const color        = lessonColor(lesson)
                  const isEnvisage   = lesson.planningStatus === 'envisage'
                  const isConflit    = lesson.planningStatus === 'conflit'
                  const isGroupe     = lesson.planningStatus === 'groupe'
                  const isBeingMoved = movePreview?.lessonId === lesson.id
                  // Chevauchement temporaire autorisé (mode Planning intelligent) → signalé en orange
                  const isChevauchement = idsEnChevauchement.has(lesson.id)
                  // Leçon en conflit sélectionnée pour regroupement → bordure violette
                  const isConflitSelected = isConflit && conflictSelectedIds?.has(lesson._responseId)
                  // Cours réels et propositions : pleine largeur. Conflits : colonnes calculées.
                  const { colIdx, colCount } = isConflit
                    ? (conflictColumnMap.get(lesson.id) ?? { colIdx: 0, colCount: 1 })
                    : { colIdx: 0, colCount: 1 }
                  const pct = 100 / colCount

                  if (startSlot < 0 || startSlot >= TOTAL_SLOTS) return null

                  return (
                    <div
                      key={lesson.id}
                      style={{
                        top: startSlot * slotH,
                        height: Math.min(slotCount, TOTAL_SLOTS - startSlot) * slotH,
                        left:  `calc(${colIdx * pct}% + 2px)`,
                        right: `calc(${(colCount - colIdx - 1) * pct}% + 2px)`,
                        position: 'absolute', zIndex: 10,
                        opacity: isBeingMoved ? 0.25 : (isEnvisage || isConflit) ? 0.75 : isGroupe ? 0.9 : 1,
                        cursor: 'grab',
                      }}
                      className="rounded overflow-hidden group"
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        // Offset exact du clic dans la tuile → le cours "suit" le doigt
                        // et non son bord supérieur. getBoundingClientRect() donne la
                        // position viewport réelle (scroll inclus), ce que cellAt ne
                        // pouvait pas fournir (tuile masquait les [data-slot]).
                        const rect = e.currentTarget.getBoundingClientRect()
                        const grabOffset = Math.max(0, Math.min(
                          Math.floor((e.clientY - rect.top) / slotH),
                          slotCount - 1
                        ))
                        startMove(e, lesson, day.iso, startSlot, slotCount, grabOffset)
                      }}
                      title={`${lesson.studentName ?? 'Élève'} — ${lesson.timeLabel} (${lesson.durationMinutes} min)`}
                    >
                      <div
                        className="h-full px-1 py-0.5 flex flex-col gap-0.5 overflow-hidden"
                        style={{
                          background: isChevauchement
                            // Orange ambre hachuré : signale visuellement un chevauchement temporaire à résoudre
                            ? 'repeating-linear-gradient(135deg, #f9731620 0px, #f9731620 4px, transparent 4px, transparent 10px)'
                            : isConflitSelected
                            // Violet hachuré : leçon sélectionnée pour regroupement en cours de groupe
                            ? 'repeating-linear-gradient(135deg, #a855f720 0px, #a855f720 4px, transparent 4px, transparent 10px)'
                            : isConflit
                            ? 'repeating-linear-gradient(135deg, #ef444420 0px, #ef444420 4px, transparent 4px, transparent 10px)'
                            : isGroupe
                            // Vert émeraude plein : cours de groupe confirmé, remplace les conflits
                            ? '#10b98130'
                            : color + '30',
                          borderLeft: `3px ${(isEnvisage || isConflit || isChevauchement) ? 'dashed' : 'solid'} ${isChevauchement ? '#f97316' : isConflitSelected ? '#a855f7' : isConflit ? '#ef4444' : isGroupe ? '#10b981' : color}`,
                          outline: isChevauchement ? '1px solid #f9731660' : isConflitSelected ? '2px solid #a855f7' : isGroupe ? '1px solid #10b98160' : undefined,
                        }}
                      >
                        <p className="text-[10px] font-semibold leading-tight truncate" style={{ color: isChevauchement ? '#f97316' : isConflitSelected ? '#a855f7' : isConflit ? '#ef4444' : isGroupe ? '#10b981' : color }}>
                          {lesson.studentName || 'Élève'}
                        </p>
                        {slotCount >= 3 && (
                          <p className="text-[9px] leading-tight opacity-70" style={{ color: isChevauchement ? '#f97316' : isConflitSelected ? '#a855f7' : isConflit ? '#ef4444' : isGroupe ? '#10b981' : color }}>
                            {lesson.timeLabel} · {lesson.durationMinutes} min
                          </p>
                        )}
                      </div>

                      {/* Actions rapides (survol/focus) — propagation stoppée pour ne pas
                          déclencher le drag ni l'ouverture de l'édition */}

                      {/* Suppression — masqué sur les cours en lecture seule (nonMovable = cours réels
                          dans le Planning intelligent, créneaux d'école, etc.) */}
                      {!lesson.nonMovable && (
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
                      )}

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

                      {/* Fiche élève — visible sur les propositions (envisagé/conflit) ayant un _studentId */}
                      {onViewStudent && (isEnvisage || isConflit) && lesson._studentId && (
                        <button
                          type="button"
                          aria-label="Voir la fiche élève"
                          title="Voir la fiche élève (correction durée, contexte…)"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); onViewStudent(lesson) }}
                          className="absolute bottom-0 left-0 z-20 p-0.5 rounded-tr-md bg-void/50 text-white/80
                                     opacity-0 group-hover:opacity-100 hover:text-guitar-400 transition-opacity
                                     focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-guitar-400"
                        >
                          <UserRound className="w-3 h-3" />
                        </button>
                      )}

                      {/* Modifier la durée — visible sur les propositions (envisagé/conflit) */}
                      {(isEnvisage || isConflit) && lesson._responseId && (
                        <button
                          type="button"
                          aria-label="Modifier la durée du cours"
                          title="Modifier la durée de ce cours"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); setDurationEditLesson(lesson) }}
                          className="absolute top-0 left-0 z-20 p-0.5 rounded-br-md bg-void/50 text-white/80
                                     opacity-0 group-hover:opacity-100 hover:text-guitar-400 transition-opacity
                                     focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-guitar-400"
                        >
                          <Clock className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )
                  })
                })()}
              </div>
            )
          })}
        </div>
      </div>

      {durationEditLesson && (
        <DurationEditPanel
          lesson={durationEditLesson}
          onClose={() => setDurationEditLesson(null)}
          onSaved={(newMinutes) => {
            // Mise à jour optimiste locale (le créneau se redimensionne immédiatement)
            setLocalLessons((prev) => prev.map((l) =>
              l.id === durationEditLesson.id ? { ...l, durationMinutes: newMinutes } : l
            ))
            // Le parent recalcule effective_duration_minutes et relance computeAllProposals
            onDurationChange?.(durationEditLesson, newMinutes)
            setDurationEditLesson(null)
          }}
        />
      )}

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
